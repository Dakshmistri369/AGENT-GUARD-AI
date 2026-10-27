"""
Unit and integration tests for Milestone D:
- Database composite & performance indexes on scans and findings
- Dynamic schema synchronization (_sync_database_schema)
- High-efficiency SQL aggregation in Dashboard Summary
- Strict multi-tenant scan endpoint ownership isolation
"""
import datetime
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import inspect, select

from app.database import session as db_session_module
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User


class TestDatabaseIndexesAndSchemaSync:
    @pytest.mark.asyncio
    async def test_scans_and_findings_indexes_exist(self):
        """
        Test 1: Verify that scans and findings tables contain required
        composite and single-column performance indexes for high-concurrency scale.
        """
        async with db_session_module.engine.connect() as conn:
            # Run schema sync to ensure dynamic migrations applied
            from app.main import _sync_database_schema
            await conn.run_sync(_sync_database_schema)

            def get_indexes(connection):
                inspector = inspect(connection)
                scans_indexes = {idx["name"] for idx in inspector.get_indexes("scans")}
                findings_indexes = {idx["name"] for idx in inspector.get_indexes("findings")}
                return scans_indexes, findings_indexes

            scans_idx, findings_idx = await conn.run_sync(get_indexes)

            # Scans indexes
            assert "ix_scans_status" in scans_idx or any("status" in s for s in scans_idx)
            assert "ix_scans_created_at" in scans_idx or any("created_at" in s for s in scans_idx)
            assert "ix_scans_repo_created" in scans_idx
            assert "ix_scans_status_created" in scans_idx

            # Findings indexes
            assert "ix_findings_severity" in findings_idx or any("severity" in f for f in findings_idx)
            assert "ix_findings_scanner" in findings_idx or any("scanner" in f for f in findings_idx)
            assert "ix_findings_classification" in findings_idx or any("classification" in f for f in findings_idx)
            assert "ix_findings_verification_status" in findings_idx or any("verification_status" in f for f in findings_idx)
            assert "ix_findings_scan_severity" in findings_idx


class TestDashboardSQLAggregation:
    @pytest.mark.asyncio
    async def test_dashboard_summary_produces_accurate_aggregated_metrics(
        self, client: AsyncClient
    ):
        """
        Test 2: Verify get_dashboard_summary computes accurate aggregation metrics
        (total scans, severity distribution, false positives, patches, vulnerability
        slices, repo breakdowns, top critical issues) via SQL without in-memory degradation.
        """
        now = datetime.datetime.now(datetime.timezone.utc)

        async with db_session_module.AsyncSessionLocal() as db:
            # Fetch or create demo user
            u_res = await db.execute(select(User).where(User.email == "demo@agentguard.local"))
            user = u_res.scalar_one_or_none()
            if not user:
                user = User(email="demo@agentguard.local", email_verified=True)
                db.add(user)
                await db.commit()
                await db.refresh(user)

            # Create test repository
            repo = Repository(
                owner_id=user.id,
                name="dash-agg-repo",
                owner_name="dash-owner",
                full_name="dash-owner/dash-agg-repo",
                url="https://github.com/dash-owner/dash-agg-repo",
                default_branch="main",
                metadata_json={"file_count": 45},
            )
            db.add(repo)
            await db.commit()
            await db.refresh(repo)

            # Create 2 scans for this repository
            scan1 = Scan(
                repository_id=repo.id,
                status="completed",
                stage="completed",
                commit_sha="commit111",
                created_at=now - datetime.timedelta(days=2),
                completed_at=now - datetime.timedelta(days=2),
            )
            scan2 = Scan(
                repository_id=repo.id,
                status="completed",
                stage="completed",
                commit_sha="commit222",
                created_at=now - datetime.timedelta(days=1),
                completed_at=now - datetime.timedelta(days=1),
            )
            db.add_all([scan1, scan2])
            await db.commit()
            await db.refresh(scan1)
            await db.refresh(scan2)

            # Add diverse findings
            findings_data = [
                # Critical issue from Semgrep (patchable via remediation)
                Finding(
                    scan_id=scan1.id,
                    fingerprint="fp1",
                    title="SQL Injection in auth query",
                    severity="critical",
                    confidence="high",
                    scanner="semgrep",
                    rule_id="python.lang.security.audit.sqli",
                    file_path="app/auth.py",
                    line_number=42,
                    remediation="Use parameterized queries instead of string formatting.",
                    verification_status="confirmed",
                ),
                # High issue from Bandit
                Finding(
                    scan_id=scan1.id,
                    fingerprint="fp2",
                    title="Hardcoded temporary password",
                    severity="high",
                    confidence="high",
                    scanner="bandit",
                    rule_id="B105",
                    file_path="app/config.py",
                    line_number=10,
                    code_snippet='temp_pwd = "secret"',
                    verification_status="unverified",
                ),
                # False positive secret
                Finding(
                    scan_id=scan2.id,
                    fingerprint="fp3",
                    title="Example secret in README",
                    severity="medium",
                    confidence="medium",
                    scanner="detect_secrets",
                    rule_id="SecretKeywordDetector",
                    file_path="README.md",
                    line_number=5,
                    verification_status="false_positive",
                    classification="likely_placeholder",
                ),
                # Low issue from OSV
                Finding(
                    scan_id=scan2.id,
                    fingerprint="fp4",
                    title="Vulnerable dependency urllib3",
                    severity="low",
                    confidence="medium",
                    scanner="osv_scanner",
                    rule_id="GHSA-r64q-w8jr-3hh7",
                    file_path="requirements.txt",
                    line_number=1,
                    verification_status="unverified",
                ),
            ]
            db.add_all(findings_data)
            await db.commit()

        # Call GET /api/dashboard/summary
        resp = await client.get("/api/dashboard/summary")
        assert resp.status_code == 200
        data = resp.json()

        # 1. Scans count
        assert data["scans_and_reviews"]["total_scans"] >= 2
        assert data["scans_and_reviews"]["scans_last_30_days"] >= 2

        # 2. Total issues
        assert data["potential_issues"]["total_issues"] >= 4
        assert data["false_positives"]["count"] >= 1
        assert data["false_positives"]["percentage"] > 0

        # 3. Patches generated: fp1 (remediation), fp2 (code_snippet/bandit), fp4 (osv_scanner)
        assert data["patches_generated"]["count"] >= 3

        # 4. Severity distribution
        sev = data["severity_distribution"]
        assert sev["critical"] >= 1
        assert sev["high"] >= 1
        assert sev["medium"] >= 1
        assert sev["low"] >= 1

        # 5. Most critical issues: top ranked should be critical
        most_crit = data["most_critical_issues"]
        assert len(most_crit) > 0
        assert most_crit[0]["severity"] == "critical"
        assert most_crit[0]["title"] == "SQL Injection in auth query"

        # 6. Scanner health items
        health_keys = {item["engine_key"]: item["findings_count"] for item in data["scanner_health"]}
        assert health_keys.get("semgrep", 0) >= 1
        assert health_keys.get("bandit", 0) >= 1
        assert health_keys.get("detect_secrets", 0) >= 1
        assert health_keys.get("osv_scanner", 0) >= 1

        # 7. Recent activity includes scan records
        recent_scan_ids = [act["id"] for act in data["recent_activity"]]
        assert scan2.id in recent_scan_ids or scan1.id in recent_scan_ids


class TestMultiTenantScanOwnershipIsolation:
    @pytest.mark.asyncio
    async def test_unauthorized_user_cannot_access_other_users_scans(
        self, client: AsyncClient, other_user_client: AsyncClient
    ):
        """
        Test 3: Multi-tenant ownership isolation.
        A user (User B / other_user_client) must never be able to read, cancel,
        or query scan results belonging to User A (client), returning HTTP 404 access denied.
        """
        async with db_session_module.AsyncSessionLocal() as db:
            # User A (id=1) repository & scan
            repo_a = Repository(
                owner_id=1,
                name="private-vault",
                owner_name="usera",
                full_name="usera/private-vault",
                url="https://github.com/usera/private-vault",
                default_branch="main",
            )
            db.add(repo_a)
            await db.commit()
            await db.refresh(repo_a)

            scan_a = Scan(
                repository_id=repo_a.id,
                status="running",
                stage="running_scanners",
                commit_sha="usera123",
            )
            db.add(scan_a)
            await db.commit()
            await db.refresh(scan_a)
            scan_a_id = scan_a.id
            repo_a_id = repo_a.id

        # User B (other_user_client) attempts to access User A's scan and repository:
        # 1. GET /api/scans/{id}
        r1 = await other_user_client.get(f"/api/scans/{scan_a_id}")
        assert r1.status_code == 404
        assert "not found or access denied" in r1.json()["detail"].lower()

        # 2. GET /api/scans/{id}/status
        r2 = await other_user_client.get(f"/api/scans/{scan_a_id}/status")
        assert r2.status_code == 404
        assert "not found or access denied" in r2.json()["detail"].lower()

        # 3. GET /api/scans/{id}/results
        r3 = await other_user_client.get(f"/api/scans/{scan_a_id}/results")
        assert r3.status_code == 404
        assert "not found or access denied" in r3.json()["detail"].lower()

        # 4. GET /api/scans/{id}/report
        r4 = await other_user_client.get(f"/api/scans/{scan_a_id}/report")
        assert r4.status_code == 404
        assert "access denied" in r4.json()["detail"].lower()

        # 5. POST /api/scans/{id}/cancel
        r5 = await other_user_client.post(f"/api/scans/{scan_a_id}/cancel")
        assert r5.status_code == 404
        assert "not found or access denied" in r5.json()["detail"].lower()

        # 6. GET /api/repositories/{id}/scans
        r6 = await other_user_client.get(f"/api/repositories/{repo_a_id}/scans")
        assert r6.status_code == 404
        assert "access denied" in r6.json()["detail"].lower()
