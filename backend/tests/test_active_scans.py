"""
Unit and integration tests for GET /api/scans/active endpoint.
Verifies active scan polling, terminal status filtering, and multi-tenant isolation.
"""
import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository
from app.models.scan import Scan


@pytest.mark.asyncio
async def test_get_active_scans_empty(client: AsyncClient):
    """Verify endpoint returns active_count: 0 when no active scans exist."""
    res = await client.get("/api/scans/active")
    assert res.status_code == 200
    data = res.json()
    assert data["active_count"] == 0
    assert data["scans"] == []


@pytest.mark.asyncio
async def test_get_active_scans_filters_terminal_states(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Verify endpoint returns non-terminal statuses ('pending', 'queued', 'running')
    and strictly excludes terminal statuses ('completed', 'failed', 'cancelled').
    """
    # 1. Create a repository owned by DEMO_USER_ID (1)
    repo = Repository(
        id=101,
        owner_id=1,
        name="backend-service",
        owner_name="acme",
        full_name="acme/backend-service",
        url="https://github.com/acme/backend-service",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    now = datetime.datetime.now(datetime.timezone.utc)
    started_5m_ago = now - datetime.timedelta(minutes=5)

    # 2. Add scans in various states
    scan_queued = Scan(
        id=201,
        repository_id=101,
        status="queued",
        stage="queued",
        created_at=now,
    )
    scan_running = Scan(
        id=202,
        repository_id=101,
        status="running",
        stage="running_scanners",
        created_at=started_5m_ago,
        started_at=started_5m_ago,
    )
    scan_completed = Scan(
        id=203,
        repository_id=101,
        status="completed",
        stage="completed",
        created_at=started_5m_ago,
        started_at=started_5m_ago,
        completed_at=now,
    )
    scan_failed = Scan(
        id=204,
        repository_id=101,
        status="failed",
        stage="failed",
        created_at=started_5m_ago,
        completed_at=now,
    )

    db_session.add_all([scan_queued, scan_running, scan_completed, scan_failed])
    await db_session.commit()

    # 3. Call endpoint
    res = await client.get("/api/scans/active")
    assert res.status_code == 200
    data = res.json()

    assert data["active_count"] == 2
    scan_ids = [s["id"] for s in data["scans"]]
    assert 201 in scan_ids
    assert 202 in scan_ids
    assert 203 not in scan_ids
    assert 204 not in scan_ids

    # Verify elapsed_seconds computation and repository attributes
    running_item = next(s for s in data["scans"] if s["id"] == 202)
    assert running_item["repository_name"] == "backend-service"
    assert running_item["repository_full_name"] == "acme/backend-service"
    assert running_item["stage"] == "running_scanners"
    assert running_item["elapsed_seconds"] >= 290  # ~300 seconds


@pytest.mark.asyncio
async def test_get_active_scans_tenant_isolation(
    client: AsyncClient, other_user_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify multi-tenant isolation:
    User 1 only sees User 1's active scans, and User 2 only sees User 2's active scans.
    """
    repo1 = Repository(
        id=301,
        owner_id=1,
        name="user1-repo",
        owner_name="user1",
        full_name="user1/user1-repo",
        url="https://github.com/user1/user1-repo",
        default_branch="main",
    )
    repo2 = Repository(
        id=302,
        owner_id=2,
        name="user2-repo",
        owner_name="user2",
        full_name="user2/user2-repo",
        url="https://github.com/user2/user2-repo",
        default_branch="main",
    )
    db_session.add_all([repo1, repo2])
    await db_session.commit()

    scan1 = Scan(id=401, repository_id=301, status="running", stage="running_scanners")
    scan2 = Scan(id=402, repository_id=302, status="queued", stage="queued")
    db_session.add_all([scan1, scan2])
    await db_session.commit()

    # Request as User 1
    res1 = await client.get("/api/scans/active")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["active_count"] == 1
    assert data1["scans"][0]["id"] == 401
    assert data1["scans"][0]["repository_name"] == "user1-repo"

    # Request as User 2
    res2 = await other_user_client.get("/api/scans/active")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["active_count"] == 1
    assert data2["scans"][0]["id"] == 402
    assert data2["scans"][0]["repository_name"] == "user2-repo"
