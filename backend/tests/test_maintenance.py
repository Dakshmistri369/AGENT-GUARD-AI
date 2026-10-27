import datetime
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.scan import Scan
from app.models.repository import Repository
from app.models.user import User
from app.models.finding import Finding
from app.services.maintenance_service import DatabaseMaintenanceService

@pytest.mark.asyncio
async def test_database_maintenance_retention(db_session: AsyncSession):
    # Setup test user and repo
    user = User(email="maintenance_test@example.com")
    db_session.add(user)
    await db_session.flush()

    repo = Repository(owner_id=user.id, name="maint_repo", owner_name="maint", full_name="maint/repo", url="https://github.com/maint/repo")
    db_session.add(repo)
    await db_session.flush()

    now = datetime.datetime.now(datetime.timezone.utc)
    old_failed_date = now - datetime.timedelta(days=10)
    fresh_failed_date = now - datetime.timedelta(days=2)
    old_completed_date = now - datetime.timedelta(days=100)

    # 1. Stale failed scan with NO findings (SHOULD BE PRUNED)
    scan_stale_failed = Scan(
        repository_id=repo.id,
        status="failed",
        stage="running_scanners",
        created_at=old_failed_date,
        skip_manifest={"files": ["a.txt"]},
    )
    # 2. Fresh failed scan (SHOULD BE PRESERVED)
    scan_fresh_failed = Scan(
        repository_id=repo.id,
        status="failed",
        stage="running_scanners",
        created_at=fresh_failed_date,
        skip_manifest={"files": ["b.txt"]},
    )
    # 3. Old failed scan WITH findings (SHOULD BE PRESERVED for audit trail)
    scan_old_failed_with_findings = Scan(
        repository_id=repo.id,
        status="failed",
        stage="running_scanners",
        created_at=old_failed_date,
        skip_manifest={"files": ["c.txt"]},
    )
    # 4. Old completed scan (SHOULD HAVE MANIFEST COMPACTED)
    scan_old_completed = Scan(
        repository_id=repo.id,
        status="completed",
        stage="completed",
        created_at=old_completed_date,
        skip_manifest={"files": ["huge_manifest_entry.json"] * 50},
    )

    db_session.add_all([
        scan_stale_failed,
        scan_fresh_failed,
        scan_old_failed_with_findings,
        scan_old_completed,
    ])
    await db_session.flush()

    # Add a finding to scan 3
    finding = Finding(
        scan_id=scan_old_failed_with_findings.id,
        title="Audit finding",
        severity="high",
        scanner="semgrep",
        confidence="high",
    )
    db_session.add(finding)
    await db_session.commit()

    # Run maintenance retention
    report = await DatabaseMaintenanceService.run_retention_hygiene(
        db=db_session,
        failed_scan_retention_days=7,
        manifest_retention_days=90,
    )

    assert report["pruned_empty_failed_scans"] == 1
    assert report["compacted_manifests"] == 1

    # Verify scan 1 was deleted
    s1 = await db_session.get(Scan, scan_stale_failed.id)
    assert s1 is None

    # Verify scan 2 was kept
    s2 = await db_session.get(Scan, scan_fresh_failed.id)
    assert s2 is not None

    # Verify scan 3 was kept because it has findings
    s3 = await db_session.get(Scan, scan_old_failed_with_findings.id)
    assert s3 is not None

    # Verify scan 4 was compacted (manifest cleared to {})
    s4 = await db_session.get(Scan, scan_old_completed.id)
    assert s4 is not None
    assert s4.skip_manifest == {}
