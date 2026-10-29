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
from app.scanners.classifier import enrich_finding_with_classification
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.bandit")


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
                self._cached_available = (True, ver)
                return self._cached_available
            except Exception:
                self._cached_available = (True, "cli")
                return self._cached_available

        # Also check via python -m bandit
        try:
            import bandit
            self._cached_available = (True, getattr(bandit, "__version__", "1.8.x"))
        except ImportError:
            self._cached_available = (False, None)
        return self._cached_available

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
        timeout_seconds: int = 600,
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

        def _parse_bandit_results(raw_out: str) -> list[dict[str, Any]]:
            parsed: list[dict[str, Any]] = []
            raw = raw_out.strip()
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

                    # Suppress standard assert statements (B101) and mock test fixtures (B105, B106) inside unit test suites
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

        # Tiered Scanning: Small Python files first (<= 50 KB), Big Python files after (> 50 KB)
        small_files = kwargs.get("small_files") or []
        big_files = kwargs.get("big_files") or []
        small_py = [f for f in small_files if f.lower().endswith(".py")]
        big_py = [f for f in big_files if f.lower().endswith(".py")]

        if small_py or big_py:
            # Tier 1: Small files first loop
            for i in range(0, len(small_py), 40):
                chunk = small_py[i : i + 40]
                chunk_cmd = [exe or sys.executable]
                if not exe:
                    chunk_cmd.extend(["-m", "bandit"])
                chunk_cmd.extend(["-f", "json", "-q", "--exit-zero", *chunk])
                try:
                    ec, out, _ = await self.execute_cmd(chunk_cmd, cwd=workspace_path, timeout_seconds=timeout_seconds)
                    exit_code = max(exit_code or 0, ec)
                    findings.extend(_parse_bandit_results(out))
                except Exception as exc:
                    logger.warning("Bandit tier 1 chunk execution error: %s", exc)

            # Tier 2: Big files after loop
            for i in range(0, len(big_py), 40):
                chunk = big_py[i : i + 40]
                chunk_cmd = [exe or sys.executable]
                if not exe:
                    chunk_cmd.extend(["-m", "bandit"])
                chunk_cmd.extend(["-f", "json", "-q", "--exit-zero", *chunk])
                try:
                    ec, out, _ = await self.execute_cmd(chunk_cmd, cwd=workspace_path, timeout_seconds=timeout_seconds)
                    exit_code = max(exit_code or 0, ec)
                    findings.extend(_parse_bandit_results(out))
                except Exception as exc:
                    logger.warning("Bandit tier 2 chunk execution error: %s", exc)
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
                return ScannerResult(
                    scanner=self.name,
                    scanner_version=version,
                    status="failed",
                    error=f"Bandit execution error: {exc}",
                    duration_seconds=round(time.time() - start_time, 2),
                    exit_code=None,
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
