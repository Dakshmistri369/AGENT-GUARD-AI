"""
Unit and regression tests for ScanResponse ORM serialization and repository scans listing.
Validates:
- No SQLAlchemy MissingGreenlet exceptions when serializing scans.
- Safe serialization of populated, null, and empty skip_manifest.
- Various scan states (queued, running, completed, failed, timed_out_partial).
- Repository ownership security checks (multi-tenant isolation).
- Query pagination (limit, offset) and sorting.
- from_orm_safe behavior with unloaded/deferred attributes.
"""
from __future__ import annotations

import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import defer
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.schemas.scan import ScanResponse


@pytest.mark.asyncio
async def test_list_repository_scans_with_populated_and_null_manifest(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Verify GET /api/repositories/{repository_id}/scans handles scans with
    populated skip_manifest, empty skip_manifest, and null skip_manifest across
    different scan states without raising MissingGreenlet.
    """
    # 1. Setup repository owned by demo user (id=1)
    repo = Repository(
        id=501,
        owner_id=1,
        name="scan-manifest-repo",
        owner_name="acme",
        full_name="acme/scan-manifest-repo",
        url="https://github.com/acme/scan-manifest-repo",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    now = datetime.datetime.now(datetime.timezone.utc)

    # 2. Add multiple scans with varied statuses and skip_manifest payloads
    scan_completed = Scan(
        id=601,
        repository_id=501,
        status="completed",
        stage="completed",
        files_discovered=120,
        files_scanned=115,
        files_skipped=5,
        skip_manifest={
            "files": [
                {"path": "dist/bundle.js", "reason": "minified_bundle", "size_bytes": 1048576},
                {"path": "package-lock.json", "reason": "lockfile", "size_bytes": 524288},
            ],
            "total_skipped": 5,
        },
        created_at=now - datetime.timedelta(minutes=10),
    )
    scan_queued = Scan(
        id=602,
        repository_id=501,
        status="queued",
        stage="queued",
        files_discovered=0,
        files_scanned=0,
        files_skipped=0,
        skip_manifest=None,
        created_at=now - datetime.timedelta(minutes=8),
    )
    scan_running = Scan(
        id=603,
        repository_id=501,
        status="running",
        stage="running_scanners",
        files_discovered=50,
        files_scanned=20,
        files_skipped=0,
        skip_manifest={},
        created_at=now - datetime.timedelta(minutes=5),
    )
    scan_failed = Scan(
        id=604,
        repository_id=501,
        status="failed",
        stage="failed",
        error_message="Worker connection lost",
        skip_manifest=None,
        created_at=now - datetime.timedelta(minutes=3),
    )
    scan_partial = Scan(
        id=605,
        repository_id=501,
        status="timed_out_partial",
        stage="generating_report",
        files_discovered=200,
        files_scanned=150,
        files_skipped=50,
        skip_manifest={"files": ["vendor.zip"], "total_skipped": 50},
        created_at=now - datetime.timedelta(minutes=1),
    )

    db_session.add_all([scan_completed, scan_queued, scan_running, scan_failed, scan_partial])
    await db_session.commit()

    # 3. Call GET /api/repositories/{id}/scans
    res = await client.get("/api/repositories/501/scans")
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}: {res.text}"

    data = res.json()
    assert len(data) == 5

    # Check order (descending by created_at)
    ids = [item["id"] for item in data]
    assert ids == [605, 604, 603, 602, 601]

    # Check specific fields
    scans_by_id = {s["id"]: s for s in data}

    # Completed scan with populated skip_manifest
    assert scans_by_id[601]["status"] == "completed"
    assert scans_by_id[601]["files_discovered"] == 120
    assert scans_by_id[601]["files_skipped"] == 5
    assert scans_by_id[601]["skip_manifest"]["total_skipped"] == 5
    assert len(scans_by_id[601]["skip_manifest"]["files"]) == 2

    # Queued scan with None skip_manifest
    assert scans_by_id[602]["status"] == "queued"
    assert scans_by_id[602]["skip_manifest"] is None

    # Running scan with empty skip_manifest
    assert scans_by_id[603]["status"] == "running"
    assert scans_by_id[603]["skip_manifest"] == {}

    # Failed scan
    assert scans_by_id[604]["status"] == "failed"
    assert scans_by_id[604]["error_message"] == "Worker connection lost"
    assert scans_by_id[604]["skip_manifest"] is None

    # Partial scan
    assert scans_by_id[605]["status"] == "timed_out_partial"
    assert scans_by_id[605]["files_skipped"] == 50
    assert scans_by_id[605]["skip_manifest"]["total_skipped"] == 50


@pytest.mark.asyncio
async def test_list_repository_scans_empty_history(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Verify GET /api/repositories/{repository_id}/scans returns an empty list (200 OK)
    when a repository exists and is owned by the user, but has zero scan records.
    """
    repo = Repository(
        id=599,
        owner_id=1,
        name="empty-scan-repo",
        owner_name="acme",
        full_name="acme/empty-scan-repo",
        url="https://github.com/acme/empty-scan-repo",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    res = await client.get("/api/repositories/599/scans")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_repository_scans_pagination(
    client: AsyncClient, db_session: AsyncSession
):
    """Verify limit and offset pagination work correctly for repository scans."""
    repo = Repository(
        id=502,
        owner_id=1,
        name="pagination-repo",
        owner_name="acme",
        full_name="acme/pagination-repo",
        url="https://github.com/acme/pagination-repo",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    base_time = datetime.datetime.now(datetime.timezone.utc)
    for i in range(1, 6):
        db_session.add(
            Scan(
                id=700 + i,
                repository_id=502,
                status="completed",
                created_at=base_time + datetime.timedelta(minutes=i),
            )
        )
    await db_session.commit()

    # Page 1: limit 2, offset 0 -> Should get IDs 705, 704
    res1 = await client.get("/api/repositories/502/scans?limit=2&offset=0")
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1) == 2
    assert [s["id"] for s in data1] == [705, 704]

    # Page 2: limit 2, offset 2 -> Should get IDs 703, 702
    res2 = await client.get("/api/repositories/502/scans?limit=2&offset=2")
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2) == 2
    assert [s["id"] for s in data2] == [703, 702]

    # Page 3: limit 2, offset 4 -> Should get ID 701
    res3 = await client.get("/api/repositories/502/scans?limit=2&offset=4")
    assert res3.status_code == 200
    data3 = res3.json()
    assert len(data3) == 1
    assert data3[0]["id"] == 701

    # Page beyond available: offset 10 -> Should get empty list
    res4 = await client.get("/api/repositories/502/scans?limit=2&offset=10")
    assert res4.status_code == 200
    assert res4.json() == []


@pytest.mark.asyncio
async def test_list_repository_scans_ownership_isolation(
    client: AsyncClient, db_session: AsyncSession
):
    """
    Verify that querying scans for a repository owned by another user returns HTTP 404
    (Repository not found or access denied).
    """
    other_user = User(
        id=999,
        email="other@agentguard.local",
        password_hash="TEST_HASH",
    )
    db_session.add(other_user)

    foreign_repo = Repository(
        id=503,
        owner_id=999,
        name="foreign-repo",
        owner_name="other",
        full_name="other/foreign-repo",
        url="https://github.com/other/foreign-repo",
        default_branch="main",
    )
    db_session.add(foreign_repo)
    await db_session.commit()

    foreign_scan = Scan(
        id=750,
        repository_id=503,
        status="completed",
    )
    db_session.add(foreign_scan)
    await db_session.commit()

    # Client is authenticated as demo user (id=1), requesting other user's repository (id=503)
    res = await client.get("/api/repositories/503/scans")
    assert res.status_code == 404
    assert "Repository not found or access denied" in res.json()["detail"]


@pytest.mark.asyncio
async def test_get_scan_endpoint_serialization(
    client: AsyncClient, db_session: AsyncSession
):
    """Verify GET /api/scans/{scan_id} serializes safely without MissingGreenlet."""
    repo = Repository(
        id=504,
        owner_id=1,
        name="single-scan-repo",
        owner_name="acme",
        full_name="acme/single-scan-repo",
        url="https://github.com/acme/single-scan-repo",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    scan = Scan(
        id=760,
        repository_id=504,
        status="completed",
        stage="completed",
        skip_manifest={"files": ["vendor.bundle.js"]},
    )
    db_session.add(scan)
    await db_session.commit()

    res = await client.get("/api/scans/760")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == 760
    assert data["status"] == "completed"
    assert data["skip_manifest"] == {"files": ["vendor.bundle.js"]}


@pytest.mark.asyncio
async def test_from_orm_safe_with_unloaded_deferred_attribute(
    db_session: AsyncSession
):
    """
    Regression test directly verifying that if an ORM instance has an attribute deferred
    or unloaded, ScanResponse.from_orm_safe safely omits/nullifies it without raising
    MissingGreenlet, while model_validate would trigger implicit async I/O.
    """
    repo = Repository(
        id=505,
        owner_id=1,
        name="deferred-test-repo",
        owner_name="acme",
        full_name="acme/deferred-test-repo",
        url="https://github.com/acme/deferred-test-repo",
        default_branch="main",
    )
    db_session.add(repo)
    await db_session.commit()

    scan = Scan(
        id=770,
        repository_id=505,
        status="completed",
        skip_manifest={"key": "original_manifest"},
    )
    db_session.add(scan)
    await db_session.commit()
    db_session.expunge(scan)  # Evict from identity map so select re-queries with defer

    # Query with defer(Scan.skip_manifest)
    stmt = select(Scan).options(defer(Scan.skip_manifest)).where(Scan.id == 770)
    result = await db_session.execute(stmt)
    deferred_scan = result.scalar_one()

    # 1. from_orm_safe must succeed and return None for the deferred skip_manifest
    safe_response = ScanResponse.from_orm_safe(deferred_scan)
    assert safe_response.id == 770
    assert safe_response.status == "completed"
    assert safe_response.skip_manifest is None

    # 2. Verify that raw model_validate on the deferred instance would fail with MissingGreenlet
    with pytest.raises(Exception) as exc_info:
        ScanResponse.model_validate(deferred_scan)
    assert "MissingGreenlet" in str(exc_info.value)
