"""
AgentGuard AI — Semgrep Multi-Language SAST Scanner Service.
Executes lightweight, static pattern analysis rules without compiling or running untrusted code.
Supports Python, JavaScript, TypeScript, Go, Java, Rust, C, C++, Ruby, PHP.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.scanners.base import BaseScanner, ScannerResult, find_scanner_executable
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.semgrep")

SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".java",
    ".rs", ".c", ".cpp", ".cc", ".h", ".hpp", ".rb", ".php",
}


class SemgrepScanner(BaseScanner):
    scanner_id = "semgrep"
    name = "Semgrep"
    _cached_available: tuple[bool, str | None] | None = None

    def is_available(self) -> tuple[bool, str | None]:
        if self._cached_available is not None:
            return self._cached_available
        exe = find_scanner_executable("semgrep")
        if not exe:
            self._cached_available = (False, None)
            return self._cached_available
        try:
            import semgrep
            ver = getattr(semgrep, "__version__", "1.180.x")
            self._cached_available = (True, str(ver))
        except Exception:
            self._cached_available = (True, "cli")
        return self._cached_available

    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        exts = set(metadata.get("extensions", []))
        common = exts.intersection(SUPPORTED_EXTENSIONS)
        if common:
            return True, f"Supported programming language files detected ({', '.join(sorted(list(common))[:4])})"

        # Also inspect detected language names
        supported_langs = {"Python", "JavaScript", "TypeScript", "Go", "Java", "Rust", "C", "C++", "Ruby", "PHP", "HTML", "Vue"}
        langs = set(metadata.get("languages", []))
        common_langs = langs.intersection(supported_langs)
        if common_langs:
            return True, f"Supported programming language detected ({', '.join(sorted(list(common_langs))[:3])})"

        return False, "No Semgrep-supported language files (Python, JS/TS, Go, Java, Rust, C/C++) found"

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
                reason="Semgrep CLI is not installed or available on the host PATH",
                duration_seconds=0.0,
                exit_code=None,
            )

        applicable, reason = self.is_applicable(metadata)
        if not applicable:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="skipped_not_applicable",
                reason=reason,
                duration_seconds=0.0,
                exit_code=0,
            )

        exe = find_scanner_executable("semgrep")
        if not exe:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="skipped_unavailable",
                reason="Semgrep binary not found",
                exit_code=None,
            )

        from app.config import get_settings
        settings = get_settings()
        rule_timeout = str(settings.semgrep_rule_timeout_seconds if settings.semgrep_rule_timeout_seconds > 0 else 15)

        cmd = [
            exe,
            "scan",
            "--config", "p/default",
            "--no-git-ignore",
            "--exclude", ".git",
            "--exclude", "node_modules",
            "--exclude", ".venv",
            "--exclude", "venv",
            "--exclude", "build",
            "--exclude", "dist",
            "--exclude", "vendor",
            "--exclude", "__pycache__",
            "--exclude", ".next",
            "--exclude", "target",
            "--exclude", ".tox",
            "--exclude", "coverage",
            "--exclude", ".pytest_cache",
            "--exclude", ".ruff_cache",
            "--exclude", ".turbo",
            "--exclude", ".cache",
            "--exclude", "scan_workspaces",
            "--exclude", ".scan_workspaces",
            "--exclude", ".idea",
            "--exclude", ".vscode",
            "--exclude", "*.min.js",
            "--exclude", "*.min.css",
            "--exclude", "*.mp4",
            "--exclude", "*.pptx",
            "--exclude", "*.docx",
            "--exclude", "*.pdf",
            "--exclude", "*.zip",
            "--exclude", "*.tar*",
            "--exclude", "*.parquet",
            "--max-target-bytes", "1000000",
            "--timeout", rule_timeout,
            "--jobs", str(settings.scanner_concurrency_limit),
            "--max-memory", "2048",
            "--json",
            "--quiet",
            "--disable-version-check",
            str(workspace_path),
        ]

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
                error=f"Semgrep execution timed out after {timeout_seconds} seconds",
                duration_seconds=round(time.time() - start_time, 2),
                exit_code=None,
            )
        except Exception as exc:
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="failed",
                error=f"Semgrep execution error: {exc}",
                duration_seconds=round(time.time() - start_time, 2),
                exit_code=None,
            )

        findings = []
        raw = stdout.strip()
        if raw:
            try:
                data = json.loads(raw)
                for res in data.get("results", []):
                    path_str = res.get("path", "")
                    try:
                        rel_file = Path(path_str).relative_to(workspace_path).as_posix()
                    except Exception:
                        rel_file = path_str

                    extra = res.get("extra", {})
                    sem_sev = (extra.get("severity") or "WARNING").upper()
                    meta_dict = extra.get("metadata", {})
                    sec_sev_score = meta_dict.get("security-severity")

                    # Severity mapping
                    if sec_sev_score:
                        try:
                            score_val = float(sec_sev_score)
                            if score_val >= 9.0:
                                sev = "critical"
                            elif score_val >= 7.0:
                                sev = "high"
                            elif score_val >= 4.0:
                                sev = "medium"
                            else:
                                sev = "low"
                        except (ValueError, TypeError):
                            sev = "high" if sem_sev == "ERROR" else "medium"
                    else:
                        if sem_sev == "ERROR":
                            sev = "high"
                        elif sem_sev == "WARNING":
                            sev = "medium"
                        else:
                            sev = "low"

                    lines_str = extra.get("lines", "")
                    remediation = (
                        meta_dict.get("fix")
                        or meta_dict.get("remediation")
                        or meta_dict.get("shortlink")
                        or "Review Semgrep rule guidance and refactor vulnerable code pattern."
                    )

                    start_info = res.get("start", {})
                    end_info = res.get("end", {})
                    line_no = start_info.get("line") or 1
                    line_end_no = end_info.get("line")
                    col_no = start_info.get("col")

                    findings.append({
                        "scanner": "semgrep",
                        "scanner_version": version or "1.180.x",
                        "rule_id": res.get("check_id", "semgrep-rule"),
                        "title": extra.get("message", "Semgrep SAST Finding").split("\n")[0][:250],
                        "severity": sev,
                        "confidence": "high",
                        "file_path": rel_file,
                        "line_number": line_no,
                        "line_end": line_end_no,
                        "column_number": col_no,
                        "code_snippet": redact_sensitive_text(lines_str.strip()[:1500]),
                        "sanitized_evidence": redact_sensitive_text(lines_str.strip()[:300]),
                        "explanation": extra.get("message", ""),
                        "remediation": str(remediation),
                        "verification_status": "unverified",
                        "commit_sha": commit_sha,
                    })
            except json.JSONDecodeError as exc:
                logger.warning("Semgrep output was not valid JSON: %s (stderr: %s)", exc, stderr[:200])

        if not findings and exit_code != 0 and (not raw or not raw.startswith("{")):
            clean_err = redact_sensitive_text(stderr.strip()[:300]) or f"Semgrep returned exit code {exit_code}"
            logger.warning("Semgrep execution failed (code %d): %s", exit_code, clean_err)
            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="failed",
                error=clean_err,
                duration_seconds=round(time.time() - start_time, 2),
                exit_code=exit_code,
            )

        return ScannerResult(
            scanner=self.name,
            scanner_version=version,
            status="completed",
            findings=findings,
            duration_seconds=round(time.time() - start_time, 2),
            exit_code=exit_code,
        )
