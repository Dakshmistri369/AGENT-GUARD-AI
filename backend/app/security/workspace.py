"""
AgentGuard AI — Workspace Isolation and Sanitization Security Module.
Provides isolated ephemeral workspace directories, strict path traversal checks,
safe recursive cleanup for Windows & POSIX, and secret redaction.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path

logger = logging.getLogger("agentguard.security.workspace")

# Patterns for secret redaction
SENSITIVE_PATTERNS = [
    # GitHub PATs, OAuth, fine-grained tokens
    (re.compile(r"ghp_[a-zA-Z0-9]{30,40}"), "[REDACTED_GITHUB_PAT]"),
    (re.compile(r"github_pat_[a-zA-Z0-9_]{70,90}"), "[REDACTED_GITHUB_FINE_GRAINED_PAT]"),
    (re.compile(r"gho_[a-zA-Z0-9]{30,40}"), "[REDACTED_GITHUB_OAUTH]"),
    (re.compile(r"ghu_[a-zA-Z0-9]{30,40}"), "[REDACTED_GITHUB_USER_TO_SERVER]"),
    (re.compile(r"ghs_[a-zA-Z0-9]{30,40}"), "[REDACTED_GITHUB_SERVER_TO_SERVER]"),
    # NVIDIA API keys
    (re.compile(r"nvapi-[a-zA-Z0-9_-]{64,}"), "[REDACTED_NVIDIA_API_KEY]"),
    # AWS Access Keys & Secrets
    (re.compile(r"(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}"), "[REDACTED_AWS_KEY_ID]"),
    (re.compile(r"(?i)aws_secret_access_key\s*=\s*['\"][A-Za-z0-9/+=]{40}['\"]"), "aws_secret_access_key='[REDACTED_AWS_SECRET]'"),
    # Generic Private Keys
    (re.compile(r"-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----"), "[REDACTED_PRIVATE_KEY]"),
    # Generic API Keys / Secrets assignments
    (re.compile(r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*['\"][a-zA-Z0-9_\-\.\+/=]{8,}['\"]"), r"\1='[REDACTED_CREDENTIAL]'"),
    # Bearer tokens
    (re.compile(r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}"), "Bearer [REDACTED_BEARER_TOKEN]"),
]


def redact_sensitive_text(text: str | None) -> str | None:
    """Safely redact credentials, tokens, and private keys from evidence or logs."""
    if not text:
        return text

    sanitized = text
    for pattern, replacement in SENSITIVE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """
    Ensure target_path resolves strictly within base_dir.
    Guards against directory traversal, symlink escapes, and relative jumping.
    """
    try:
        base_resolved = base_dir.resolve(strict=True)
        # target might not exist yet if checking before creation, but if it exists check realpath
        target_resolved = target_path.resolve(strict=False)
        return os.path.commonpath([str(base_resolved), str(target_resolved)]) == str(base_resolved)
    except Exception as exc:
        logger.warning("Path resolution error during safety check: %s", exc)
        return False


def _remove_readonly(func, path, *args):
    """Windows onerror / onexc handler for shutil.rmtree to remove read-only flags (e.g. .git files)."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as exc:
        logger.warning("Could not force-remove read-only file %s: %s", path, exc)


def create_isolated_workspace(base_dir_str: str, scan_identifier: str | int) -> Path:
    """
    Create a unique, isolated ephemeral workspace directory for a scan.
    """
    base_dir = Path(base_dir_str).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    prefix = f"scan_{scan_identifier}_"
    workspace = Path(tempfile.mkdtemp(prefix=prefix, dir=base_dir)).resolve()
    logger.info("Created isolated workspace at: %s", workspace)
    return workspace


def cleanup_workspace(workspace: Path | str | None) -> None:
    """
    Safely delete the isolated workspace directory and all contained files.
    """
    if not workspace:
        return

    path = Path(workspace)
    if not path.exists():
        return

    try:
        import sys
        if sys.version_info >= (3, 12):
            shutil.rmtree(path, onexc=_remove_readonly)
        else:
            shutil.rmtree(path, onerror=_remove_readonly)
        logger.info("Successfully cleaned up isolated workspace: %s", path)
    except Exception as exc:
        logger.error("Failed to clean up workspace %s: %s", path, exc)
