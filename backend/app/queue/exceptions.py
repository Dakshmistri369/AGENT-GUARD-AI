"""
AgentGuard AI — Queue & Scanner Exceptions.
Provides strongly typed exceptions to distinguish transient infrastructure issues
from unrecoverable failures and tool timeouts.
"""
from __future__ import annotations


class TransientScanError(Exception):
    """
    Raised when an operational or infrastructure component (database, Redis, network)
    encounters a temporary failure that should be retried with exponential backoff.
    """
    pass


class ToolTimeoutError(Exception):
    """
    Raised when an individual security scanner process exceeds its execution timeout.
    Tool timeouts must NOT be retried via arq; partial results should be preserved.
    """
    def __init__(self, scanner_name: str, timeout_seconds: float):
        super().__init__(f"Scanner '{scanner_name}' timed out after {timeout_seconds}s")
        self.scanner_name = scanner_name
        self.timeout_seconds = timeout_seconds


class PermanentScanError(Exception):
    """
    Raised when a scan fails due to an unrecoverable condition (e.g. invalid repository URL,
    missing authorization, corrupted workspace). Scan is routed directly to terminal failure.
    """
    pass
