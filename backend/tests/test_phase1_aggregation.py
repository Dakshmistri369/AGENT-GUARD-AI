import pytest
from httpx import AsyncClient
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.finding import Finding
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_dashboard_metrics_empty(client: AsyncClient):
    """Test dashboard metrics when user has no repositories."""
    resp = await client.get("/api/dashboard/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["metrics_available"] is True
    assert data["total_repositories"] == 0
    assert data["total_scans"] == 0
    assert data["total_findings"] == 0

@pytest.mark.asyncio
async def test_dashboard_metrics_aggregation_with_seeded_data(client: AsyncClient, db_session: AsyncSession):
    """
    Test compact metrics endpoint against seeded dataset with known counts.
    Asserts returned numbers exactly match.
    """
    # 1. Seed Repository
    repo = Repository(
        id=101,
        owner_id=1,
        name="test-repo",
        owner_name="test-org",
        full_name="test-org/test-repo",
        url="https://github.com/test-org/test-repo",
        default_branch="main",
        is_private=False,
    )
    db_session.add(repo)
    await db_session.flush()

    # 2. Seed Scan
    scan = Scan(
        id=201,
        repository_id=101,
        status="completed",
        stage="generating_report",
    )
    db_session.add(scan)
    await db_session.flush()

    # 3. Seed 3 Findings (1 critical, 1 high, 1 medium)
    f1 = Finding(
        scan_id=201,
        title="SQL Injection",
        severity="critical",
        confidence="high",
        scanner="semgrep",
        file_path="src/db.py",
        line_number=10,
        verification_status="unverified",
    )
    f2 = Finding(
        scan_id=201,
        title="Hardcoded Secret",
        severity="high",
        confidence="high",
        scanner="detect-secrets",
        file_path="src/config.py",
        line_number=5,
        verification_status="false_positive",
    )
    f3 = Finding(
        scan_id=201,
        title="Weak Cryptography",
        severity="medium",
        confidence="medium",
        scanner="bandit",
        file_path="src/crypto.py",
        line_number=20,
        verification_status="confirmed",
    )
    db_session.add_all([f1, f2, f3])
    await db_session.commit()

    # Query metrics endpoint
    resp = await client.get("/api/dashboard/metrics")
    assert resp.status_code == 200
    data = resp.json()

    assert data["metrics_available"] is True
    assert data["total_repositories"] == 1
    assert data["total_scans"] == 1
    assert data["completed_scans"] == 1
    assert data["total_findings"] == 3
    assert data["critical_findings"] == 1
    assert data["high_findings"] == 1
    assert data["medium_findings"] == 1
    assert data["low_findings"] == 0
    assert data["false_positives"] == 1
    assert data["potential_issues"] == 2
    assert data["patches_available"] == 2

    # Cross-check summary endpoint for matching numbers
    summary_resp = await client.get("/api/dashboard/summary")
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()

    assert summary_data["scans_and_reviews"]["total_scans"] == 1
    assert summary_data["severity_distribution"]["total"] == 3
    assert summary_data["severity_distribution"]["critical"] == 1
    assert summary_data["severity_distribution"]["high"] == 1
    assert summary_data["severity_distribution"]["medium"] == 1

@pytest.mark.asyncio
async def test_pagination_correctness(client: AsyncClient, db_session: AsyncSession):
    """Test pagination limit/offset on repositories and findings."""
    # Seed 3 repositories
    for i in range(1, 4):
        repo = Repository(
            id=300 + i,
            owner_id=1,
            name=f"repo-{i}",
            owner_name="test-org",
            full_name=f"test-org/repo-{i}",
            url=f"https://github.com/test-org/repo-{i}",
            default_branch="main",
            is_private=False,
        )
        db_session.add(repo)
    await db_session.commit()

    # Repositories page 1, size 2
    r_resp = await client.get("/api/repositories?page=1&page_size=2")
    assert r_resp.status_code == 200
    r_data = r_resp.json()
    assert r_data["total"] == 3
    assert len(r_data["items"]) == 2
    assert r_data["page"] == 1
    assert r_data["page_size"] == 2
    assert r_data["pages"] == 2

    # Repositories page 2, size 2
    r_resp2 = await client.get("/api/repositories?page=2&page_size=2")
    assert r_resp2.status_code == 200
    r_data2 = r_resp2.json()
    assert len(r_data2["items"]) == 1
    assert r_data2["page"] == 2
