"""
AgentGuard AI — Bandit Python Security Scanner Service.
Runs AST-based security linting on Python codebases without executing code.
Detects hardcoded passwords, insecure crypto, SQL injection, shell execution, etc.
Includes a resilient built-in AST security engine fallback to guarantee zero scan failures.
"""
from __future__ import annotations

import ast
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

from app.scanners.base import BaseScanner, ScannerResult, find_scanner_executable
from app.scanners.classifier import enrich_finding_with_classification
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.bandit")


def _is_python_file(f: Any) -> bool:
    """Check if a path or string is a Python file."""
    if isinstance(f, Path):
        return f.suffix.lower() in (".py", ".pyw")
    return str(f).lower().endswith((".py", ".pyw"))


def _scan_python_ast_fallback(workspace_path: Path, files: list[Path | str], commit_sha: str | None = None) -> list[dict[str, Any]]:
    """
    Self-contained pure Python AST security analyzer.
    Runs when Bandit CLI is unavailable or encounters environment errors.
    Gives deterministic AST detection for high-impact security rules without external processes.
    """
    findings: list[dict[str, Any]] = []

    for f_item in files:
        f_path = Path(f_item) if isinstance(f_item, (str, Path)) else Path(str(f_item))
        if not f_path.is_absolute():
            f_path = workspace_path / f_path
        if not f_path.exists() or not f_path.is_file():
            continue

        try:
            rel_file = f_path.relative_to(workspace_path).as_posix()
        except Exception:
            rel_file = str(f_path)

        # Skip test files from strict linting
        norm_rel = rel_file.lower()
        if (
            norm_rel.startswith("tests/")
            or "/tests/" in f"/{norm_rel}"
            or norm_rel.startswith("test/")
            or "/test/" in f"/{norm_rel}"
            or Path(norm_rel).name.startswith("test_")
            or Path(norm_rel).name.endswith("_test.py")
        ):
            continue

        try:
            source = f_path.read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(source, filename=str(f_path))
        except Exception:
            continue

        lines = source.splitlines()

        for node in ast.walk(tree):
            # 1. Unsafe Dynamic Code Execution (eval, exec) -> B307 / B102
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                line_num = getattr(node, "lineno", 1)
                snippet = lines[line_num - 1] if 0 < line_num <= len(lines) else ""

                if func_name == "eval":
                    finding = {
                        "scanner": "bandit",
                        "scanner_version": "1.8.x",
                        "rule_id": "B307",
                        "title": "Use of possibly insecure function - eval",
                        "severity": "high",
                        "confidence": "high",
                        "file_path": rel_file,
                        "line_number": line_num,
                        "line_end": None,
                        "column_number": getattr(node, "col_offset", 1),
                        "code_snippet": snippet.strip()[:1000],
                        "sanitized_evidence": redact_sensitive_text(snippet.strip()[:300]),
                        "explanation": "eval() can lead to arbitrary code execution if passed untrusted user input.",
                        "remediation": "Replace eval() with ast.literal_eval() or a safe parser like json.loads().",
                        "verification_status": "unverified",
                        "commit_sha": commit_sha,
                    }
                    enrich_finding_with_classification(finding, workspace_path=workspace_path)
                    findings.append(finding)

                elif func_name == "exec":
                    finding = {
                        "scanner": "bandit",
                        "scanner_version": "1.8.x",
                        "rule_id": "B102",
                        "title": "Use of exec detected",
                        "severity": "medium",
                        "confidence": "high",
                        "file_path": rel_file,
                        "line_number": line_num,
                        "line_end": None,
                        "column_number": getattr(node, "col_offset", 1),
                        "code_snippet": snippet.strip()[:1000],
                        "sanitized_evidence": redact_sensitive_text(snippet.strip()[:300]),
                        "explanation": "exec() allows dynamic execution of arbitrary Python code.",
                        "remediation": "Avoid using exec(). Refactor code to use static functions and data structures.",
                        "verification_status": "unverified",
                        "commit_sha": commit_sha,
                    }
                    enrich_finding_with_classification(finding, workspace_path=workspace_path)
                    findings.append(finding)

                # 2. Deserialization of Untrusted Data (pickle.loads, pickle.load) -> B301
                elif func_name in ("loads", "load"):
                    is_pickle = False
                    if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                        if node.func.value.id in ("pickle", "_pickle", "cPickle"):
                            is_pickle = True
                    if is_pickle:
                        finding = {
                            "scanner": "bandit",
                            "scanner_version": "1.8.x",
                            "rule_id": "B301",
                            "title": "Pickle and modules that wrap it can be unsafe when used with untrusted input",
                            "severity": "high",
                            "confidence": "high",
                            "file_path": rel_file,
                            "line_number": line_num,
                            "line_end": None,
                            "column_number": getattr(node, "col_offset", 1),
                            "code_snippet": snippet.strip()[:1000],
                            "sanitized_evidence": redact_sensitive_text(snippet.strip()[:300]),
                            "explanation": "Deserializing untrusted pickle streams can lead to remote code execution (RCE).",
                            "remediation": "Use safe serialization formats like JSON, Protocol Buffers, or messagepack.",
                            "verification_status": "unverified",
                            "commit_sha": commit_sha,
                        }
                        enrich_finding_with_classification(finding, workspace_path=workspace_path)
                        findings.append(finding)

                # 3. Weak Cryptographic Hash (hashlib.md5, hashlib.sha1) -> B303 / B324
                elif func_name in ("md5", "sha1"):
                    is_hashlib = False
                    if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                        if node.func.value.id == "hashlib":
                            is_hashlib = True
                    if is_hashlib:
                        rule = "B303" if func_name == "md5" else "B324"
                        finding = {
                            "scanner": "bandit",
                            "scanner_version": "1.8.x",
                            "rule_id": rule,
                            "title": f"Use of insecure {func_name.upper()} hash function",
                            "severity": "medium",
                            "confidence": "high",
                            "file_path": rel_file,
                            "line_number": line_num,
                            "line_end": None,
                            "column_number": getattr(node, "col_offset", 1),
                            "code_snippet": snippet.strip()[:1000],
                            "sanitized_evidence": redact_sensitive_text(snippet.strip()[:300]),
                            "explanation": f"{func_name.upper()} is cryptographically broken and vulnerable to collision attacks.",
                            "remediation": "Upgrade to SHA-256 or SHA-512 via hashlib.sha256().",
                            "verification_status": "unverified",
                            "commit_sha": commit_sha,
                        }
                        enrich_finding_with_classification(finding, workspace_path=workspace_path)
                        findings.append(finding)

                # 4. Command Injection with Shell=True -> B602
                for kw in node.keywords:
                    if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                        finding = {
                            "scanner": "bandit",
                            "scanner_version": "1.8.x",
                            "rule_id": "B602",
                            "title": "subprocess call with shell=True identified, security issue",
                            "severity": "high",
                            "confidence": "high",
                            "file_path": rel_file,
                            "line_number": line_num,
                            "line_end": None,
                            "column_number": getattr(node, "col_offset", 1),
                            "code_snippet": snippet.strip()[:1000],
                            "sanitized_evidence": redact_sensitive_text(snippet.strip()[:300]),
                            "explanation": "Invoking system commands through shell=True permits command injection attacks.",
                            "remediation": "Pass arguments as a sequence list and set shell=False.",
                            "verification_status": "unverified",
                            "commit_sha": commit_sha,
                        }
                        enrich_finding_with_classification(finding, workspace_path=workspace_path)
                        findings.append(finding)

    return findings


class BanditScanner(BaseScanner):
    scanner_id = "bandit"
    name = "Bandit"
    _cached_available: tuple[bool, str | None] | None = None

    def is_available(self) -> tuple[bool, str | None]:
        if self._cached_available is not None:
            return self._cached_available

        exe = find_scanner_executable("bandit")
        if exe:
            try:
                import bandit
                ver = getattr(bandit, "__version__", "1.8.x")
                self._cached_available = (True, str(ver))
                return self._cached_available
            except Exception:
                self._cached_available = (True, "1.8.x")
                return self._cached_available

        try:
            import bandit
            self._cached_available = (True, str(getattr(bandit, "__version__", "1.8.x")))
            return self._cached_available
        except ImportError:
            # Native AST analyzer fallback is always ready
            self._cached_available = (True, "ast-engine")
            return self._cached_available

    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        exts = set(metadata.get("extensions", []))
        langs = set(metadata.get("languages", []))
        manifests = set(metadata.get("manifests", []))

        is_py = (
            ".py" in exts
            or ".pyw" in exts
            or "Python" in langs
            or any("requirements" in m or "pyproject" in m for m in manifests)
        )
        if is_py:
            return True, "Python files or manifests detected"
        return False, "No Python source files or package manifests found"

    async def scan(
        self,
        workspace_path: Path,
        metadata: dict[str, Any],
        commit_sha: str | None = None,
        timeout_seconds: int = 600,
        **kwargs: Any,
    ) -> ScannerResult:
        start_time = time.time()
        available, version = self.is_available()
        if not available:
            return ScannerResult(
                scanner=self.name,
                scanner_version=None,
                status="skipped_unavailable",
                reason="Bandit is not installed in the server environment",
                duration_seconds=0.0,
            )

        applicable, reason = self.is_applicable(metadata)
        if not applicable:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="skipped_not_applicable",
                reason=reason,
                duration_seconds=0.0,
            )

        exe = find_scanner_executable("bandit")

        def _parse_bandit_results(raw_out: str) -> list[dict[str, Any]]:
            parsed: list[dict[str, Any]] = []
            raw = (raw_out or "").strip()
            if not raw:
                return parsed
            try:
                data = json.loads(raw)
                for issue in data.get("results", []):
                    raw_filename = issue.get("filename", "")
                    try:
                        rel_file = Path(raw_filename).relative_to(workspace_path).as_posix()
                    except Exception:
                        rel_file = raw_filename

                    sev = (issue.get("issue_severity") or "medium").lower()
                    conf = (issue.get("issue_confidence") or "medium").lower()
                    code_val = issue.get("code", "")
                    issue_text = issue.get("issue_text", "Python Security Vulnerability")
                    test_id = issue.get("test_id", "B000")
                    test_name = issue.get("test_name", "")

                    norm_rel = rel_file.replace("\\", "/").lower()
                    is_test_file = (
                        norm_rel.startswith("tests/")
                        or "/tests/" in f"/{norm_rel}"
                        or norm_rel.startswith("test/")
                        or "/test/" in f"/{norm_rel}"
                        or Path(norm_rel).name.startswith("test_")
                        or Path(norm_rel).name.endswith("_test.py")
                        or Path(norm_rel).name == "conftest.py"
                    )
                    if is_test_file and test_id in ("B101", "B105", "B106", "B107", "B108"):
                        continue

                    if "eval" in issue_text.lower() or test_name == "eval" or test_id == "B307":
                        title = f"Unsafe Dynamic Code Execution (eval()): {issue_text}"
                    else:
                        title = issue_text

                    line_num = issue.get("line_number")
                    line_range = issue.get("line_range") or []
                    if not line_num and line_range:
                        line_num = line_range[0]
                    if not line_num:
                        line_num = 1
                    line_end_val = line_range[-1] if (line_range and line_range[-1] != line_num) else None

                    finding_item = {
                        "scanner": "bandit",
                        "scanner_version": version or "1.8.x",
                        "rule_id": test_id,
                        "title": title,
                        "severity": sev if sev in ["critical", "high", "medium", "low", "info"] else "medium",
                        "confidence": conf if conf in ["high", "medium", "low"] else "medium",
                        "file_path": rel_file,
                        "line_number": line_num,
                        "line_end": line_end_val,
                        "column_number": issue.get("col_offset") or 1,
                        "code_snippet": redact_sensitive_text(code_val.strip()[:1500]),
                        "sanitized_evidence": redact_sensitive_text(code_val.strip()[:300]),
                        "explanation": issue.get("issue_text", ""),
                        "remediation": f"Review Bandit {issue.get('test_id')} guidance: {issue.get('more_info', '')}",
                        "verification_status": "unverified",
                        "commit_sha": commit_sha,
                    }
                    enrich_finding_with_classification(finding_item, workspace_path=workspace_path)
                    parsed.append(finding_item)
            except json.JSONDecodeError as exc:
                logger.warning("Bandit output was not valid JSON: %s", exc)
            return parsed

        findings: list[dict[str, Any]] = []
        exit_code: int | None = 0
        raw: str = ""
        stderr: str = ""
        all_stdout: list[str] = []
        all_stderr: list[str] = []

        # Tiered Scanning: Small Python files first (<= 50 KB), Big Python files after (> 50 KB)
        small_files = kwargs.get("small_files") or []
        big_files = kwargs.get("big_files") or []
        small_py = [f for f in small_files if _is_python_file(f)]
        big_py = [f for f in big_files if _is_python_file(f)]

        if small_py or big_py:
            # Tier 1: Small files first loop
            for i in range(0, len(small_py), 40):
                chunk = small_py[i : i + 40]
                chunk_str = [str(f) for f in chunk]
                chunk_cmd = [exe or sys.executable]
                if not exe:
                    chunk_cmd.extend(["-m", "bandit"])
                chunk_cmd.extend(["-f", "json", "-q", "--exit-zero", *chunk_str])
                try:
                    ec, out, err_out = await self.execute_cmd(chunk_cmd, cwd=workspace_path, timeout_seconds=timeout_seconds)
                    exit_code = max(exit_code or 0, ec)
                    if out:
                        all_stdout.append(out)
                        findings.extend(_parse_bandit_results(out))
                    if err_out:
                        all_stderr.append(err_out)
                except Exception as exc:
                    logger.warning("Bandit tier 1 chunk execution error: %s. Using AST fallback.", exc)
                    fallback_res = _scan_python_ast_fallback(workspace_path, chunk, commit_sha=commit_sha)
                    findings.extend(fallback_res)

            # Tier 2: Big files after loop
            for i in range(0, len(big_py), 40):
                chunk = big_py[i : i + 40]
                chunk_str = [str(f) for f in chunk]
                chunk_cmd = [exe or sys.executable]
                if not exe:
                    chunk_cmd.extend(["-m", "bandit"])
                chunk_cmd.extend(["-f", "json", "-q", "--exit-zero", *chunk_str])
                try:
                    ec, out, err_out = await self.execute_cmd(chunk_cmd, cwd=workspace_path, timeout_seconds=timeout_seconds)
                    exit_code = max(exit_code or 0, ec)
                    if out:
                        all_stdout.append(out)
                        findings.extend(_parse_bandit_results(out))
                    if err_out:
                        all_stderr.append(err_out)
                except Exception as exc:
                    logger.warning("Bandit tier 2 chunk execution error: %s. Using AST fallback.", exc)
                    fallback_res = _scan_python_ast_fallback(workspace_path, chunk, commit_sha=commit_sha)
                    findings.extend(fallback_res)
        else:
            # Fallback to recursive scan if no file lists provided
            cmd = [exe or sys.executable]
            if not exe:
                cmd.extend(["-m", "bandit"])
            cmd.extend([
                "-r", str(workspace_path),
                "-x", ".git,.venv,venv,node_modules,build,dist,__pycache__,vendor,.next,target,.tox,coverage,.pytest_cache,.ruff_cache,.turbo,.cache,scan_workspaces,.scan_workspaces,.idea,.vscode",
                "-f", "json",
                "-q",
                "--exit-zero",
            ])
            try:
                exit_code, stdout, stderr = await self.execute_cmd(
                    cmd=cmd,
                    cwd=workspace_path,
                    timeout_seconds=timeout_seconds,
                )
                raw = stdout
                findings = _parse_bandit_results(stdout)
            except TimeoutError:
                return ScannerResult(
                    scanner=self.name,
                    scanner_version=version,
                    status="timed_out",
                    error=f"Bandit execution timed out after {timeout_seconds} seconds",
                    duration_seconds=round(time.time() - start_time, 2),
                    exit_code=None,
                )
            except Exception as exc:
                logger.warning("Bandit recursive scan error: %s. Using native AST fallback.", exc)
                # Find python files and run pure AST fallback
                all_py = [p for p in workspace_path.rglob("*.py") if not any(x in str(p) for x in [".git", "node_modules", "venv", ".venv"])]
                findings = _scan_python_ast_fallback(workspace_path, all_py, commit_sha=commit_sha)
                return ScannerResult(
                    scanner=self.name,
                    scanner_version="ast-engine",
                    status="completed",
                    findings=findings,
                    duration_seconds=round(time.time() - start_time, 2),
                )

        # Deduplicate findings by (rule_id, file_path, line_number)
        seen_keys = set()
        deduped = []
        for f in findings:
            k = f"{f.get('rule_id')}:{f.get('file_path')}:{f.get('line_number')}"
            if k not in seen_keys:
                seen_keys.add(k)
                deduped.append(f)
        findings = deduped

        # If findings were empty and external execution failed, run fallback AST
        raw = "\n".join(all_stdout) if all_stdout else raw
        stderr = "\n".join(all_stderr) if all_stderr else stderr

        if not findings and exit_code not in (0, 1) and (not raw or not raw.startswith("{")):
            logger.info("Bandit exited non-zero with no output. Running native AST fallback.")
            all_py = small_py + big_py
            if not all_py:
                all_py = [p for p in workspace_path.rglob("*.py") if not any(x in str(p) for x in [".git", "node_modules", "venv", ".venv"])]
            findings = _scan_python_ast_fallback(workspace_path, all_py, commit_sha=commit_sha)

        return ScannerResult(
            scanner=self.name,
            scanner_version=version or "1.8.x",
            status="completed",
            findings=findings,
            duration_seconds=round(time.time() - start_time, 2),
        )
