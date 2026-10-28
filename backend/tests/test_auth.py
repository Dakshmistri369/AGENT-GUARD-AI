"""
Comprehensive tests for Supabase Auth & JWT verification in AgentGuard AI.
Tests verify:
- Public auth status endpoint
- Unauthenticated rejection (401)
- Malformed, expired, invalid signature, and wrong audience token rejection (401)
- Valid JWT auto-provisioning and profile retrieval (200)
- User resource isolation between two distinct authenticated Supabase users
"""
from __future__ import annotations

import datetime
import time
from typing import AsyncGenerator

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db
from app.main import create_app

settings = get_settings()

TEST_JWT_SECRET = "test-secret-key-for-unit-testing-32-chars-long"  # nosec B105 # pragma: whitelist secret


def create_test_token(
    sub: str = "sub_user_test_123",
    email: str = "testuser@agentguard.dev",
    aud: str = "authenticated",
    expires_in: int = 3600,
    secret: str = TEST_JWT_SECRET,
    email_confirmed: bool = True,
) -> str:
    """Generate a signed test JWT for unit testing."""
    payload = {
        "sub": sub,
        "email": email,
        "aud": aud,
        "iss": "https://test.supabase.co/auth/v1",
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in,
        "email_confirmed_at": datetime.datetime.now(datetime.timezone.utc).isoformat() if email_confirmed else None,
        "user_metadata": {"email_verified": email_confirmed},
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest_asyncio.fixture
async def auth_app(db_session: AsyncSession, monkeypatch):
    """FastAPI app instance configured for JWT testing with test secret."""
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_JWT_SECRET)
    monkeypatch.setattr(settings, "jwt_secret", TEST_JWT_SECRET)
    monkeypatch.setattr(settings, "enable_demo_auth", False)
    monkeypatch.setattr(settings, "environment", "production")

    app = create_app()

    async def override_get_db():
        yield db_session

    # Override ONLY DB, NOT get_current_user (we want to test real auth dependency!)
    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(auth_app) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=auth_app),
        base_url="http://testserver",
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_auth_status_endpoint(auth_client: AsyncClient):
    """GET /api/auth/status is accessible without credentials."""
    resp = await auth_client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "auth_mode" in data
    assert "supabase_configured" in data
    assert "demo_auth_enabled" in data


@pytest.mark.asyncio
async def test_auth_me_unauthenticated_returns_401(auth_client: AsyncClient):
    """GET /api/auth/me without token returns 401 Unauthorized."""
    resp = await auth_client.get("/api/auth/me")
    assert resp.status_code == 401
    assert "WWW-Authenticate" in resp.headers


@pytest.mark.asyncio
async def test_auth_me_malformed_token_returns_401(auth_client: AsyncClient):
    """GET /api/auth/me with garbage token returns 401."""
    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_expired_token_returns_401(auth_client: AsyncClient):
    """GET /api/auth/me with expired token returns 401."""
    expired_token = create_test_token(expires_in=-3600)
    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_wrong_secret_signature_returns_401(auth_client: AsyncClient):
    """GET /api/auth/me with token signed by wrong key returns 401."""
    wrong_token = create_test_token(secret="totally-wrong-secret-key-32-chars!!")  # nosec B106 # pragma: whitelist secret
    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {wrong_token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_wrong_audience_returns_401(auth_client: AsyncClient):
    """GET /api/auth/me with wrong audience returns 401."""
    wrong_aud_token = create_test_token(aud="attacker_audience")
    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {wrong_aud_token}"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_valid_jwt_provisions_user(auth_client: AsyncClient):
    """GET /api/auth/me with valid JWT provisions user and returns verified identity."""
    token = create_test_token(
        sub="supa_user_alpha_123",
        email="alpha@agentguard.dev",
        email_confirmed=True,
    )
    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "alpha@agentguard.dev"
    assert data["supabase_user_id"] == "supa_user_alpha_123"
    assert data["email_verified"] is True
    assert data["auth_status"] == "VERIFIED"


@pytest.mark.asyncio
async def test_user_ownership_isolation_between_authenticated_users(auth_client: AsyncClient):
    """User A cannot access or see User B's projects (ownership isolation)."""
    token_a = create_test_token(sub="user_a_uuid", email="user_a@agentguard.dev")
    token_b = create_test_token(sub="user_b_uuid", email="user_b@agentguard.dev")

    # User A creates a project
    create_resp = await auth_client.post(
        "/api/projects",
        json={"name": "User A Private Project", "description": "Top Secret"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    # User A can get it
    get_resp_a = await auth_client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert get_resp_a.status_code == 200

    # User B receives 404 when attempting to access User A's project (not 403, preventing existence leaks)
    get_resp_b = await auth_client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert get_resp_b.status_code == 404


@pytest.mark.asyncio
async def test_auth_me_valid_es256_jwks_token(auth_client: AsyncClient, monkeypatch):
    """Test ES256 asymmetric token validation mocked through JWKS client."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    from unittest.mock import MagicMock
    import app.core.supabase_auth as auth_mod

    # Generate test EC private and public key
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    token = jwt.encode(
        {
            "sub": "es256_supa_user_999",
            "email": "es256@agentguard.dev",
            "aud": "authenticated",
            "iss": "https://test.supabase.co/auth/v1",
            "exp": int(time.time()) + 3600,
            "email_confirmed_at": "2026-01-01T00:00:00Z",
        },
        pem_private,
        algorithm="ES256",
        headers={"kid": "test-key-id", "alg": "ES256"},
    )

    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key

    mock_jwks = MagicMock()
    mock_jwks.get_signing_key_from_jwt.return_value = mock_signing_key

    monkeypatch.setattr(auth_mod, "get_jwks_client", lambda: mock_jwks)

    resp = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["supabase_user_id"] == "es256_supa_user_999"
    assert data["email"] == "es256@agentguard.dev"
    assert data["auth_status"] == "VERIFIED"


@pytest.mark.asyncio
async def test_demo_mode_fallback_when_enable_demo_auth_in_production(auth_client: AsyncClient, monkeypatch):
    """When enable_demo_auth is True, unauthenticated requests succeed as demo user even in production."""
    monkeypatch.setattr(settings, "enable_demo_auth", True)
    resp = await auth_client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == settings.demo_user_email


@pytest.mark.asyncio
async def test_stateless_jwt_zero_db_cache_hit(auth_client: AsyncClient, monkeypatch):
    """Subsequent requests with verified JWT hit Redis cache and return 200 with zero DB queries."""
    from unittest.mock import AsyncMock
    import app.dependencies as deps

    token = create_test_token(sub="cache_test_sub_999", email="cached@agentguard.dev")

    # 1. First request provisions user and caches in Redis
    resp1 = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 200
    user_id = resp1.json()["id"]
    assert user_id > 0

    # 2. Mock get_or_create_user_from_claims to ensure it is NEVER called on cache hit
    mock_db_auth = AsyncMock()
    monkeypatch.setattr(deps, "get_or_create_user_from_claims", mock_db_auth)

    # 3. Second request must hit cache and return 200 without calling DB provisioning
    resp2 = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == user_id
    assert resp2.json()["email"] == "cached@agentguard.dev"
    assert resp2.json()["supabase_user_id"] == "cache_test_sub_999"
    mock_db_auth.assert_not_called()

    assert "id" in data and data["id"] > 0


@pytest.mark.asyncio
async def test_zero_config_mock_in_production_allows_demo_user(auth_client: AsyncClient, monkeypatch):
    """When Supabase is unconfigured and AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION=1, demo user is allowed."""
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    monkeypatch.setattr(settings, "enable_demo_auth", False)
    monkeypatch.setenv("AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION", "1")
    resp = await auth_client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == settings.demo_user_email


@pytest.mark.asyncio
async def test_stateless_jwt_zero_db_cache_hit(auth_client: AsyncClient, monkeypatch):
    """Subsequent requests with verified JWT hit Redis cache and return 200 with zero DB queries."""
    from unittest.mock import AsyncMock
    import app.dependencies as deps

    token = create_test_token(sub="cache_test_sub_999", email="cached@agentguard.dev")

    # 1. First request provisions user and caches in Redis
    resp1 = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 200
    user_id = resp1.json()["id"]
    assert user_id > 0

    # 2. Mock get_or_create_user_from_claims to ensure it is NEVER called on cache hit
    mock_db_auth = AsyncMock()
    monkeypatch.setattr(deps, "get_or_create_user_from_claims", mock_db_auth)

    # 3. Second request must hit cache and return 200 without calling DB provisioning
    resp2 = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == user_id
    assert resp2.json()["email"] == "cached@agentguard.dev"
    assert resp2.json()["supabase_user_id"] == "cache_test_sub_999"
    mock_db_auth.assert_not_called()

