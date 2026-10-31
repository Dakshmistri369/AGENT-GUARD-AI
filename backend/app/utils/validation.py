"""
AgentGuard AI — Input & URL Validation Utilities.
Guards against Server-Side Request Forgery (SSRF), invalid schemes, and malicious inputs.
"""
from __future__ import annotations

from app.core.security import validate_repository_url_for_ssrf


def validate_github_url(url: str) -> str:
    """Validate and return normalized GitHub HTTPS repository URL."""
    return validate_repository_url_for_ssrf(url)


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal in storage paths."""
    import re
    # Remove directory separators and null bytes
    clean = re.sub(r"[\x00/\\:*?\"<>|]", "_", filename)
    clean = clean.strip(". ")
    return clean or "unnamed_artifact"
