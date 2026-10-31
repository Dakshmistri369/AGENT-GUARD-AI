import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import create_app
from app.database.session import AsyncSessionLocal
from app.dependencies import get_db

@pytest.mark.asyncio
async def test_per_visitor_session_isolation(setup_db):
    """
    Verify Option A: Two distinct visitors sending different X-AgentGuard-Session-Id
    headers receive completely isolated database state. Visitor Beta must never see
    Visitor Alpha's repositories or scans.
    """
    app = create_app()

    async def override_get_db():
        async with AsyncSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)

    with patch("app.api.repositories.GitHubService") as MockGitHubService:
        instance = MockGitHubService.return_value
        instance.get_repository_info = AsyncMock(return_value={
            "name": "alpha-tenant-test",
            "owner": "agentguard",
            "full_name": "agentguard/alpha-tenant-test",
            "default_branch": "main",
            "description": "Test repo",
            "is_private": False,
        })
        instance.get_commit_sha = AsyncMock(return_value="abc123def456")
        instance.get_languages = AsyncMock(return_value={"Python": 1000})
        instance.get_git_tree = AsyncMock(return_value=([], False))

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Visitor Alpha connects a repository
            headers_alpha = {"X-AgentGuard-Session-Id": "sess-alpha-uuid-11111111"}
            repo_resp_alpha = await client.post(
                "/api/repositories",
                json={
                    "url": "https://github.com/agentguard/alpha-tenant-test",
                },
                headers=headers_alpha,
            )
            assert repo_resp_alpha.status_code == 201, repo_resp_alpha.text
            alpha_repo_id = repo_resp_alpha.json()["id"]

            # Visitor Alpha lists repositories -> Sees alpha-tenant-test
            list_alpha = await client.get("/api/repositories", headers=headers_alpha)
            assert list_alpha.status_code == 200
            alpha_repos = list_alpha.json()["items"]
            assert any(r["id"] == alpha_repo_id for r in alpha_repos)

            # Visitor Beta (different session ID) lists repositories -> MUST BE EMPTY / ISOLATED
            headers_beta = {"X-AgentGuard-Session-Id": "sess-beta-uuid-22222222"}
            list_beta = await client.get("/api/repositories", headers=headers_beta)
            assert list_beta.status_code == 200
            beta_repos = list_beta.json()["items"]
            assert not any(r["id"] == alpha_repo_id for r in beta_repos), (
                f"DATA LEAK DETECTED! Visitor Beta saw Visitor Alpha's repo: {beta_repos}"
            )

            # Active scans check: Visitor Beta must NOT see any scans from Visitor Alpha
            active_beta = await client.get("/api/scans/active", headers=headers_beta)
            assert active_beta.status_code == 200
            assert active_beta.json()["active_count"] == 0

            # Anti-caching and Vary headers check
            assert "Cache-Control" in list_alpha.headers
            assert "no-store" in list_alpha.headers["Cache-Control"]
            assert "Vary" in list_alpha.headers
            assert "X-AgentGuard-Session-Id" in list_alpha.headers["Vary"]

            # Visitor without session ID falls back gracefully to default demo user without error
            list_legacy = await client.get("/api/repositories")
            assert list_legacy.status_code == 200
