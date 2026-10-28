"""
Regression tests for Scan Enqueue Resilience, Redis Availability, and Failure Boundaries.
Verifies requirement 8:
- Missing Redis configuration in production
- Redis connection failures
- Enqueue failure recovery (no orphaned queued scans)
- Rate limiter robustness when Redis is down
- Idempotent duplicate requests
"""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.repository import Repository
from app.models.scan import Scan
from app.queue.client import get_queue_client
from app.services.github_service import GitHubService
from app.services.scan_execution_service import ScanExecutionService


@pytest.fixture
def mock_gh():
    with patch.object(
        GitHubService,
        "get_repository_info",
        new_callable=AsyncMock,
        return_value={
            "owner": "testresilience",
            "name": "resilience-repo",
            "full_name": "testresilience/resilience-repo",
            "description": "Resilience Test",
            "default_branch": "main",
            "is_private": False,
            "size_kb": 10,
        },
    ), patch.object(
        GitHubService,
        "get_commit_sha",
        new_callable=AsyncMock,
        return_value="1122334455667788990011223344556677889900",
    ), patch.object(
        GitHubService,
        "get_languages",
        new_callable=AsyncMock,
        return_value={"Python": 100},
    ), patch.object(
        ScanExecutionService,
        "execute_scan",
        new_callable=AsyncMock,
        return_value={"status": "completed"},
    ):
        yield


@pytest.mark.asyncio
async def test_production_missing_redis_fails_with_503_and_leaves_no_orphaned_scans(
    client: AsyncClient, db_session: AsyncSession, mock_gh
):
    """
    When ENVIRONMENT=production and REDIS_URL is not configured:
    Endpoint must fail with HTTP 503 (actionable error), NOT an unhandled HTTP 500,
    and must NOT leave any orphaned queued scan in the database.
    """
    # 1. Connect repo
    conn_res = await client.post("/api/repositories", json={"url": "https://github.com/testresilience/resilience-repo"})
    assert conn_res.status_code == 201
    repo_id = conn_res.json()["id"]

    # 2. Simulate production with missing Redis URL
    settings = get_settings()
    with patch.object(settings, "environment", "production"), patch.object(
        get_queue_client(), "redis_url", None
    ):
        analyze_res = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})

        # Must return HTTP 503 Service Unavailable, not 500
        assert analyze_res.status_code == 503
        data = analyze_res.json()
        assert "Scan queue service is currently unavailable" in data["detail"]
        assert "REDIS_URL" in data["detail"]

    # 3. Verify zero orphan queued scans exist in the database
    scans_stmt = select(Scan).where(Scan.repository_id == repo_id)
    scans_res = await db_session.execute(scans_stmt)
    scans = scans_res.scalars().all()
    assert len(scans) == 0, "Dirty/orphaned scan record was created despite queue being down!"


@pytest.mark.asyncio
async def test_production_unreachable_redis_fails_with_503(
    client: AsyncClient, db_session: AsyncSession, mock_gh
):
    """
    When ENVIRONMENT=production and Redis is unreachable:
    Endpoint must fail fast with HTTP 503 rather than throwing an unhandled HTTP 500.
    """
    conn_res = await client.post("/api/repositories", json={"url": "https://github.com/testresilience/resilience-repo"})
    assert conn_res.status_code == 201
    repo_id = conn_res.json()["id"]

    settings = get_settings()
    with patch.object(settings, "environment", "production"), patch.object(
        get_queue_client(), "redis_url", "redis://127.0.0.1:9999/0"
    ):
        analyze_res = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
        assert analyze_res.status_code == 503
        assert "Scan queue service is currently unavailable" in analyze_res.json()["detail"]


@pytest.mark.asyncio
async def test_enqueue_failure_marks_scan_failed_and_does_not_block_concurrency(
    client: AsyncClient, db_session: AsyncSession, mock_gh
):
    """
    If enqueueing throws an exception after database insert, the scan MUST be
    marked as 'failed' in the database (not left in 'queued' or 'running'),
    and the API must return HTTP 503 rather than an unhandled 500.
    """
    conn_res = await client.post("/api/repositories", json={"url": "https://github.com/testresilience/resilience-repo"})
    assert conn_res.status_code == 201
    repo_id = conn_res.json()["id"]

    queue_client = get_queue_client()
    with patch.object(
        queue_client,
        "enqueue_scan",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Redis connection dropped during pipeline enqueue"),
    ):
        analyze_res = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
        assert analyze_res.status_code == 503
        assert "unable to enqueue job to background worker queue" in analyze_res.json()["detail"]

    # Verify the scan was marked as 'failed', not left as 'queued'
    scans_stmt = select(Scan).where(Scan.repository_id == repo_id)
    scans_res = await db_session.execute(scans_stmt)
    scans = scans_res.scalars().all()
    assert len(scans) == 1
    assert scans[0].status == "failed"
    assert scans[0].stage == "failed"
    assert "Redis connection dropped" in scans[0].error_message

    # Active scans API must report 0 active scans
    active_res = await client.get("/api/scans/active")
    assert active_res.status_code == 200
    assert active_res.json()["active_count"] == 0


@pytest.mark.asyncio
async def test_rate_limiter_handles_redis_failure_gracefully(
    client: AsyncClient, mock_gh
):
    """
    Verify require_scan_rate_limit falls back to memory without raising HTTP 500
    when Redis is down.
    """
    conn_res = await client.post("/api/repositories", json={"url": "https://github.com/testresilience/resilience-repo"})
    assert conn_res.status_code == 201
    repo_id = conn_res.json()["id"]

    with patch.object(
        get_queue_client(),
        "_get_redis",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Simulated Redis outage during rate limit check"),
    ):
        # Should not throw 500 in rate limiter; returns 202 in test/dev
        analyze_res = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
        assert analyze_res.status_code == 202


@pytest.mark.asyncio
async def test_idempotent_duplicate_submission(
    client: AsyncClient, mock_gh
):
    """
    Submitting an analysis for an active scan returns the existing scan (HTTP 200 or 202)
    without creating a duplicate or exceeding concurrency quotas.
    """
    conn_res = await client.post("/api/repositories", json={"url": "https://github.com/testresilience/resilience-repo"})
    assert conn_res.status_code == 201
    repo_id = conn_res.json()["id"]

    # First request
    res1 = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
    assert res1.status_code == 202
    scan1_id = res1.json()["id"]

    # Second immediate request on same repo
    res2 = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
    assert res2.status_code in (200, 202)
    assert res2.json()["id"] == scan1_id
