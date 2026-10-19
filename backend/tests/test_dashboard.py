"""
Unit and integration tests for Dashboard Analytics, False Positive Marking, and Scan Comparison.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_dashboard_summary_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/dashboard/summary")
        assert res.status_code == 200
        data = res.json()
        assert "scans_and_reviews" in data
        assert "false_positives" in data
        assert "potential_issues" in data
        assert "patches_generated" in data
        assert "vulnerability_types" in data
        assert "severity_distribution" in data
        assert "most_critical_issues" in data
        assert "issues_by_repository" in data
        assert "scanner_health" in data
        assert "metrics" in data
        assert "recent_activity" in data


@pytest.mark.asyncio
async def test_finding_status_update_and_summary_reflection():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Get repos
        r_res = await ac.get("/api/repositories")
        assert r_res.status_code == 200
        repos = r_res.json()["items"]
        if not repos:
            pytest.skip("No repositories in test database")

        repo_id = repos[0]["id"]
        scans_res = await ac.get(f"/api/repositories/{repo_id}/scans")
        scans = scans_res.json()
        if not scans:
            pytest.skip("No scans in test database")

        scan_id = scans[0]["id"]
        report_res = await ac.get(f"/api/scans/{scan_id}/report")
        findings = report_res.json()["findings"]
        if not findings:
            pytest.skip("No findings in test scan")

        finding_id = findings[0]["id"]

        # Mark as false positive
        patch_res = await ac.patch(
            f"/api/findings/{finding_id}/status",
            json={"status": "false_positive", "notes": "Audited as test mock credential"},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["verification_status"] == "false_positive"

        # Check summary reflects false positive
        sum_res = await ac.get("/api/dashboard/summary")
        assert sum_res.status_code == 200
        sum_data = sum_res.json()
        assert sum_data["false_positives"]["count"] >= 1

        # Revert
        revert_res = await ac.patch(
            f"/api/findings/{finding_id}/status",
            json={"status": "unverified"},
        )
        assert revert_res.status_code == 200
        assert revert_res.json()["verification_status"] == "unverified"
