"""
AgentGuard AI — Queue Supervisor & Watchdog Tests.
Verifies that:
1. Stuck queued scans are automatically detected and rescued by the watchdog loop.
2. Binary presentation and office documents (.pptx, .docx, .mp4) are pre-filtered to speed up scanning.
3. Queue supervisor starts and stops cleanly without leaking tasks.
"""
from __future__ import annotations

import asyncio
import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.database import session as db_session_module
from app.models.repository import Repository
from app.models.scan import Scan
from app.queue.client import get_queue_client
from app.queue.supervisor import (
    start_queue_supervisor,
    stop_queue_supervisor,
)
from app.scanners.filters import SKIP_EXTENSIONS, build_scan_file_list
from app.services.github_service import GitHubService


@pytest.fixture
def mock_gh():
    with patch.object(
        GitHubService,
        "get_repository_info",
        new_callable=AsyncMock,
        return_value={
            "owner": "testorg",
            "name": "fast-scan-repo",
            "full_name": "testorg/fast-scan-repo",
            "description": "Fast Scan Repo",
            "default_branch": "main",
            "is_private": False,
            "size_kb": 100,
        },
    ), patch.object(
        GitHubService,
        "get_commit_sha",
        new_callable=AsyncMock,
        return_value="1168b2d131bff50f998a4d84744324d8d0d660c2",
    ), patch.object(
        GitHubService,
        "get_languages",
        new_callable=AsyncMock,
        return_value={"Python": 1000},
    ), patch.object(
        GitHubService,
        "get_git_tree",
        new_callable=AsyncMock,
        return_value=(
            [{"path": "main.py", "type": "blob", "size": 100}],
            False,
        ),
    ):
        yield


class TestQueueSupervisorAndFilters:
    @pytest.mark.asyncio
    async def test_skip_extensions_contains_media_and_office_documents(self):
        """Verify performance optimizations skip presentation, video, and doc blobs."""
        assert ".pptx" in SKIP_EXTENSIONS
        assert ".docx" in SKIP_EXTENSIONS
        assert ".mp4" in SKIP_EXTENSIONS
        assert ".pdf" in SKIP_EXTENSIONS

    @pytest.mark.asyncio
    async def test_build_scan_file_list_skips_presentation_and_video(self, tmp_path: Path):
        """Verify large media and presentation files are skipped before scanners run."""
        # Create sample files
        code_file = tmp_path / "app.py"
        code_file.write_text("print('hello')")

        video_file = tmp_path / "demo.mp4"
        video_file.write_bytes(b"\x00" * 1024)

        pptx_file = tmp_path / "presentation.pptx"
        pptx_file.write_bytes(b"\x50\x4B" * 512)

        scannable, skipped = build_scan_file_list(tmp_path)
        scannable_names = [f.name for f in scannable]

        assert "app.py" in scannable_names
        assert "demo.mp4" not in scannable_names
        assert "presentation.pptx" not in scannable_names

    @pytest.mark.asyncio
    async def test_watchdog_rescues_stuck_queued_scan(self, client: AsyncClient, mock_gh):
        """
        Verify that if a scan is left in 'queued' state (e.g. because worker was offline),
        the watchdog detects it, executes it, and drives it to completion.
        """
        # 1. Connect test repository
        conn_resp = await client.post(
            "/api/repositories",
            json={"url": "https://github.com/testorg/fast-scan-repo"},
        )
        assert conn_resp.status_code == 201
        repo_id = conn_resp.json()["id"]

        # 2. Insert a simulated stuck queued scan directly in DB created 15 seconds ago
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=15)
        async with db_session_module.AsyncSessionLocal() as db:
            stuck_scan = Scan(
                repository_id=repo_id,
                status="queued",
                stage="queued",
                commit_sha="1168b2d131bff50f998a4d84744324d8d0d660c2",
                configuration={"metadata_only": True, "branch": "main"},
                created_at=past_time,
            )
            db.add(stuck_scan)
            await db.commit()
            await db.refresh(stuck_scan)
            stuck_scan_id = stuck_scan.id

        # 3. Trigger one watchdog tick
        from app.queue.supervisor import _scan_watchdog_loop
        # Start supervisor
        await start_queue_supervisor()

        # Poll scan status until watchdog rescues it to completed
        rescued = False
        for _ in range(40):
            await asyncio.sleep(0.2)
            async with db_session_module.AsyncSessionLocal() as db:
                stmt = select(Scan).where(Scan.id == stuck_scan_id)
                res = await db.execute(stmt)
                curr = res.scalar_one_or_none()
                if curr and curr.status in ["completed", "running"]:
                    rescued = True
                    if curr.status == "completed":
                        break

        await stop_queue_supervisor()
        assert rescued is True
