"""
AgentGuard AI — detect-secrets Scanner Service.
Scans codebases for hardcoded credentials, API keys, private keys, and high-entropy secrets.
Extracts snippets safely with evidence redaction without executing any code.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

from app.scanners.base import BaseScanner, ScannerResult, find_scanner_executable
from app.scanners.classifier import enrich_finding_with_classification
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.detect_secrets")


class DetectSecretsScanner(BaseScanner):
    scanner_id = "detect_secrets"
    name = "detect-secrets"

    def is_available(self) -> tuple[bool, str | None]:
        exe = find_scanner_executable("detect-secrets")
        if exe:
            try:
                import detect_secrets
                ver = getattr(detect_secrets, "__version__", "1.5.0")
                return True, str(ver)
            except Exception:
                return True, "cli"

        try:
            import detect_secrets
            return True, getattr(detect_secrets, "__version__", "1.5.0")
        except ImportError:
            return False, None

    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        # detect-secrets is universally applicable to any software repository
        return True, "Code files present for credential analysis"

    async def scan(
        self,
        workspace_path: Path,
        metadata: dict[str, Any],
        commit_sha: str | None = None,
        timeout_seconds: int = 600,
    ) -> ScannerResult:
        start_time = time.time()
        available, version = self.is_available()
        if not available:
            return ScannerResult(
                scanner=self.name,
                scanner_version=None,
                status="skipped_unavailable",
                reason="detect-secrets is not installed in the server environment",
                duration_seconds=0.0,
            )

        exe = find_scanner_executable("detect-secrets")
        cmd = [exe or sys.executable]
        if not exe:
            cmd.extend(["-m", "detect_secrets"])
        cmd.extend(["scan", "--all-files", "--exclude-files", r"(\.git|node_modules|\.venv|venv|build|dist|vendor|__pycache__|\.next|target|\.tox|coverage|\..*_cache|\.cache|scan_workspaces|\.scan_workspaces|\.idea|\.vscode|.*\.min\.js$|.*\.map$|.*lock.*)", str(workspace_path)])

        try:
            exit_code, stdout, stderr = await self.execute_cmd(
                cmd=cmd,
                cwd=workspace_path,
                timeout_seconds=timeout_seconds,
            )
        except TimeoutError as exc:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="timed_out",
                error=f"detect-secrets execution timed out after {timeout_seconds} seconds",
                duration_seconds=round(time.time() - start_time, 2),
            )
        except Exception as exc:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="failed",
                error=f"detect-secrets execution error: {exc}",
                duration_seconds=round(time.time() - start_time, 2),
            )

        findings = []
        raw = stdout.strip()
        if raw:
            try:
                data = json.loads(raw)
                results_map = data.get("results", {})
                for file_key, secret_items in results_map.items():
                    try:
                        rel_file = Path(file_key).relative_to(workspace_path).as_posix()
                    except Exception:
                        rel_file = Path(file_key).as_posix()

                    # Suppress mock credentials and test fixtures in unit test suites
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
                    if is_test_file:
                        continue

                    target_file = workspace_path / rel_file
                    lines = []
                    try:
                        if target_file.exists() and target_file.is_file():
                            lines = target_file.read_text(encoding="utf-8", errors="replace").splitlines()
                    except Exception as exc:
                        logger.debug("Failed reading file %s during secret extraction: %s", target_file, exc)

                    for sec in secret_items:
                        sec_type = sec.get("type", "Secret")
                        line_no = sec.get("line_number")
                        snippet = ""
                        if line_no and 1 <= line_no <= len(lines):
                            snippet = lines[line_no - 1].strip()

                        # Enrich generic entropy classifications with known token signatures
                        if "ghp_" in snippet or "gho_" in snippet or "ghu_" in snippet:
                            sec_type = "GitHub Personal Access Token"
                        elif "glpat-" in snippet:
                            sec_type = "GitLab Personal Access Token"
                        elif "AKIA" in snippet:
                            sec_type = "AWS Access Key ID"
                        elif "nvapi-" in snippet:
                            sec_type = "NVIDIA API Key"
                        elif ("BEGIN " + "PRIVATE KEY") in snippet or ("BEGIN " + "RSA PRIVATE KEY") in snippet:
                            sec_type = "Private Key"

                        # Classify severity
                        lower_type = sec_type.lower()
                        if any(k in lower_type for k in ["private key", "github", "slack", "jwt"]):
                            sev = "critical"
                        elif any(k in lower_type for k in ["aws", "basic auth", "password", "token"]):
                            sev = "high"
                        else:
                            sev = "medium"

                        rule_slug = f"DS-{sec_type.replace(' ', '-').upper()}"
                        finding_item = {
                            "scanner": "detect_secrets",
                            "scanner_version": version or "1.5.0",
                            "rule_id": rule_slug[:64],
                            "title": f"Potential Hardcoded Secret: {sec_type}",
                            "severity": sev,
                            "confidence": "high" if "verified" in sec else "medium",
                            "file_path": rel_file,
                            "line_number": line_no,
                            "line_end": None,
                            "column_number": 1,
                            "code_snippet": None,
                            "sanitized_evidence": redact_sensitive_text(snippet[:250]),
                            "explanation": (
                                f"detect-secrets detected a potential credential of type '{sec_type}' at line {line_no}. "
                                "Hardcoded credentials in version control introduce severe unauthorized access risks."
                            ),
                            "remediation": "Revoke the credential from the respective provider and migrate to an environment variable or secrets manager.",
                            "verification_status": "unverified",
                            "commit_sha": commit_sha,
                        }
                        enrich_finding_with_classification(finding_item, workspace_path=workspace_path)
                        findings.append(finding_item)
            except json.JSONDecodeError as exc:
                logger.warning("Scanner parser encountered invalid JSON output from detect-secrets utility: %s", exc)

        if not findings and exit_code != 0 and (not raw or not raw.startswith("{")):
            clean_err = redact_sensitive_text(stderr.strip()[:300]) or f"detect-secrets returned exit code {exit_code}"
            logger.warning("Scanner execution completed with non-zero exit code %d: %s", exit_code, clean_err)
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="failed",
                error=clean_err,
                duration_seconds=round(time.time() - start_time, 2),
            )

        return ScannerResult(
            scanner=self.name,
            scanner_version=version,
            status="completed",
            findings=findings,
            duration_seconds=round(time.time() - start_time, 2),
        )
