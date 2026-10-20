"""
AgentGuard AI — Scanner Orchestrator.
Discovers available scanners, checks project type applicability, coordinates
parallel/sequential execution, computes incomplete coverage, and merges normalized findings.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any

from app.scanners.bandit import BanditScanner
from app.scanners.base import BaseScanner, ScannerResult
from app.scanners.detect_secrets import DetectSecretsScanner
from app.scanners.filters import build_scan_file_list
from app.scanners.osv import OSVScanner
from app.scanners.semgrep import SemgrepScanner

logger = logging.getLogger("agentguard.scanners.orchestrator")


def extract_local_workspace_metadata(workspace_path: Path) -> dict[str, Any]:
    """Inspect local directory tree if metadata was not pre-computed."""
    import os
    from app.services.repository_analyzer import (
        EXCLUDED_DIR_NAMES,
        KNOWN_MANIFEST_NAMES,
        EXTENSION_TO_LANGUAGE,
    )
    extensions: set[str] = set()
    manifests: list[str] = []
    languages: set[str] = set()

    try:
        for root, dirs, files in os.walk(workspace_path):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIR_NAMES and not d.startswith(".")]
            for f in files:
                p = Path(f)
                ext = p.suffix.lower()
                if ext:
                    extensions.add(ext)
                    if ext in EXTENSION_TO_LANGUAGE:
                        languages.add(EXTENSION_TO_LANGUAGE[ext])
                if f in KNOWN_MANIFEST_NAMES or p.name in KNOWN_MANIFEST_NAMES:
                    try:
                        rel_path = (Path(root) / f).relative_to(workspace_path).as_posix()
                    except Exception:
                        rel_path = f
                    manifests.append(rel_path)
    except Exception as exc:
        logger.debug("Failed scanning workspace for metadata: %s", exc)

    return {
        "extensions": list(extensions),
        "manifests": manifests,
        "languages": list(languages),
    }


def generate_finding_fingerprint(
    scanner: str,
    rule_id: str | None,
    file_path: str | None,
    line_number: int | None,
) -> str:
    """Create a deterministic hash for deduplicating security findings."""
    raw = f"{scanner}:{rule_id or ''}:{file_path or ''}:{line_number or 0}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


class ScannerOrchestrator:
    def __init__(self, scanners: list[BaseScanner] | None = None):
        self.scanners: list[BaseScanner] = scanners or [
            SemgrepScanner(),
            BanditScanner(),
            OSVScanner(),
            DetectSecretsScanner(),
        ]

    def get_scanner_matrix(self, metadata: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """
        Produce a comprehensive status matrix of all integrated scanners
        evaluating host availability and project applicability.
        """
        matrix = {}
        for sc in self.scanners:
            available, version = sc.is_available()
            applicable, reason = sc.is_applicable(metadata)
            matrix[sc.scanner_id] = {
                "name": sc.name,
                "scanner_id": sc.scanner_id,
                "available": available,
                "version": version,
                "applicable": applicable,
                "applicability_reason": reason,
            }
        return matrix

    async def run_scans(
        self,
        workspace_path: Path,
        metadata: dict[str, Any],
        commit_sha: str | None = None,
        timeout_seconds: int = 120,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
        """
        Execute applicable and available scanners on workspace_path.
        Returns:
            (findings, scanners_run, coverage_summary, scanner_matrix)
        """
        effective_metadata = dict(metadata or {})
        # Always inspect the local cloned workspace to guarantee extensions/manifests/languages are complete
        auto_meta = extract_local_workspace_metadata(workspace_path)
        for k, v in auto_meta.items():
            if not effective_metadata.get(k):
                effective_metadata[k] = v
            elif isinstance(effective_metadata[k], list) and isinstance(v, list):
                effective_metadata[k] = sorted(list(set(effective_metadata[k] + v)))

        # Discover scannable files and pre-filter oversized or binary files
        scannable_files, skipped_files = build_scan_file_list(workspace_path)
        files_discovered = len(scannable_files) + len(skipped_files)
        files_scanned = len(scannable_files)
        files_skipped = len(skipped_files)

        skip_manifest: dict[str, list[str]] = {}
        for sk in skipped_files:
            skip_manifest.setdefault(sk.reason, []).append(sk.path)

        scanner_matrix = self.get_scanner_matrix(effective_metadata)
        scanners_run: list[dict[str, Any]] = []
        all_findings: list[dict[str, Any]] = []

        applicable_scanners: list[str] = []
        executed_scanners: list[str] = []
        missing_scanners: list[str] = []
        failed_scanners: list[str] = []
        skipped_scanners: list[str] = []
        coverage_notes: list[str] = []

        # Prepare scanner execution tasks
        tasks = []
        for sc in self.scanners:
            mat = scanner_matrix[sc.scanner_id]
            applicable = mat["applicable"]
            available = mat["available"]

            if applicable:
                applicable_scanners.append(sc.name)
            else:
                skipped_scanners.append(sc.name)
                scanners_run.append({
                    "name": sc.name,
                    "scanner_id": sc.scanner_id,
                    "version": mat["version"],
                    "status": "skipped_not_applicable",
                    "reason": mat["applicability_reason"],
                    "findings_count": 0,
                    "duration_seconds": 0.0,
                })
                continue

            async def _execute_scanner(scanner: BaseScanner, is_avail: bool, matrix_entry: dict[str, Any]):
                try:
                    res: ScannerResult = await scanner.scan(
                        workspace_path=workspace_path,
                        metadata=effective_metadata,
                        commit_sha=commit_sha,
                        timeout_seconds=timeout_seconds,
                    )
                    return scanner, is_avail, matrix_entry, res, None
                except Exception as exc:
                    return scanner, is_avail, matrix_entry, None, exc

            tasks.append(_execute_scanner(sc, available, mat))

        # Run applicable scanners concurrently
        if tasks:
            import asyncio
            results = await asyncio.gather(*tasks)
            for sc, is_avail, mat, res, exc in results:
                if exc is not None:
                    logger.error("Unexpected error in scanner %s: %s", sc.name, exc)
                    failed_scanners.append(sc.name)
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": mat["version"],
                        "status": "failed",
                        "error": str(exc),
                        "findings_count": 0,
                        "duration_seconds": 0.0,
                    })
                    continue

                if not is_avail:
                    missing_scanners.append(sc.name)
                    if res.findings:
                        all_findings.extend(res.findings)
                    note = f"{sc.name} was applicable but not installed on host PATH; coverage is partial."
                    coverage_notes.append(note)
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": None,
                        "status": "skipped_unavailable",
                        "reason": res.reason or "CLI tool is not installed on host PATH",
                        "findings_count": len(res.findings),
                        "duration_seconds": res.duration_seconds,
                    })
                    continue

                if res.status == "completed":
                    executed_scanners.append(sc.name)
                    all_findings.extend(res.findings)
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": res.scanner_version,
                        "status": "completed",
                        "findings_count": len(res.findings),
                        "duration_seconds": res.duration_seconds,
                    })
                elif res.status == "timed_out":
                    failed_scanners.append(sc.name)
                    coverage_notes.append(f"{sc.name} execution timed out ({res.duration_seconds}s); results are incomplete.")
                    skip_manifest.setdefault("timed_out_scanners", []).append(sc.name)
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": res.scanner_version,
                        "status": "timed_out",
                        "error": res.error or f"Timed out after {timeout_seconds}s",
                        "findings_count": 0,
                        "duration_seconds": res.duration_seconds,
                    })
                elif res.status == "failed":
                    failed_scanners.append(sc.name)
                    coverage_notes.append(f"{sc.name} execution failed: {res.error}")
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": res.scanner_version,
                        "status": "failed",
                        "error": res.error,
                        "findings_count": 0,
                        "duration_seconds": res.duration_seconds,
                    })
                else:
                    scanners_run.append({
                        "name": sc.name,
                        "scanner_id": sc.scanner_id,
                        "version": res.scanner_version,
                        "status": res.status,
                        "reason": res.reason,
                        "findings_count": len(res.findings),
                        "duration_seconds": res.duration_seconds,
                    })

        # Deduplicate findings by fingerprint
        unique_findings: dict[str, dict[str, Any]] = {}
        for f in all_findings:
            fp = f.get("fingerprint") or generate_finding_fingerprint(
                f.get("scanner", "agentguard"),
                f.get("rule_id"),
                f.get("file_path"),
                f.get("line_number"),
            )
            f["fingerprint"] = fp
            if fp not in unique_findings:
                unique_findings[fp] = f

        # Coverage evaluation
        is_complete = len(missing_scanners) == 0 and len(failed_scanners) == 0
        coverage_summary = {
            "is_complete": is_complete,
            "applicable_scanners": applicable_scanners,
            "executed_scanners": executed_scanners,
            "missing_scanners": missing_scanners,
            "failed_scanners": failed_scanners,
            "skipped_scanners": skipped_scanners,
            "notes": coverage_notes,
            "files_discovered": files_discovered,
            "files_scanned": files_scanned,
            "files_skipped": files_skipped,
            "skip_manifest": skip_manifest,
        }

        return list(unique_findings.values()), scanners_run, coverage_summary, scanner_matrix
