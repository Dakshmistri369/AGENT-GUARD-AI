"""
AgentGuard AI — Milestone B Controlled Scalability, Quotas & Backpressure Test Suite.
Tests:
1. Per-user concurrent scan limit enforcement (HTTP 429)
2. Per-user daily scan quota enforcement (HTTP 429)
3. Global queue depth backpressure threshold enforcement (HTTP 429)
4. Sliding-window API rate limiting enforcement (HTTP 429 + headers)
5. Multi-user concurrent submission isolation (User A quota does not block User B)
6. Repository clone size defense cap
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import get_settings
from app.database.session import AsyncSessionLocal
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.security.rate_limiter import _rate_limiter
from app.services.git_service import GitExecutionError, GitService
from app.services.github_service import GitHubService
from app.services.scan_execution_service import ScanExecutionService


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset rate limiter state before each test."""
    _rate_limiter.reset_in_memory()
    yield
    _rate_limiter.reset_in_memory()


@pytest.fixture
def mock_github_meta():
    async def _dynamic_repo_info(owner: str, name: str):
        return {
            "owner": owner,
            "name": name,
            "full_name": f"{owner}/{name}",
            "description": f"Quota Test Repo {owner}/{name}",
            "default_branch": "main",
            "is_private": False,
            "size_kb": 100,
        }

    with patch.object(
        GitHubService,
        "get_repository_info",
        new_callable=AsyncMock,
        side_effect=_dynamic_repo_info,
    ), patch.object(
        GitHubService,
        "get_commit_sha",
        new_callable=AsyncMock,
        return_value="1111222233334444555566667777888899990000",
    ), patch.object(
        GitHubService,
        "get_languages",
        new_callable=AsyncMock,
        return_value={"Python": 1000},
    ), patch.object(
        GitHubService,
        "get_git_tree",
        new_callable=AsyncMock,
        return_value=([{"path": "app.py", "type": "blob", "size": 200}], False),
    ):
        yield


class TestPerUserConcurrencyAndQuotas:
    @pytest.mark.asyncio
    async def test_concurrent_scan_limit_per_user(
        self, client: AsyncClient, mock_github_meta
    ):
        """
        Test 1: User is allowed up to max_concurrent_scans_per_user active scans.
        Submitting an additional scan must trigger HTTP 429 Too Many Requests.
        """
        # Connect 3 distinct repositories for the user
        repo_ids = []
        for i in range(1, 4):
            r = await client.post("/api/repositories", json={"url": f"https://github.com/quotaorg/repo-{i}"})
            assert r.status_code == 201
            repo_ids.append(r.json()["id"])

        async def _slow_scan(*args, **kwargs):
            await asyncio.sleep(0.4)
            return {"status": "completed"}

        # Patch max_concurrent_scans_per_user = 2 and simulate active scans
        with patch.object(get_settings(), "max_concurrent_scans_per_user", 2), patch.object(
            ScanExecutionService, "execute_scan", side_effect=_slow_scan
        ):
            # Scan 1: Allowed
            resp1 = await client.post(f"/api/repositories/{repo_ids[0]}/analyze", json={"metadata_only": True})
            assert resp1.status_code == 202

            # Scan 2: Allowed
            resp2 = await client.post(f"/api/repositories/{repo_ids[1]}/analyze", json={"metadata_only": True})
            assert resp2.status_code == 202

            # Scan 3: Exceeds concurrent cap (2) -> HTTP 429
            resp3 = await client.post(f"/api/repositories/{repo_ids[2]}/analyze", json={"metadata_only": True})
            assert resp3.status_code == 429
            data = resp3.json()
            assert "Concurrent scan limit reached" in data["detail"]
            assert "2 active scans" in data["detail"]
            assert resp3.headers.get("Retry-After") == "30"

        from app.queue.client import get_queue_client
        await get_queue_client().wait_all_jobs(timeout=5.0)

    @pytest.mark.asyncio
    async def test_daily_scan_quota_per_user(
        self, client: AsyncClient, mock_github_meta
    ):
        """
        Test 2: User is capped at max_daily_scans_per_user within a 24-hour window.
        """
        r = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/daily-repo-1"})
        assert r.status_code == 201
        repo_id = r.json()["id"]

        # Patch max_daily_scans_per_user = 2 and allow high concurrency for test
        with patch.object(get_settings(), "max_daily_scans_per_user", 2), patch.object(
            get_settings(), "max_concurrent_scans_per_user", 10
        ):
            # Scan 1: Allowed
            resp1 = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
            assert resp1.status_code == 202

            # Connect second repo for scan 2
            r2 = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/daily-repo-2"})
            assert r2.status_code == 201
            resp2 = await client.post(f"/api/repositories/{r2.json()['id']}/analyze", json={"metadata_only": True})
            assert resp2.status_code == 202

            # Connect third repo for scan 3
            r3 = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/daily-repo-3"})
            assert r3.status_code == 201
            resp3 = await client.post(f"/api/repositories/{r3.json()['id']}/analyze", json={"metadata_only": True})

            assert resp3.status_code == 429
            assert "Daily scan quota reached" in resp3.json()["detail"]
            assert resp3.headers.get("Retry-After") == "3600"

        from app.queue.client import get_queue_client
        await get_queue_client().wait_all_jobs(timeout=5.0)


class TestGlobalQueueBackpressure:
    @pytest.mark.asyncio
    async def test_queue_backpressure_when_full(
        self, client: AsyncClient, mock_github_meta
    ):
        """
        Test 3: When global queue depth reaches max_queue_depth threshold,
        the backend must return HTTP 429 Backpressure rather than crashing.
        """
        r1 = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/backpressure-repo-1"})
        assert r1.status_code == 201
        repo1_id = r1.json()["id"]

        r2 = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/backpressure-repo-2"})
        assert r2.status_code == 201
        repo2_id = r2.json()["id"]

        # Patch max_queue_depth to 3
        with patch.object(get_settings(), "max_queue_depth", 3):
            # Insert 3 queued scans for repo 1 directly into DB simulating backlog
            from app.database import session as db_session_module
            async with db_session_module.AsyncSessionLocal() as db:
                for i in range(3):
                    s = Scan(repository_id=repo1_id, status="queued", stage="queued")
                    db.add(s)
                await db.commit()

            # Attempting to enqueue a new scan on repo 2 when queue depth >= 3 triggers backpressure
            resp = await client.post(
                f"/api/repositories/{repo2_id}/analyze",
                json={"metadata_only": True},
            )
            assert resp.status_code == 429
            assert "Scan queue is currently full" in resp.json()["detail"]
            assert "Backpressure threshold reached" in resp.json()["detail"]
            assert resp.headers.get("Retry-After") == "60"


class TestSlidingWindowRateLimiting:
    @pytest.mark.asyncio
    async def test_scan_rate_limiting_triggers_429(
        self, client: AsyncClient, mock_github_meta
    ):
        """
        Test 4: Rapid requests exceeding rate_limit_per_minute_scan trigger HTTP 429
        with standard X-RateLimit-* and Retry-After headers.
        """
        r = await client.post("/api/repositories", json={"url": "https://github.com/quotaorg/ratelimit-repo"})
        assert r.status_code == 201
        repo_id = r.json()["id"]

        # Patch rate limit to 3 requests per minute
        with patch.object(get_settings(), "rate_limit_per_minute_scan", 3), patch.object(
            get_settings(), "max_concurrent_scans_per_user", 10
        ):
            # First 3 requests succeed
            for i in range(3):
                resp = await client.post(
                    f"/api/repositories/{repo_id}/analyze",
                    json={"metadata_only": True},
                )
                assert resp.status_code == 202
                assert "X-RateLimit-Limit" in resp.headers
                assert resp.headers["X-RateLimit-Limit"] == "3"

            # 4th request exceeds rate limit -> 429
            blocked_resp = await client.post(
                f"/api/repositories/{repo_id}/analyze",
                json={"metadata_only": True},
            )
            assert blocked_resp.status_code == 429
            assert "Scan submission rate limit exceeded" in blocked_resp.json()["detail"]
            assert blocked_resp.headers.get("Retry-After") is not None
            assert blocked_resp.headers.get("X-RateLimit-Remaining") == "0"

        from app.queue.client import get_queue_client
        await get_queue_client().wait_all_jobs(timeout=5.0)


class TestMultiUserConcurrencyIsolation:
    @pytest.mark.asyncio
    async def test_user_a_quota_does_not_starve_user_b(
        self, client: AsyncClient, other_user_client: AsyncClient, mock_github_meta
    ):
        """
        Test 5: Multi-user concurrency isolation.
        Simulate User A hitting their concurrent limit (2 active scans).
        User B submitting a scan at the same time must succeed (HTTP 202).
        """
        # User A connects 3 repos
        r_a1 = await client.post("/api/repositories", json={"url": "https://github.com/user-a/repo-1"})
        r_a2 = await client.post("/api/repositories", json={"url": "https://github.com/user-a/repo-2"})
        r_a3 = await client.post("/api/repositories", json={"url": "https://github.com/user-a/repo-3"})
        assert r_a1.status_code == 201
        assert r_a2.status_code == 201
        assert r_a3.status_code == 201

        # User B connects a repo
        r_b = await other_user_client.post("/api/repositories", json={"url": "https://github.com/user-b/repo-1"})
        assert r_b.status_code == 201

        async def _slow_scan(*args, **kwargs):
            await asyncio.sleep(0.4)
            return {"status": "completed"}

        with patch.object(get_settings(), "max_concurrent_scans_per_user", 2), patch.object(
            ScanExecutionService, "execute_scan", side_effect=_slow_scan
        ):
            # User A launches 2 scans -> 202
            resp_a1 = await client.post(f"/api/repositories/{r_a1.json()['id']}/analyze", json={"metadata_only": True})
            resp_a2 = await client.post(f"/api/repositories/{r_a2.json()['id']}/analyze", json={"metadata_only": True})
            assert resp_a1.status_code == 202
            assert resp_a2.status_code == 202

            # User A launches 3rd scan -> 429 (Blocked by User A quota)
            resp_a3 = await client.post(f"/api/repositories/{r_a3.json()['id']}/analyze", json={"metadata_only": True})
            assert resp_a3.status_code == 429
            assert "Concurrent scan limit reached" in resp_a3.json()["detail"]

            # User B launches a scan concurrently -> Must SUCCEED (202 Accepted)
            resp_b = await other_user_client.post(f"/api/repositories/{r_b.json()['id']}/analyze", json={"metadata_only": True})
            assert resp_b.status_code == 202, "User B was unfairly starved by User A's concurrency quota!"

        from app.queue.client import get_queue_client
        await get_queue_client().wait_all_jobs(timeout=5.0)


class TestRepositoryCloneSizeDefense:
    @pytest.mark.asyncio
    async def test_repo_clone_size_cap_defense(self, tmp_path):
        """
        Test 6: Verify GitService enforces max_repo_clone_size_mb defense cap
        and raises GitExecutionError if cloned size exceeds the limit.
        """
        # Create a mock directory with dummy large content (2 MB)
        target = tmp_path / "cloned_repo"
        target.mkdir()
        dummy_file = target / "large_binary.bin"
        dummy_file.write_bytes(b"0" * (2 * 1024 * 1024))

        # Patch max_repo_clone_size_mb = 1 MB (so 2 MB exceeds cap)
        with patch.object(get_settings(), "max_repo_clone_size_mb", 1):
            svc = GitService()
            # Mock _run_git_command to simulate a successful git clone exit
            with patch.object(
                svc,
                "_run_git_command",
                new_callable=AsyncMock,
                return_value=(0, b"Cloning into...", b""),
            ):
                with pytest.raises(GitExecutionError) as exc_info:
                    await svc.clone_repository(
                        normalized_url="https://github.com/test/oversized-repo",
                        target_dir=target,
                    )

                assert "exceeds maximum allowed limit (1 MB)" in str(exc_info.value)
                assert "Scan aborted to protect worker disk and memory resources" in str(exc_info.value)
