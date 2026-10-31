"""
Integration and unit tests for the Supabase backend integration in AgentGuard AI.
Tests cover:
- SSRF validation on repository URLs (blocking localhost, metadata, RFC1918, credentials)
- Scanner finding normalization (Semgrep, Bandit, OSV) via ScannerNormalizer
- Supabase JWT verification (valid, expired, malformed)
- Storage signed URL generation and conventions
- Health check endpoints (/api/health, /api/health/supabase, /api/health/redis)
"""
from __future__ import annotations

import time
import pytest
import jwt
from fastapi import HTTPException
from httpx import AsyncClient

from app.config import get_settings
from app.core.security import validate_repository_url_for_ssrf, verify_supabase_jwt
from app.utils.validation import validate_github_url
from app.utils.scanner_normalizer import ScannerNormalizer
from app.services.storage_service import StorageService

settings = get_settings()


# ═══════════════════════════════════════════════════════════════════════════
# 1. SSRF & URL VALIDATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_valid_github_urls_pass():
    valid_urls = [
        "https://github.com/torvalds/linux",
        "https://github.com/owner/repo.git",
        "https://github.com/fastapi/fastapi",
        "https://github.com/pallets/flask/",
    ]
    for url in valid_urls:
        validated = validate_repository_url_for_ssrf(url)
        assert validated.startswith("https://github.com/")


def test_ssrf_attacks_blocked():
    malicious_urls = [
        "http://github.com/owner/repo",                # Plain HTTP
        "https://127.0.0.1/owner/repo",                # Localhost IP
        "https://localhost/owner/repo",                # Localhost hostname
        "https://169.254.169.254/latest/meta-data",    # AWS/GCP cloud metadata
        "https://10.0.0.1/private/repo",               # RFC 1918 Class A
        "https://192.168.1.1/router/repo",             # RFC 1918 Class C
        "https://172.16.0.1/private/repo",             # RFC 1918 Class B
        "https://user:password@github.com/owner/repo", # Embedded credentials
        "ftp://github.com/owner/repo",                 # Non-HTTPS protocol
        "javascript:alert(1)",                         # XSS scheme
        "https://evil-github.com/owner/repo",          # Spoofed domain
    ]
    for url in malicious_urls:
        with pytest.raises(HTTPException) as exc_info:
            validate_repository_url_for_ssrf(url)
        assert exc_info.value.status_code == 400


def test_validate_github_url_utility():
    sanitized = validate_github_url("https://github.com/torvalds/linux.git")
    assert sanitized == "https://github.com/torvalds/linux"


# ═══════════════════════════════════════════════════════════════════════════
# 2. SCANNER FINDING NORMALIZER TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_semgrep_normalization():
    mock_semgrep = {
        "results": [
            {
                "check_id": "python.lang.security.deserialization.pickle",
                "path": "app/utils.py",
                "start": {"line": 42, "col": 5},
                "extra": {
                    "message": "Avoid using pickle.loads with untrusted input",
                    "severity": "ERROR",
                    "metadata": {
                        "cwe": ["CWE-502: Deserialization of Untrusted Data"],
                        "confidence": "HIGH",
                    },
                },
            }
        ]
    }
    findings = ScannerNormalizer.normalize_semgrep(mock_semgrep)
    assert len(findings) == 1
    f = findings[0]
    assert f["rule_id"] == "python.lang.security.deserialization.pickle"
    assert f["file_path"] == "app/utils.py"
    assert f["line_start"] == 42
    assert f["severity"] in ["critical", "high"]
    assert f["scanner"] == "semgrep"
    assert "CWE-502" in (f.get("cwe") or "")


def test_bandit_normalization():
    mock_bandit = {
        "results": [
            {
                "test_id": "B303",
                "test_name": "blacklist:md5",
                "filename": "app/auth.py",
                "line_number": 15,
                "issue_text": "Use of insecure MD5 hash function",
                "issue_severity": "MEDIUM",
                "issue_confidence": "HIGH",
                "issue_cwe": {"id": 327, "link": "https://cwe.mitre.org/data/definitions/327.html"},
            }
        ]
    }
    findings = ScannerNormalizer.normalize_bandit(mock_bandit)
    assert len(findings) == 1
    f = findings[0]
    assert f["rule_id"] == "B303"
    assert f["file_path"] == "app/auth.py"
    assert f["line_start"] == 15
    assert f["severity"] == "medium"
    assert f["scanner"] == "bandit"
    assert f["cwe"] == "CWE-327"


def test_osv_normalization():
    mock_osv = {
        "results": [
            {
                "source": {"path": "package.json"},
                "packages": [
                    {
                        "package": {"name": "lodash", "version": "4.17.15"},
                        "vulnerabilities": [
                            {
                                "id": "GHSA-p6mc-m468-83gw",
                                "summary": "Prototype Pollution in lodash",
                                "details": "Versions of lodash before 4.17.21 are vulnerable...",
                                "aliases": ["CVE-2020-8203"],
                                "database_specific": {"severity": "HIGH"},
                            }
                        ],
                    }
                ],
            }
        ]
    }
    findings = ScannerNormalizer.normalize_osv(mock_osv)
    assert len(findings) == 1
    f = findings[0]
    assert f["rule_id"] == "GHSA-p6mc-m468-83gw"
    assert f["cve"] == "CVE-2020-8203"
    assert f["file_path"] == "package.json"
    assert f["scanner"] == "osv"
    assert f["severity"] in ["high", "critical"]


# ═══════════════════════════════════════════════════════════════════════════
# 3. SUPABASE JWT VERIFICATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_supabase_jwt_valid():
    secret = "test-supabase-secret-at-least-32-chars-long!"
    original_secret = settings.jwt_secret
    settings.jwt_secret = secret
    try:
        payload = {
            "sub": "00000000-0000-0000-0000-000000000001",
            "email": "user@example.com",
            "role": "authenticated",
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        }
        token = jwt.encode(payload, secret, algorithm="HS256")

        user_info = verify_supabase_jwt(token)
        assert user_info["sub"] == payload["sub"]
        assert user_info["email"] == payload["email"]
    finally:
        settings.jwt_secret = original_secret


def test_supabase_jwt_expired():
    secret = "test-supabase-secret-at-least-32-chars-long!"
    original_secret = settings.jwt_secret
    settings.jwt_secret = secret
    try:
        payload = {
            "sub": "00000000-0000-0000-0000-000000000001",
            "email": "user@example.com",
            "aud": "authenticated",
            "exp": int(time.time()) - 300, # expired 5 minutes ago
        }
        token = jwt.encode(payload, secret, algorithm="HS256")

        with pytest.raises(HTTPException) as exc_info:
            verify_supabase_jwt(token)
        assert exc_info.value.status_code == 401
    finally:
        settings.jwt_secret = original_secret


def test_supabase_jwt_malformed():
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt("not-a-valid-jwt-token")
    assert exc_info.value.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# 4. STORAGE SIGNED URL GENERATION
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_signed_url_generation():
    storage = StorageService()
    signed_url = storage.generate_signed_url(
        bucket_id="scan-reports",
        storage_path="user-123/scan-456/semgrep_report.json",
        expires_in=600,
    )
    assert signed_url is not None
    assert "token=" in signed_url or "signature=" in signed_url or signed_url.startswith("http")


# ═══════════════════════════════════════════════════════════════════════════
# 5. HEALTH CHECK ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_health_endpoints(client: AsyncClient):
    # Main health check
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data

    # Supabase health check
    resp_sb = await client.get("/api/health/supabase")
    assert resp_sb.status_code == 200
    data_sb = resp_sb.json()
    assert "status" in data_sb

    # Redis health check
    resp_redis = await client.get("/api/health/redis")
    assert resp_redis.status_code == 200
    data_redis = resp_redis.json()
    assert "status" in data_redis
