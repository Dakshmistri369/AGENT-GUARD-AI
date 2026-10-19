"""
AgentGuard AI — Solution Service.
Generates exact, actionable remediation solutions for security scan findings:
- Precision code diffs (Before / After unified patches)
- CLI dependency upgrade commands (npm, pip, go, cargo)
- Secret extraction & environment variable redaction
- Repository-wide consolidated fix plans with downloadable git apply patches
- Optional AI-enhanced deep reasoning via NVIDIA Nemotron
"""
from __future__ import annotations

import difflib
import logging
import re
from typing import Any

from app.ai.service import AIService
from app.models.finding import Finding
from app.schemas.solution import (
    FileSolutionGroup,
    FindingSolution,
    RepositorySolutionPlan,
    SolutionType,
)

logger = logging.getLogger("agentguard.services.solution")


def _generate_unified_diff(
    file_path: str | None,
    line_number: int | None,
    before_code: str | None,
    after_code: str | None,
) -> str | None:
    """Generate a clean unified diff string between before_code and after_code."""
    if not before_code or not after_code:
        return None

    path_label = (file_path or "unknown/file").replace("\\", "/")
    before_lines = before_code.splitlines(keepends=True)
    after_lines = after_code.splitlines(keepends=True)

    diff_lines = list(
        difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=f"a/{path_label}",
            tofile=f"b/{path_label}",
            lineterm="",
        )
    )
    if not diff_lines:
        return None
    return "".join(diff_lines)


def _extract_pkg_info_from_osv(
    title: str, evidence: str | None, file_path: str | None = None
) -> tuple[str | None, str | None, str]:
    """
    Extract package name, vulnerable version, and ecosystem from an OSV finding.
    Example title: '@vue/server-renderer@3.5.39: GHSA-g2v6-rqmx-r4w6'
    or 'axios@1.18.1: CVE-2023-45857'
    """
    text = f"{title} {evidence or ''}"
    file_lower = (file_path or "").lower()

    # Match @scope/pkg@version or pkg@version
    pkg_match = re.search(r"(@?[a-zA-Z0-9_\-\.\/]+)@([0-9]+\.[0-9]+[a-zA-Z0-9_\.\-]*)", text)
    pkg_name = None
    version = None
    if pkg_match:
        pkg_name = pkg_match.group(1)
        version = pkg_match.group(2)
    else:
        colon_match = re.search(r"^([a-zA-Z0-9_\-\.\/]+):", title)
        if colon_match:
            pkg_name = colon_match.group(1)

    # Determine ecosystem
    if (
        "requirements" in file_lower
        or file_lower.endswith((".py", ".txt"))
        or "setup.py" in file_lower
        or "pipfile" in file_lower
        or "requirements" in text.lower()
    ):
        ecosystem = "pip"
    elif (
        (pkg_name and pkg_name.startswith("@"))
        or "package" in file_lower
        or file_lower.endswith((".json", ".js", ".ts", ".jsx", ".tsx"))
        or "node_modules" in text.lower()
        or "package.json" in text.lower()
    ):
        ecosystem = "npm"
    else:
        ecosystem = "npm"

    return pkg_name, version, ecosystem


class SolutionService:
    """Generates exact, actionable fixes for findings and complete repository fix plans."""

    @staticmethod
    def generate_solution_for_finding(
        finding: Finding,
        ai_service: AIService | None = None,
    ) -> FindingSolution:
        """
        Generate a concrete Before/After code diff, CLI remediation command,
        and verification steps for a security finding.
        """
        scanner = (finding.scanner or "").lower()
        rule_id = (finding.rule_id or "").upper()
        title = finding.title or "Security Issue"
        file_path = (finding.file_path or "source_code").replace("\\", "/")
        line_num = finding.line_number
        evidence = finding.sanitized_evidence or ""

        # ── 1. OSV-SCANNER (Dependency CVEs) ─────────────────────────────────
        if "osv" in scanner or "cve" in rule_id.lower() or "ghsa" in rule_id.lower():
            pkg_name, old_ver, ecosystem = _extract_pkg_info_from_osv(title, evidence, file_path)
            pkg_display = pkg_name or "vulnerable-package"

            if ecosystem == "pip" or file_path.endswith((".py", ".txt")) or "requirements" in file_path.lower():
                cli_cmd = f"pip install --upgrade {pkg_display}"
                manifest_file = "requirements.txt"
                before_c = f"{pkg_display}=={old_ver or '1.0.0'}"
                after_c = f"{pkg_display}>={old_ver or '1.0.0'},!=vulnerable"
                verify = f"pip-audit --desc"
            elif ecosystem == "npm" or file_path.endswith((".json", ".js", ".ts")):
                cli_cmd = f"npm install {pkg_display}@latest"
                manifest_file = "package.json"
                before_c = f'  "dependencies": {{\n    "{pkg_display}": "^{old_ver or "1.0.0"}"\n  }}'
                after_c = f'  "dependencies": {{\n    "{pkg_display}": "^latest"\n  }}'
                verify = f"npm audit --json"
            else:
                cli_cmd = f"npm install {pkg_display}@latest"
                manifest_file = file_path
                before_c = f"{pkg_display}: {old_ver or 'vulnerable'}"
                after_c = f"{pkg_display}: patched"
                verify = "osv-scanner --lockfile=..."

            diff = _generate_unified_diff(manifest_file, 1, before_c, after_c)
            return FindingSolution(
                finding_id=finding.id,
                title=title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=manifest_file,
                line_number=line_num,
                solution_type="dependency_upgrade",
                action_summary=f"Upgrade {pkg_display} to the latest patched release",
                cli_command=cli_cmd,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation=f"A known CVE/GHSA advisory affects {pkg_display}. Upgrading to a patched version eliminates the vulnerable code path.",
                verification_step=f"Run `{verify}` to confirm zero outstanding vulnerabilities in your dependency tree.",
                is_automated_patch=True,
            )

        # ── 2. DETECT-SECRETS (Hardcoded Credentials) ───────────────────────
        if "detect_secrets" in scanner or "secret" in rule_id.lower():
            # Extract possible variable name from evidence
            var_match = re.search(r"([A-Za-z0-9_]+)\s*=\s*['\"][^'\"]+['\"]", evidence)
            var_name = var_match.group(1).upper() if var_match else "SECURITY_CREDENTIAL"

            is_python = file_path.endswith(".py")
            if is_python:
                before_c = evidence.strip() if evidence else f'{var_name} = "ghp_xxxxxxxxxxxx"'
                after_c = f'import os\n{var_name} = os.getenv("{var_name}")\nif not {var_name}:\n    raise RuntimeError("Missing required environment variable: {var_name}")'
            else:
                before_c = evidence.strip() if evidence else f'const {var_name} = "ghp_xxxxxxxxxxxx";'
                after_c = f'const {var_name} = process.env.{var_name};\nif (!{var_name}) {{\n  throw new Error("Missing required environment variable: {var_name}");\n}}'

            cli_cmd = f'echo "{var_name}=<YOUR_SECRET_VALUE>" >> .env && echo ".env" >> .gitignore'
            diff = _generate_unified_diff(file_path, line_num, before_c, after_c)

            return FindingSolution(
                finding_id=finding.id,
                title=title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=file_path,
                line_number=line_num,
                solution_type="secret_removal",
                action_summary=f"Extract hardcoded {var_name} to environment variables and .env file",
                cli_command=cli_cmd,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation="Hardcoded secrets in source control expose production credentials to anyone with read access. Loading from environment variables isolates secrets from the codebase.",
                verification_step="Run `detect-secrets scan` or git commit hook to ensure no raw secrets remain in the repository.",
                is_automated_patch=True,
            )

        # ── 3. BANDIT (Python AST Security Flaws) ───────────────────────────
        if "bandit" in scanner or rule_id.startswith("B"):
            # B110: Try, Except, Pass
            if rule_id == "B110" or "pass" in title.lower():
                before_c = evidence.strip() if evidence else "try:\n    perform_action()\nexcept Exception:\n    pass"
                after_c = (
                    "import logging\n"
                    "logger = logging.getLogger(__name__)\n\n"
                    "try:\n"
                    "    perform_action()\n"
                    "except Exception as exc:\n"
                    '    logger.warning("Suppressed non-fatal exception: %s", exc, exc_info=True)'
                )
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Replace silent exception suppression (try-except-pass) with structured logging",
                    cli_command=f"python -m bandit -r {file_path} -t B110",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="Silent exception swallowing obscures fatal errors, permission denials, and unexpected states. Logging the exception preserves operational visibility while keeping failure handling controlled.",
                    verification_step=f"Run `bandit -r {file_path} -t B110` to verify the silent pass rule is cleared.",
                    is_automated_patch=True,
                )

            # B112: Try, Except, Continue
            if rule_id == "B112" or "continue" in title.lower():
                before_c = evidence.strip() if evidence else "try:\n    item = parse()\nexcept Exception:\n    continue"
                after_c = (
                    "try:\n"
                    "    item = parse()\n"
                    "except Exception as exc:\n"
                    '    logger.warning("Skipping invalid item due to parse error: %s", exc)\n'
                    "    continue"
                )
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Log exception details before loop iteration continue",
                    cli_command=f"python -m bandit -r {file_path} -t B112",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="Silently continuing loop execution on exceptions can cause undetected data loss or infinite loops. Logging the exception allows diagnostic traceability.",
                    verification_step=f"Run `bandit -r {file_path} -t B112` to verify clean loop exception handling.",
                    is_automated_patch=True,
                )

            # B404 / B603 / B607: Subprocess Security
            if rule_id in ["B404", "B603", "B607"] or "subprocess" in title.lower():
                before_c = evidence.strip() if evidence else "process = subprocess.Popen(['ffmpeg', '-i', filename], shell=True)"
                after_c = (
                    "import shutil\n"
                    "import subprocess\n\n"
                    "# 1. Resolve full executable path to prevent binary hijacking\n"
                    'binary_path = shutil.which("ffmpeg")\n'
                    "if not binary_path:\n"
                    '    raise FileNotFoundError("Executable ffmpeg not found in system PATH")\n\n'
                    "# 2. Pass arguments as a validated list, avoiding shell=True\n"
                    "cmd = [binary_path, '-i', str(filename)]\n"
                    "process = subprocess.Popen(cmd, shell=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)"
                )
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Harden subprocess execution with shutil.which and explicit shell=False",
                    cli_command=f"python -m bandit -r {file_path} -t B404,B603,B607",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="Using relative binary paths or shell=True allows local binary planting or command injection. Explicitly verifying the absolute path via shutil.which() and passing strict argument lists prevents injection vectors.",
                    verification_step=f"Run `bandit -r {file_path} -t B404,B603,B607` to confirm subprocess hardening.",
                    is_automated_patch=True,
                )

            # B101: Assert used in production code
            if rule_id == "B101" or "assert" in title.lower():
                before_c = evidence.strip() if evidence else "assert user.is_authenticated, 'Unauthorized'"
                after_c = "if not user.is_authenticated:\n    raise PermissionError('Unauthorized access denied')"
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Replace Python assert statement with explicit conditional exception",
                    cli_command=f"python -m bandit -r {file_path} -t B101",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="Python removes assert statements when compiled with the -O (optimize) flag, completely disabling security checks. Explicit if/raise checks cannot be disabled by runtime flags.",
                    verification_step=f"Run `bandit -r {file_path} -t B101` to verify all asserts are replaced.",
                    is_automated_patch=True,
                )

            # B324 / B303: Weak Hash Algorithms (MD5, SHA1)
            if rule_id in ["B324", "B303"] or "md5" in title.lower() or "sha1" in title.lower():
                before_c = evidence.strip() if evidence else "digest = hashlib.md5(data.encode()).hexdigest()"
                after_c = (
                    "# For cryptographic security:\n"
                    "digest = hashlib.sha256(data.encode()).hexdigest()\n"
                    "# Or if non-security checksum:\n"
                    "# digest = hashlib.md5(data.encode(), usedforsecurity=False).hexdigest()"
                )
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Upgrade weak MD5/SHA1 hash algorithm to SHA-256",
                    cli_command=f"python -m bandit -r {file_path} -t B324,B303",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="MD5 and SHA-1 suffer from well-documented collision vulnerabilities. Upgrading to SHA-256 protects data integrity against collision attacks.",
                    verification_step=f"Run `bandit -r {file_path} -t B324` to confirm hash algorithm compliance.",
                    is_automated_patch=True,
                )

            # B506: Unsafe YAML Load
            if rule_id == "B506" or "yaml" in title.lower():
                before_c = evidence.strip() if evidence else "config = yaml.load(file_stream)"
                after_c = "config = yaml.safe_load(file_stream)"
                diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
                return FindingSolution(
                    finding_id=finding.id,
                    title=title,
                    severity=finding.severity,
                    scanner=finding.scanner,
                    rule_id=finding.rule_id,
                    file_path=file_path,
                    line_number=line_num,
                    solution_type="code_diff",
                    action_summary="Replace arbitrary code-executing yaml.load() with yaml.safe_load()",
                    cli_command=f"python -m bandit -r {file_path} -t B506",
                    before_code=before_c,
                    after_code=after_c,
                    diff=diff,
                    explanation="yaml.load() can instantiate arbitrary Python objects leading to Remote Code Execution (RCE). yaml.safe_load() restricts parsing to simple types.",
                    verification_step=f"Run `bandit -r {file_path} -t B506` to verify safe YAML loading.",
                    is_automated_patch=True,
                )

        # ── 4. SEMGREP & GENERAL CODE VULNERABILITIES ────────────────────────
        # Heuristics for common web vulnerabilities (CORS, SQLi, XSS, CSRF, Path Traversal)
        title_lower = title.lower()
        if "cors" in title_lower or "wildcard" in title_lower:
            before_c = evidence.strip() if evidence else 'cors = CORS(app, origins="*")'
            after_c = (
                'import os\n'
                'allowed = os.getenv("ALLOWED_ORIGINS", "https://app.example.com").split(",")\n'
                'cors = CORS(app, origins=allowed, supports_credentials=True)'
            )
            diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
            return FindingSolution(
                finding_id=finding.id,
                title=title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=file_path,
                line_number=line_num,
                solution_type="security_config",
                action_summary="Restrict CORS origins from wildcard '*' to an explicit trusted domain allowlist",
                cli_command=None,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation="Allowing wildcard origins ('*') with credentials permits malicious external domains to make authenticated cross-origin requests.",
                verification_step="Check OPTIONS pre-flight response headers in test suite to verify restricted Access-Control-Allow-Origin.",
                is_automated_patch=True,
            )

        if "sql" in title_lower or "injection" in title_lower:
            before_c = evidence.strip() if evidence else f'query = f"SELECT * FROM users WHERE id = \'{user_input}\'"'
            after_c = (
                '# Use parameterized query or ORM query builder\n'
                'cursor.execute("SELECT * FROM users WHERE id = %s", (user_input,))'
            )
            diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
            return FindingSolution(
                finding_id=finding.id,
                title=title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=file_path,
                line_number=line_num,
                solution_type="code_diff",
                action_summary="Parameterize database query to eliminate SQL injection vulnerability",
                cli_command=None,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation="Direct string concatenation into SQL statements permits attackers to manipulate query logic. Parameterization ensures input values are treated purely as data literals.",
                verification_step="Execute automated unit tests with SQL injection payloads (e.g. \"' OR '1'='1\") to confirm rejection.",
                is_automated_patch=True,
            )

        if "path traversal" in title_lower or "directory traversal" in title_lower:
            before_c = evidence.strip() if evidence else "filepath = os.path.join(BASE_DIR, user_filename)"
            after_c = (
                "safe_path = os.path.abspath(os.path.join(BASE_DIR, user_filename))\n"
                "if not safe_path.startswith(os.path.abspath(BASE_DIR)):\n"
                '    raise PermissionError("Access outside permitted directory rejected")'
            )
            diff = _generate_unified_diff(file_path, line_num, before_c, after_c)
            return FindingSolution(
                finding_id=finding.id,
                title=title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=file_path,
                line_number=line_num,
                solution_type="code_diff",
                action_summary="Enforce strict canonical directory bounds check against path traversal",
                cli_command=None,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation="Unsanitized paths containing '../' sequences allow attackers to traverse outside the designated directory and read sensitive system files.",
                verification_step="Run security unit test supplying '../../etc/passwd' to verify file access is blocked.",
                is_automated_patch=True,
            )

        # ── 5. DEFAULT REASONED SOLUTION FALLBACK ────────────────────────────
        before_c = evidence.strip() if evidence else "# Identified vulnerable pattern"
        after_c = (
            f"# Remediation for {title}:\n"
            f"# {finding.remediation or 'Apply defensive input validation and least-privilege boundary checks.'}"
        )
        diff = _generate_unified_diff(file_path, line_num, before_c, after_c)

        return FindingSolution(
            finding_id=finding.id,
            title=title,
            severity=finding.severity,
            scanner=finding.scanner,
            rule_id=finding.rule_id,
            file_path=file_path,
            line_number=line_num,
            solution_type="code_diff",
            action_summary=f"Remediate {title} at {file_path}:{line_num or 1}",
            cli_command=None,
            before_code=before_c,
            after_code=after_c,
            diff=diff,
            explanation=finding.explanation or "Apply standard secure coding practices and defensive validation.",
            verification_step=finding.remediation or "Re-scan repository to confirm finding resolution.",
            is_automated_patch=bool(diff),
        )

    @classmethod
    async def enhance_solution_with_ai(
        cls,
        finding: Finding,
        ai_service: AIService,
    ) -> FindingSolution:
        """
        Invoke NVIDIA Nemotron / AI Service to generate an advanced, context-aware
        code solution for the specified finding.
        """
        from app.schemas.ai import ExplainFindingRequest

        request = ExplainFindingRequest(
            title=finding.title,
            severity=finding.severity,
            scanner=finding.scanner,
            rule_id=finding.rule_id,
            file_path=finding.file_path,
            line_number=finding.line_number,
            sanitized_evidence=finding.sanitized_evidence,
        )

        try:
            explanation_res = await ai_service.explain_finding(request)
            fix_example = explanation_res.fix_example or ""

            # Attempt to parse Before / After from the AI response
            before_c = None
            after_c = None
            if "Before:" in fix_example and "After:" in fix_example:
                parts = fix_example.split("After:")
                before_part = parts[0].replace("Before:", "").strip()
                after_part = parts[1].strip()
                before_c = before_part
                after_c = after_part
            else:
                before_c = finding.sanitized_evidence or "# Vulnerable code snippet"
                after_c = fix_example if fix_example else "# Remediated secure implementation"

            diff = _generate_unified_diff(finding.file_path, finding.line_number, before_c, after_c)

            return FindingSolution(
                finding_id=finding.id,
                title=finding.title,
                severity=finding.severity,
                scanner=finding.scanner,
                rule_id=finding.rule_id,
                file_path=finding.file_path,
                line_number=finding.line_number,
                solution_type="code_diff",
                action_summary=explanation_res.summary[:140],
                cli_command=None,
                before_code=before_c,
                after_code=after_c,
                diff=diff,
                explanation=explanation_res.root_cause + " " + explanation_res.impact,
                verification_step=explanation_res.verification_steps,
                is_automated_patch=bool(diff),
                model_used=explanation_res.model_used,
            )
        except Exception as exc:
            logger.warning("AI enhancement failed: %s; falling back to heuristic solution", exc)
            return cls.generate_solution_for_finding(finding)

    @classmethod
    def generate_repository_solution_plan(
        cls,
        scan_id: int,
        repository_id: int | None,
        findings: list[Finding],
    ) -> RepositorySolutionPlan:
        """
        Compile an end-to-end fix plan for the entire repository scan:
        - Individual FindingSolutions for all detected flaws
        - Aggregated terminal CLI commands (e.g. combined npm/pip updates)
        - Grouped file patches and unified git apply patch
        """
        solutions: list[FindingSolution] = []
        file_map: dict[str, list[FindingSolution]] = {}

        npm_pkgs_to_update: set[str] = set()
        pip_pkgs_to_update: set[str] = set()
        quick_fix_cmds: list[str] = []

        code_diffs = 0
        dep_upgrades = 0
        secret_removals = 0

        for f in findings:
            sol = cls.generate_solution_for_finding(f)
            solutions.append(sol)

            if sol.solution_type == "dependency_upgrade":
                dep_upgrades += 1
                if sol.cli_command:
                    if sol.cli_command.startswith("npm install "):
                        pkg = sol.cli_command.replace("npm install ", "")
                        npm_pkgs_to_update.add(pkg)
                    elif sol.cli_command.startswith("pip install --upgrade "):
                        pkg = sol.cli_command.replace("pip install --upgrade ", "")
                        pip_pkgs_to_update.add(pkg)
                    else:
                        quick_fix_cmds.append(sol.cli_command)
            elif sol.solution_type == "secret_removal":
                secret_removals += 1
                if sol.cli_command and sol.cli_command not in quick_fix_cmds:
                    quick_fix_cmds.append(sol.cli_command)
            else:
                code_diffs += 1

            target_file = (sol.file_path or "unassigned_fixes").replace("\\", "/")
            if target_file not in file_map:
                file_map[target_file] = []
            file_map[target_file].append(sol)

        # Consolidate npm & pip batch updates into single one-liners
        if npm_pkgs_to_update:
            combined_npm = f"npm install {' '.join(sorted(npm_pkgs_to_update))}"
            quick_fix_cmds.insert(0, combined_npm)
        if pip_pkgs_to_update:
            combined_pip = f"pip install --upgrade {' '.join(sorted(pip_pkgs_to_update))}"
            quick_fix_cmds.insert(0, combined_pip)

        # Assemble file groups and full repository patch
        file_groups: list[FileSolutionGroup] = []
        full_patch_segments: list[str] = []

        for fpath, f_solutions in file_map.items():
            file_diffs = [s.diff for s in f_solutions if s.diff]
            combined_patch = "\n".join(file_diffs) if file_diffs else None
            if combined_patch:
                full_patch_segments.append(combined_patch)

            file_groups.append(
                FileSolutionGroup(
                    file_path=fpath,
                    findings_count=len(f_solutions),
                    solutions=f_solutions,
                    combined_patch=combined_patch,
                )
            )

        full_unified_patch = "\n\n".join(full_patch_segments) if full_patch_segments else None

        return RepositorySolutionPlan(
            scan_id=scan_id,
            repository_id=repository_id,
            total_solutions=len(solutions),
            code_diffs_count=code_diffs,
            dependency_upgrades_count=dep_upgrades,
            secret_removals_count=secret_removals,
            quick_fix_cli_commands=quick_fix_cmds,
            file_groups=file_groups,
            full_unified_patch=full_unified_patch,
            solutions=solutions,
        )
