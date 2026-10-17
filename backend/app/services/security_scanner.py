"""
AgentGuard AI — Multi-Engine Security Scanner Orchestration Wrapper.
Delegates to modular scanner services (Semgrep, Bandit, OSV-Scanner, detect-secrets)
via ScannerOrchestrator, ensuring common finding schema normalization and secret redaction.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.scanners.orchestrator import ScannerOrchestrator

logger = logging.getLogger("agentguard.services.scanner")


class SecurityScannerService:
    """Wrapper coordinating multi-engine security scanners on a local repository workspace."""

    def __init__(self, timeout_seconds: int = 120):
        self._timeout_seconds = timeout_seconds
        self._orchestrator = ScannerOrchestrator()

    def check_scanner_availability(self, metadata: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
        """Verify availability and applicability of scanners."""
        return self._orchestrator.get_scanner_matrix(metadata or {})

    async def scan_repository(
        self,
        workspace_dir: Path,
        commit_sha: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """
        Run applicable scanners against workspace_dir.
        Returns:
            (findings_list, scanners_run_list)
        """
        findings, scanners_run, coverage, matrix = await self._orchestrator.run_scans(
            workspace_path=workspace_dir,
            metadata=metadata or {},
            commit_sha=commit_sha,
            timeout_seconds=self._timeout_seconds,
        )
        return findings, scanners_run
