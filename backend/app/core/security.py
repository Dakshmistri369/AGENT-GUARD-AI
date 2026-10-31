"""
AgentGuard AI — Core Security & Cryptographic Verification.
Handles server-side Supabase JWT verification, SSRF prevention for repository cloning,
and secret sanitation.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from typing import Any, Optional
from urllib.parse import urlparse

import jwt
from jwt import PyJWKClient, PyJWKClientError, PyJWTError
from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("agentguard.core.security")
settings = get_settings()

_jwks_client: Optional[PyJWKClient] = None

# Private & link-local IP networks that must NEVER be accessed (SSRF protection)
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),       # Cloud metadata (AWS, GCP, Azure, DigitalOcean)
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def get_jwks_client() -> Optional[PyJWKClient]:
    """Return or initialize cached PyJWKClient for Supabase JWKS endpoint."""
    global _jwks_client
    if _jwks_client is None and settings.supabase_url:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """
    Verify a Supabase JWT token server-side and return its claims.
    Verifies audience ('authenticated'), expiry, and signature via JWKS or secret.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing or empty",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clean_token = token.strip()
    if clean_token.lower().startswith("bearer "):
        clean_token = clean_token[7:].strip()

    try:
        header = jwt.get_unverified_header(clean_token)
        alg = header.get("alg", "ES256")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    payload = None

    # Method 1: Asymmetric JWKS validation (ES256 / RS256)
    if alg in ("ES256", "RS256"):
        jwks = get_jwks_client()
        if jwks:
            try:
                signing_key = jwks.get_signing_key_from_jwt(clean_token)
                payload = jwt.decode(
                    clean_token,
                    signing_key.key,
                    algorithms=[alg],
                    audience="authenticated",
                    options={"verify_exp": True, "verify_aud": True},
                )
            except PyJWKClientError as e:
                logger.warning("JWKS key lookup failed: %s", e)
            except PyJWTError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid token signature or expiration: {e}",
                    headers={"WWW-Authenticate": "Bearer"},
                ) from e

    # Method 2: Symmetric HS256 secret verification
    if payload is None:
        jwt_secret = settings.supabase_jwt_secret or settings.jwt_secret
        if jwt_secret and jwt_secret != "CHANGE_ME_BEFORE_PRODUCTION":
            try:
                payload = jwt.decode(
                    clean_token,
                    jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                    options={"verify_exp": True, "verify_aud": True},
                )
            except PyJWTError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid JWT: {e}",
                    headers={"WWW-Authenticate": "Bearer"},
                ) from e

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not verify token. Signature verification failed.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user ID
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing subject ('sub') claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def validate_repository_url_for_ssrf(url: str) -> str:
    """
    Validate that a repository URL is a legitimate, public GitHub HTTPS URL.
    Strictly prevents SSRF by blocking internal IPs, cloud metadata endpoints,
    non-standard schemes, credentials, and custom ports.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(status_code=400, detail="Repository URL must be a non-empty string.")

    url = url.strip()
    parsed = urlparse(url)

    if parsed.scheme.lower() != "https":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only HTTPS repository URLs are allowed (e.g. https://github.com/owner/repo).",
        )

    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository URLs must not contain embedded user credentials.",
        )

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid repository URL hostname.")

    # Only GitHub URLs allowed initially
    if hostname != "github.com" and not hostname.endswith(".github.com"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only public GitHub repositories are currently supported (hostname must be github.com).",
        )

    # Resolve IP and enforce SSRF network check
    try:
        addr_info = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
        for _, _, _, _, sockaddr in addr_info:
            ip = ipaddress.ip_address(sockaddr[0])
            for blocked in _BLOCKED_NETWORKS:
                if ip in blocked:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Repository URL resolves to a prohibited internal or private network IP.",
                    )
    except socket.gaierror as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to resolve repository hostname '{hostname}': {e}",
        ) from e

    # Validate path format /owner/repo
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]

    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repository path. Expected format: https://github.com/<owner>/<repo>",
        )

    owner, repo_name = parts[0], parts[1]
    # Verify characters (GitHub username & repo name alphanumeric with hyphens/dots/underscores)
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", owner) or not re.match(r"^[a-zA-Z0-9_\-\.]+$", repo_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid repository path characters.",
        )

    normalized_url = f"https://github.com/{owner}/{repo_name}"
    return normalized_url
