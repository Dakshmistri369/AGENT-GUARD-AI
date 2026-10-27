"""
AgentGuard AI — Milestone A Asynchronous Scanning & Queue Test Suite.
Tests:
1. queued -> running -> completed transitions via HTTP 202 async endpoint
2. Duplicate-enqueue idempotency (dedup token / scan_id prevents double run)
3. Forced worker failure producing retries with backoff and Dead-Letter Queue (DLQ) entry
4. Honest scan coverage rule: Scan with failed/unavailable scanner NEVER reports clean/completed
5. Worker heartbeat liveness and queue status monitoring
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.database import session as db_session_module
from app.models.repository import Repository
from app.models.scan import Scan
from app.queue.client import get_queue_client
from app.queue.worker import run_scan_job_in_memory
from app.services.github_service import GitHubService
from app.services.scan_execution_service import ScanExecutionService


@pytest.fixture
def mock_github_services():
    """Mock external GitHub API calls for deterministic fast execution."""
    with patch.object(
        GitHubService,
        "get_repository_info",
        new_callable=AsyncMock,
        return_value={
            "owner": "testorg",
            "name": "async-repo",
            "full_name": "testorg/async-repo",
            "description": "Async Test Repo",
            "default_branch": "main",
            "is_private": False,
            "size_kb": 50,
        },
    ), patch.object(
        GitHubService,
        "get_commit_sha",
        new_callable=AsyncMock,
        return_value="abcdef1234567890abcdef1234567890abcdef12",
    ), patch.object(
        GitHubService,
        "get_languages",
        new_callable=AsyncMock,
        return_value={"Python": 2000},
    ), patch.object(
        GitHubService,
        "get_git_tree",
        new_callable=AsyncMock,
        return_value=(
            [
                {"path": "README.md", "type": "blob", "size": 150},
                {"path": "main.py", "type": "blob", "size": 500},
            ],
            False,
        ),
    ):
        yield


class TestAsyncScanQueueLifecycle:
    @pytest.mark.asyncio
    async def test_queued_running_completed_lifecycle(
        self, client: AsyncClient, mock_github_services
    ):
        """
        Test 1: Verify non-blocking HTTP 202 response, initial queued status,
        and eventual asynchronous transition to completed.
        """
        # 1. Connect test repository
        conn_resp = await client.post(
            "/api/repositories",
            json={"url": "https://github.com/testorg/async-repo"},
        )
        assert conn_resp.status_code == 201
        repo_id = conn_resp.json()["id"]

        # 2. Trigger scan (must return HTTP 202 Accepted immediately)
        analyze_resp = await client.post(
            f"/api/repositories/{repo_id}/analyze",
            json={"metadata_only": True},
        )
        assert analyze_resp.status_code == 202
        scan_data = analyze_resp.json()
        scan_id = scan_data["id"]
        assert scan_data["status"] == "queued"
        assert scan_data["stage"] == "queued"

        # 3. Poll scan status until completed
        terminal_scan = None
        for _ in range(30):
            await asyncio.sleep(0.1)
            st_resp = await client.get(f"/api/scans/{scan_id}")
            assert st_resp.status_code == 200
            cur = st_resp.json()
            if cur["status"] in ["completed", "failed", "timed_out_partial"]:
                terminal_scan = cur
                break

        assert terminal_scan is not None, "Scan did not reach terminal status in time"
        assert terminal_scan["status"] == "completed"
        assert terminal_scan["stage"] == "completed"
        assert terminal_scan["completed_at"] is not None

        # 4. Fetch full report
        rep_resp = await client.get(f"/api/scans/{scan_id}/report")
        assert rep_resp.status_code == 200
        assert rep_resp.json()["scan_id"] == scan_id

    @pytest.mark.asyncio
    async def test_duplicate_enqueue_idempotency(
        self, client: AsyncClient, mock_github_services
    ):
        """
        Test 2: Duplicate enqueue of the same repository while a scan is active
        must return the existing scan and prevent duplicate worker executions.
        """
        conn_resp = await client.post(
            "/api/repositories",
            json={"url": "https://github.com/testorg/async-repo-idemp"},
        )
        assert conn_resp.status_code == 201
        repo_id = conn_resp.json()["id"]

        # First trigger
        resp1 = await client.post(
            f"/api/repositories/{repo_id}/analyze",
            json={"metadata_only": True},
        )
        assert resp1.status_code == 202
        scan1 = resp1.json()

        # Immediate second trigger (idempotency check)
        resp2 = await client.post(
            f"/api/repositories/{repo_id}/analyze",
            json={"metadata_only": True},
        )
        assert resp2.status_code == 202
        scan2 = resp2.json()

        # Must return the EXACT same scan record without creating a second one
        assert scan1["id"] == scan2["id"]

        # Verify in DB: only one scan record exists for this repo
        async with db_session_module.AsyncSessionLocal() as db:
            stmt = select(Scan).where(Scan.repository_id == repo_id)
            res = await db.execute(stmt)
            scans_for_repo = res.scalars().all()
            assert len(scans_for_repo) == 1

        # Test queue client level deduplication key
        q_client = get_queue_client()
        dedup_res1 = await q_client.enqueue_scan(scan_id=9999, repository_id=repo_id)
        assert dedup_res1["enqueued"] is True
        dedup_res2 = await q_client.enqueue_scan(scan_id=9999, repository_id=repo_id)
        assert dedup_res2["enqueued"] is False
        assert dedup_res2["reason"] == "duplicate"


class TestWorkerFailureAndDeadLetterQueue:
    @pytest.mark.asyncio
    async def test_forced_worker_failure_produces_retry_then_dead_letter(self):
        """
        Test 3: When a worker encounters persistent failures, it must retry
        with backoff up to max_retries and push the permanently failed job
        to the Dead-Letter Queue (DLQ).
        """
        q_client = get_queue_client()
        initial_dlq_count = len(await q_client.get_dead_letter_jobs())

        test_scan_id = 8888
        test_dedup_key = f"scan_{test_scan_id}"

        # Mock execute_scan to always raise RuntimeError
        with patch.object(
            ScanExecutionService,
            "execute_scan",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Simulated infrastructure crash"),
        ):
            # Run in-memory worker with max_retries=3 and short delays for fast test
            result = await run_scan_job_in_memory(
                scan_id=test_scan_id,
                dedup_key=test_dedup_key,
                max_retries=3,
                retry_delays=[0.01, 0.02, 0.03],
            )

            assert result["status"] == "failed"
            assert "DLQ: Exhausted 3 retries" in result["error"]

        # Verify DLQ contains the failed job
        dlq_jobs = await q_client.get_dead_letter_jobs()
        assert len(dlq_jobs) == initial_dlq_count + 1
        latest_dlq = dlq_jobs[-1]
        assert latest_dlq["scan_id"] == test_scan_id
        assert latest_dlq["retry_count"] == 3
        assert "Simulated infrastructure crash" in latest_dlq["error_detail"]


class TestHonestScanCoverageRule:
    @pytest.mark.asyncio
    async def test_scan_with_unavailable_scanner_never_reports_clean(
        self, client: AsyncClient, mock_github_services
    ):
        """
        Test 4: HONEST SCAN COVERAGE RULE.
        A scan must NEVER be marked "completed" (clean) if a required scanner
        failed or was unavailable on the host. It must report failed with
        an explicit list of missing/failed scanners.
        """
        # Create a repo & scan
        conn_resp = await client.post(
            "/api/repositories",
            json={"url": "https://github.com/testorg/coverage-repo"},
        )
        assert conn_resp.status_code == 201
        repo_id = conn_resp.json()["id"]

        async with db_session_module.AsyncSessionLocal() as db:
            scan = Scan(
                repository_id=repo_id,
                status="queued",
                stage="queued",
                configuration={"metadata_only": False},
            )
            db.add(scan)
            await db.commit()
            await db.refresh(scan)
            scan_id = scan.id

        # Mock ScannerOrchestrator to simulate that Bandit and Semgrep were unavailable
        mock_coverage = {
            "is_complete": False,
            "job_timed_out": False,
            "applicable_scanners": ["Semgrep", "Bandit"],
            "executed_scanners": [],
            "missing_scanners": ["Semgrep", "Bandit"],
            "failed_scanners": [],
            "skipped_scanners": [],
            "notes": ["Semgrep was not installed on host PATH", "Bandit was not installed on host PATH"],
            "files_discovered": 5,
            "files_scanned": 0,
            "files_skipped": 5,
            "skip_manifest": {},
        }

        with patch(
            "app.services.scan_execution_service.ScannerOrchestrator.run_scans",
            new_callable=AsyncMock,
            return_value=([], [], mock_coverage, {}),
        ), patch(
            "app.services.scan_execution_service.GitService.is_git_available",
            return_value=True,
        ), patch(
            "app.services.scan_execution_service.GitService.clone_repository",
            new_callable=AsyncMock,
        ):
            svc = ScanExecutionService()
            result = await svc.execute_scan(scan_id)

            # Must NEVER be "completed" / clean!
            assert result["status"] != "completed", "Scan was marked completed despite missing scanners!"
            assert result["status"] == "failed"
            assert "Bandit" in result["error"]
            assert "Semgrep" in result["error"]
            assert "Scan coverage is incomplete and cannot be certified clean" in result["error"]

            # Verify in DB
            async with db_session_module.AsyncSessionLocal() as db:
                db_scan = await db.get(Scan, scan_id)
                assert db_scan.status == "failed"
                assert "Required security scanner(s) failed or unavailable" in db_scan.error_message


class TestWorkerHeartbeatAndQueueStatusAPI:
    @pytest.mark.asyncio
    async def test_queue_status_endpoint_reports_heartbeats_and_dlq(self, client: AsyncClient):
        """
        Test 5: Verify GET /api/scans/queue/status returns worker liveness,
        queue configuration, and dead-letter records.
        """
        q_client = get_queue_client()
        await q_client.record_heartbeat("worker-node-test-1", {"status": "healthy", "jobs_processed": 42})

        resp = await client.get("/api/scans/queue/status")
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] == "online"
        assert "redis_connected" in data
        assert "queue_name" in data
        assert "worker_heartbeats" in data
        assert any(hb["worker_id"] == "worker-node-test-1" for hb in data["worker_heartbeats"])
        assert "dead_letter_jobs" in data
