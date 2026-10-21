"""
Real verification tests for AgentGuard AI n8n automation API endpoints.
Tests verify:
- POST /api/projects/{project_id}/scans (Workflow 1 trigger)
- GET /api/scans/{scan_id}/status (Workflow 2 polling)
- GET /api/scans/{scan_id}/results (Workflow 2/4 findings & coverage evaluation)
- POST /api/scans/{scan_id}/notifications-log (Workflow 4/8 audit logging)
- GET /api/scans/{scan_id}/report (Workflow 5 report generation & delivery)
- GET /api/projects?schedule_enabled=true (Workflow 6 recurring scan scheduler)
- Strict user ownership isolation across all automation endpoints (404 on cross-user access)
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finding import Finding
from app.models.project import Project
from app.models.scan import Scan


@pytest.mark.asyncio
async def test_n8n_health_endpoint_available(client: AsyncClient):
    """Workflow 7: GET /health returns 200 OK with service statuses."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ["healthy", "degraded", "ready"]
    assert "database" in data


@pytest.mark.asyncio
async def test_n8n_trigger_project_scan_success(client: AsyncClient):
    """Workflow 1: POST /api/projects/{id}/scans creates a verifiable scan."""
    # Create project first
    proj_resp = await client.post("/api/projects", json={"name": "Auto Project"})
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    # Trigger scan
    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "n8n_workflow_1", "ref": "commit_sha_123"},
    )
    assert scan_resp.status_code == 201
    scan_data = scan_resp.json()
    assert "id" in scan_data
    assert scan_data["project_id"] == project_id
    assert scan_data["status"] in ["completed", "running", "pending"]
    assert scan_data["trigger_source"] == "n8n_workflow_1"


@pytest.mark.asyncio
async def test_n8n_trigger_project_scan_404_nonexistent(client: AsyncClient):
    """POST /api/projects/{id}/scans returns 404 for nonexistent project."""
    scan_resp = await client.post(
        "/api/projects/999999/scans",
        json={"trigger_source": "manual"},
    )
    assert scan_resp.status_code == 404


@pytest.mark.asyncio
async def test_n8n_scan_status_polling(client: AsyncClient):
    """Workflow 2: GET /api/scans/{id}/status returns scan status for polling loop."""
    # Create project and scan
    proj_resp = await client.post("/api/projects", json={"name": "Polling Project"})
    project_id = proj_resp.json()["id"]

    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    scan_id = scan_resp.json()["id"]

    # Poll status
    status_resp = await client.get(f"/api/scans/{scan_id}/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["id"] == scan_id
    assert "status" in status_data
    assert status_data["project_name"] == "Polling Project"


@pytest.mark.asyncio
async def test_n8n_scan_results_summary_and_coverage(client: AsyncClient, db_session: AsyncSession):
    """
    Workflow 2/4: GET /api/scans/{id}/results returns deterministic vs AI findings
    and honest coverage indicators required by n8n Set node.
    """
    proj_resp = await client.post("/api/projects", json={"name": "Findings Project"})
    project_id = proj_resp.json()["id"]

    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    scan_id = scan_resp.json()["id"]

    # Seed findings: 1 deterministic Semgrep critical, 1 AI-pipeline finding
    f1 = Finding(
        scan_id=scan_id,
        title="Hardcoded AWS Access Key",
        severity="critical",
        confidence="high",
        scanner="detect-secrets",
        file_path="src/config.py",
        line_number=10,
    )
    f2 = Finding(
        scan_id=scan_id,
        title="AI-Estimated Injection Risk",
        severity="high",
        confidence="medium",
        scanner="ai_nemotron_pipeline",
        file_path="src/query.py",
        line_number=25,
    )
    db_session.add(f1)
    db_session.add(f2)
    await db_session.commit()

    results_resp = await client.get(f"/api/scans/{scan_id}/results")
    assert results_resp.status_code == 200
    data = results_resp.json()

    # Summary
    assert data["summary"]["critical"] == 1
    assert data["summary"]["high"] == 1
    assert data["summary"]["total"] == 2

    # Deterministic vs AI separation
    findings = data["findings"]
    assert len(findings) == 2
    det_findings = [f for f in findings if f["source"] != "ai_pipeline"]
    ai_findings = [f for f in findings if f["source"] == "ai_pipeline"]
    assert len(det_findings) == 1
    assert det_findings[0]["scanner"] == "detect-secrets"
    assert len(ai_findings) == 1
    assert ai_findings[0]["source"] == "ai_pipeline"

    # Coverage
    assert "coverage" in data
    assert data["coverage"]["files_scanned"] >= 1
    assert "coverage_percentage" in data["coverage"]


@pytest.mark.asyncio
async def test_n8n_notifications_log_endpoint(client: AsyncClient):
    """Workflow 4/8: POST /api/scans/{id}/notifications-log logs delivery audit trail."""
    proj_resp = await client.post("/api/projects", json={"name": "Notify Project"})
    project_id = proj_resp.json()["id"]

    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    scan_id = scan_resp.json()["id"]

    # Log Slack notification
    log_resp = await client.post(
        f"/api/scans/{scan_id}/notifications-log",
        json={"channel": "slack", "delivered": True},
    )
    assert log_resp.status_code == 200
    log_data = log_resp.json()
    assert log_data["status"] == "logged"
    assert log_data["scan_id"] == scan_id
    assert log_data["channel"] == "slack"
    assert log_data["delivered"] is True
    assert "timestamp" in log_data


@pytest.mark.asyncio
async def test_n8n_scan_report_delivery(client: AsyncClient):
    """Workflow 5: GET /api/scans/{id}/report succeeds for project-based scans."""
    proj_resp = await client.post("/api/projects", json={"name": "Report Project"})
    project_id = proj_resp.json()["id"]

    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    scan_id = scan_resp.json()["id"]

    report_resp = await client.get(f"/api/scans/{scan_id}/report")
    assert report_resp.status_code == 200
    report_data = report_resp.json()
    assert report_data["scan_id"] == scan_id
    assert "summary" in report_data
    assert "findings" in report_data


@pytest.mark.asyncio
async def test_n8n_scheduled_projects_list(client: AsyncClient):
    """Workflow 6: GET /api/projects?schedule_enabled=true accepts query parameter."""
    resp = await client.get("/api/projects?schedule_enabled=true")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_n8n_cross_user_isolation(client: AsyncClient, other_user_client: AsyncClient):
    """Strict isolation: User B receives 404 when querying User A's scans or results."""
    # User A creates project and scan
    proj_resp = await client.post("/api/projects", json={"name": "User A Private"})
    project_id = proj_resp.json()["id"]

    scan_resp = await client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    scan_id = scan_resp.json()["id"]

    # User B attempts to access scan status -> 404
    status_b = await other_user_client.get(f"/api/scans/{scan_id}/status")
    assert status_b.status_code == 404

    # User B attempts to access scan results -> 404
    results_b = await other_user_client.get(f"/api/scans/{scan_id}/results")
    assert results_b.status_code == 404

    # User B attempts to trigger scan on User A's project -> 404
    trigger_b = await other_user_client.post(
        f"/api/projects/{project_id}/scans",
        json={"trigger_source": "manual"},
    )
    assert trigger_b.status_code == 404

    # User B attempts to log notification -> 404
    log_b = await other_user_client.post(
        f"/api/scans/{scan_id}/notifications-log",
        json={"channel": "slack", "delivered": True},
    )
    assert log_b.status_code == 404
