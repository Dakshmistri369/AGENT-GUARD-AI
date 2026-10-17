"""
AgentGuard AI — GitHub URL Validation & Normalization Security Module.
Strict server-side validation to reject malicious schemes, arbitrary domains,
embedded credentials, unexpected ports, and path traversal attempts.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

# Standard GitHub username/org regex: alphanumeric + hyphen, 1-39 chars, cannot start/end with hyphen
GITHUB_OWNER_REGEX = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$")

# Standard GitHub repository name regex: alphanumeric, hyphen, underscore, period, 1-100 chars
GITHUB_REPO_REGEX = re.compile(r"^[a-zA-Z0-9_.-]{1,100}$")


class URLValidationError(ValueError):
    """Raised when repository URL fails security or format validation."""
    pass


def validate_and_normalize_github_url(url: str) -> tuple[str, str, str]:
    """
    Validate and normalize a GitHub repository URL.

    Returns:
        tuple of (owner, repo, normalized_url)
        where normalized_url is always https://github.com/{owner}/{repo}

    Raises:
        URLValidationError: if validation fails with an actionable explanation.
    """
    if not url or not isinstance(url, str):
        raise URLValidationError("Repository URL must be a non-empty string.")

    raw_url = url.strip()

    # Reject URLs containing control characters or whitespace
    if any(c.isspace() or ord(c) < 32 for c in raw_url):
        raise URLValidationError("Repository URL contains invalid characters or whitespace.")

    try:
        parsed = urlparse(raw_url)
    except Exception as exc:
        raise URLValidationError(f"Invalid URL structure: {exc}") from exc

    # 1. Scheme validation: HTTPS only
    if parsed.scheme.lower() != "https":
        raise URLValidationError(
            f"Invalid URL scheme '{parsed.scheme}'. Only secure HTTPS GitHub URLs (https://) are accepted."
        )

    # 2. Reject embedded credentials (e.g. https://user:pass@github.com/...)
    if parsed.username or parsed.password or "@" in (parsed.netloc or ""):
        raise URLValidationError("URLs containing embedded credentials or userinfo are strictly prohibited.")

    # 3. Host validation: strictly github.com (no arbitrary domains, no subdomains, no IP addresses)
    hostname = (parsed.hostname or "").lower()
    if hostname != "github.com":
        raise URLValidationError(
            f"Unsupported domain '{hostname}'. Only official repositories on github.com are supported."
        )

    # 4. Port validation: standard 443 only (or default None)
    if parsed.port is not None and parsed.port != 443:
        raise URLValidationError(f"Unexpected port {parsed.port}. Only default HTTPS port 443 is permitted.")

    # 5. Path parsing and validation
    path = parsed.path.strip("/")
    if not path:
        raise URLValidationError("URL path is missing repository owner and name.")

    # Reject null bytes and path traversal patterns
    if "%00" in raw_url or "\0" in path or ".." in path.split("/"):
        raise URLValidationError("Path traversal characters and null bytes are strictly forbidden.")

    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise URLValidationError("URL must include both repository owner and repository name (e.g., https://github.com/owner/repo).")

    owner = parts[0]
    repo = parts[1]

    # Strip trailing .git if present
    if repo.endswith(".git"):
        repo = repo[:-4]

    # Validate owner name
    if not GITHUB_OWNER_REGEX.match(owner):
        raise URLValidationError(
            f"Invalid GitHub owner/organization name '{owner}'. "
            "Must be alphanumeric with optional hyphens (1-39 chars)."
        )

    # Validate repository name
    if not GITHUB_REPO_REGEX.match(repo) or repo in (".", ".."):
        raise URLValidationError(
            f"Invalid GitHub repository name '{repo}'. "
            "Must contain only alphanumeric, hyphen, underscore, or period characters."
        )

    # Normalized canonical URL
    normalized_url = f"https://github.com/{owner}/{repo}"

    return owner, repo, normalized_url
