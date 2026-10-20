"""
AgentGuard AI — Bandit Python Security Scanner Service.
Runs AST-based security linting on Python codebases without executing code.
Detects hardcoded passwords, insecure crypto, SQL injection, shell execution, etc.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

from app.scanners.base import BaseScanner, ScannerResult, find_scanner_executable
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.bandit")


class BanditScanner(BaseScanner):
    scanner_id = "bandit"
    name = "Bandit"

    def is_available(self) -> tuple[bool, str | None]:
        exe = find_scanner_executable("bandit")
        if exe:
            try:
                import bandit
                ver = getattr(bandit, "__version__", "1.8.x")
                return True, ver
            except Exception:
                return True, "cli"

        # Also check via python -m bandit
        try:
            import bandit
            return True, getattr(bandit, "__version__", "1.8.x")
        except ImportError:
            return False, None

    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        exts = set(metadata.get("extensions", []))
        langs = set(metadata.get("languages", []))
        manifests = set(metadata.get("manifests", []))

        is_py = (
            ".py" in exts
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
        timeout_seconds: int = 120,
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

        # Prefer binary or python -m bandit
        exe = find_scanner_executable("bandit")
        cmd = [exe or sys.executable]
        if not exe:
            cmd.extend(["-m", "bandit"])
        cmd.extend(["-r", str(workspace_path), "-x", ".git,.venv,node_modules,build,dist,__pycache__", "-f", "json", "-q"])

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
                status="failed",
                error=str(exc),
                duration_seconds=round(time.time() - start_time, 2),
            )
        except Exception as exc:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="failed",
                error=f"Bandit execution error: {exc}",
                duration_seconds=round(time.time() - start_time, 2),
            )

        findings = []
        raw = stdout.strip()
        if raw:
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
                    code = issue.get("code", "")
                    issue_text = issue.get("issue_text", "Python Security Vulnerability")
                    test_id = issue.get("test_id", "B000")
                    test_name = issue.get("test_name", "")

                    # Suppress standard assert statements (B101) inside unit test suites
                    lower_rel = rel_file.lower()
                    is_test_file = (
                        lower_rel.startswith("tests/")
                        or "/tests/" in lower_rel
                        or lower_rel.startswith("test/")
                        or "/test/" in lower_rel
                        or Path(lower_rel).name.startswith("test_")
                        or Path(lower_rel).name.endswith("_test.py")
                    )
                    if test_id == "B101" and is_test_file:
                        continue

                    if "eval" in issue_text.lower() or test_name == "eval" or test_id == "B307":
                        title = f"Unsafe Dynamic Code Execution (eval()): {issue_text}"
                    else:
                        title = issue_text

                    findings.append({
                        "scanner": "bandit",
                        "scanner_version": version or "1.8.x",
                        "rule_id": test_id,
                        "title": title,
                        "severity": sev if sev in ["critical", "high", "medium", "low", "info"] else "medium",
                        "confidence": conf if conf in ["high", "medium", "low"] else "medium",
                        "file_path": rel_file,
                        "line_number": issue.get("line_number"),
                        "column_number": issue.get("col_offset"),
                        "sanitized_evidence": redact_sensitive_text(code.strip()[:300]),
                        "explanation": issue.get("issue_text", ""),
                        "remediation": f"Review Bandit {issue.get('test_id')} guidance: {issue.get('more_info', '')}",
                        "verification_status": "unverified",
                        "commit_sha": commit_sha,
                    })
            except json.JSONDecodeError as exc:
                logger.warning("Bandit output was not valid JSON: %s (stderr: %s)", exc, stderr[:200])

        if not findings and exit_code not in (0, 1) and (not raw or not raw.startswith("{")):
            clean_err = redact_sensitive_text(stderr.strip()[:300]) or f"Bandit returned exit code {exit_code}"
            logger.warning("Bandit execution failed (code %d): %s", exit_code, clean_err)
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
