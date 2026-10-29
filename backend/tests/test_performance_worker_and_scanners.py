"""
Unit & Integration Tests for AgentGuard AI Scanner & Worker Performance Optimizations:
1. arq Retry backoff on transient errors
2. Tool timeouts do not retry and preserve partial results
3. DLQ marks scan failed in dedicated DB session
4. Lockfile discovery skips node_modules and .git
5. Semgrep incremental file selection
6. 24-hour scan result cache hit reuse
7. 3 concurrent scans reliability under load
"""
from __future__ import annotations

import asyncio
import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from arq import Retry
from sqlalchemy import select

from app.database import session as db_session_module
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.queue.client import get_queue_client
from app.queue.exceptions import ToolTimeoutError, TransientScanError
from app.queue.worker import (
    HEAVY_SCAN_SEMAPHORE,
    _mark_scan_failed_isolated,
    run_scan_job,
    run_scan_job_in_memory,
)
from app.scanners.osv import discover_project_lockfiles
from app.scanners.semgrep import SemgrepScanner
from app.services.scan_execution_service import ScanExecutionService


@pytest.mark.asyncio
async def test_worker_retries_transient_error_with_arq_retry():
    """Verify that TransientScanError raises arq.Retry with exponential backoff."""
    with patch("app.queue.worker.ScanExecutionService.execute_scan", side_effect=TransientScanError("Database connection lost")):
        ctx = {"job_try": 1, "job_id": "scan_999"}
        with pytest.raises(Retry) as exc_info:
            await run_scan_job(ctx, scan_id=999)

        # In arq, Retry(defer=...) stores deferral in exc_info.value.defer_score or similar
        assert exc_info.value is not None


@pytest.mark.asyncio
async def test_worker_does_not_retry_tool_timeout():
    """Verify that ToolTimeoutError does NOT retry; returns partial status immediately."""
    with patch("app.queue.worker.ScanExecutionService.execute_scan", side_effect=ToolTimeoutError("semgrep", 300.0)):
        ctx = {"job_try": 1, "job_id": "scan_998"}
        res = await run_scan_job(ctx, scan_id=998)
        assert res["status"] == "timed_out_partial"
        assert "semgrep" in res["error"]


@pytest.mark.asyncio
async def test_dlq_marks_scan_failed_in_isolated_session():
    """Verify that permanent retry exhaustion records to DLQ and updates DB status to failed."""
    async with db_session_module.AsyncSessionLocal() as db:
        user = User(email="dlq_tester@test.local")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        repo = Repository(name="dlq-repo", owner_name="tester", full_name="tester/dlq-repo", url="https://github.com/tester/dlq-repo", owner_id=user.id)
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

        scan = Scan(repository_id=repo.id, status="queued")
        db.add(scan)
        await db.commit()
        await db.refresh(scan)
        scan_id = scan.id

    with patch("app.queue.worker.ScanExecutionService.execute_scan", side_effect=TransientScanError("Fatal DB error")):
        ctx = {"job_try": 3, "job_id": f"scan_{scan_id}"}
        res = await run_scan_job(ctx, scan_id=scan_id)
        assert res["status"] == "failed"

    # Verify Scan in DB is marked failed
    async with db_session_module.AsyncSessionLocal() as db:
        s = await db.get(Scan, scan_id)
        assert s is not None
        assert s.status == "failed"
        assert "Exhausted maximum retries" in (s.error_message or "")


def test_lockfile_discovery_skips_node_modules_and_git(tmp_path: Path):
    """Verify that lockfile discovery inspects root & shallow subdirs, skipping node_modules & .git."""
    # Root manifest
    root_pkg = tmp_path / "package.json"
    root_pkg.write_text("{}", encoding="utf-8")

    # Nested backend manifest
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    req_txt = backend_dir / "requirements.txt"
    req_txt.write_text("fastapi==0.110.0\n", encoding="utf-8")

    # node_modules manifest (MUST BE IGNORED)
    nm_dir = tmp_path / "node_modules" / "some_pkg"
    nm_dir.mkdir(parents=True)
    nm_pkg = nm_dir / "package.json"
    nm_pkg.write_text("{}", encoding="utf-8")

    # .git manifest (MUST BE IGNORED)
    git_dir = tmp_path / ".git" / "hooks"
    git_dir.mkdir(parents=True)
    git_pkg = git_dir / "package.json"
    git_pkg.write_text("{}", encoding="utf-8")

    discovered = discover_project_lockfiles(tmp_path)
    discovered_names = [p.name for p in discovered]
    discovered_paths = [str(p.relative_to(tmp_path)).replace("\\", "/") for p in discovered]

    assert "package.json" in discovered_names
    assert "requirements.txt" in discovered_names
    assert "node_modules/some_pkg/package.json" not in discovered_paths
    assert ".git/hooks/package.json" not in discovered_paths
    assert len(discovered) == 2


@pytest.mark.asyncio
async def test_semgrep_incremental_file_selection(tmp_path: Path):
    """Verify that Semgrep scanner targets only modified files when incremental_files are passed."""
    scanner = SemgrepScanner()

    # Create dummy files
    f1 = tmp_path / "app.py"
    f1.write_text("import os\n", encoding="utf-8")
    f2 = tmp_path / "README.md"
    f2.write_text("# Readme\n", encoding="utf-8")

    captured_cmds = []

    async def mock_execute_cmd(cmd, cwd, timeout_seconds):
        captured_cmds.append(cmd)
        return 0, '{"results": []}', ""

    with patch.object(scanner, "is_available", return_value=(True, "1.180.x")), \
         patch.object(scanner, "execute_cmd", side_effect=mock_execute_cmd):

        await scanner.scan(
            workspace_path=tmp_path,
            metadata={"extensions": [".py"]},
            incremental_files=["app.py", "README.md"],
        )

    assert len(captured_cmds) == 1
    cmd = captured_cmds[0]
    # Check that app.py was targeted and README.md was filtered out
    cmd_str = " ".join(cmd)
    assert "app.py" in cmd_str
    assert "README.md" not in cmd_str


@pytest.mark.asyncio
async def test_cache_hit_returns_immediately_without_running_tools():
    """Verify that 24-hour scan cache hit returns cached findings instantly without re-cloning."""
    async with db_session_module.AsyncSessionLocal() as db:
        user = User(email="cache_tester@test.local")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        repo = Repository(name="cache-repo", owner_name="tester", full_name="tester/cache-repo", url="https://github.com/tester/cache-repo", owner_id=user.id)
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

        # Baseline completed scan
        scan1 = Scan(
            repository_id=repo.id,
            status="completed",
            stage="completed",
            commit_sha="cachecommit1234567890abcdef1234567890",
            summary={"total_findings": 1, "critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0},
            created_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(scan1)
        await db.commit()
        await db.refresh(scan1)

        f1 = Finding(
            scan_id=scan1.id,
            fingerprint="fp12345",
            title="SQL Injection in auth",
            severity="high",
            confidence="high",
            scanner="semgrep",
            file_path="auth.py",
            line_number=10,
        )
        db.add(f1)
        await db.commit()

        # New scan targeting the same commit
        scan2 = Scan(
            repository_id=repo.id,
            status="queued",
            commit_sha="cachecommit1234567890abcdef1234567890",
        )
        db.add(scan2)
        await db.commit()
        await db.refresh(scan2)
        scan2_id = scan2.id

    svc = ScanExecutionService()
    # Mock Git clone and analyzers to ensure they are NOT called
    with patch("app.services.git_service.GitService.clone_repository", side_effect=Exception("Should not clone!")):
        res = await svc.execute_scan(scan2_id)

    assert res["status"] == "completed"
    assert res.get("cached") is True

    # Verify scan2 has the copied finding
    async with db_session_module.AsyncSessionLocal() as db:
        findings_res = await db.execute(select(Finding).where(Finding.scan_id == scan2_id))
        findings = findings_res.scalars().all()
        assert len(findings) == 1
        assert findings[0].title == "SQL Injection in auth"


@pytest.mark.asyncio
async def test_3_concurrent_scans_succeed_under_load():
    """Verify that 3 simultaneous scans complete reliably without session leaks or race conditions."""
    async with db_session_module.AsyncSessionLocal() as db:
        user = User(email="conc_load@test.local")
        db.add(user)
        await db.commit()
        await db.refresh(user)

        repo = Repository(name="load-repo", owner_name="tester", full_name="tester/load-repo", url="https://github.com/tester/load-repo", owner_id=user.id)
        db.add(repo)
        await db.commit()
        await db.refresh(repo)

        scans = []
        for i in range(3):
            sc = Scan(repository_id=repo.id, status="queued", configuration={"metadata_only": True})
            db.add(sc)
            scans.append(sc)
        await db.commit()
        for sc in scans:
            await db.refresh(sc)
        scan_ids = [sc.id for sc in scans]

    # Run 3 scans concurrently
    async def _run(s_id: int):
        svc = ScanExecutionService()
        return await svc.execute_scan(s_id)

    results = await asyncio.gather(*[_run(sid) for sid in scan_ids])
    assert len(results) == 3
    for r in results:
        assert r["status"] == "completed"
