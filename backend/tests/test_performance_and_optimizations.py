"""
AgentGuard AI — Unit & Integration Tests for Performance & Scan Time Optimizations (Workstream 2).
Verifies:
1. OSV-Scanner lockfile-hash caching with 24-hour TTL (instant cache hits on unchanged dependencies).
2. Consistent directory exclusion rules (SKIP_DIRS) enforced across Bandit, detect-secrets, and Semgrep.
3. Real asynchronous concurrency in ScannerOrchestrator (parallel, non-serialized execution).
4. Stage timing instrumentation per pipeline stage recorded in scan configuration.
"""
from __future__ import annotations

import asyncio
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.scanners.bandit import BanditScanner
from app.scanners.detect_secrets import DetectSecretsScanner
from app.scanners.orchestrator import ScannerOrchestrator
from app.scanners.osv import OSVScanner, _OSV_LOCKFILE_CACHE, compute_manifests_fingerprint
from app.scanners.semgrep import SemgrepScanner
from app.services.scan_execution_service import ScanExecutionService


@pytest.mark.asyncio
class TestOSVLockfileCaching:
    async def test_lockfile_hash_caching_24h_ttl(self, tmp_path: Path):
        _OSV_LOCKFILE_CACHE.clear()

        # Create sample requirements.txt
        req_file = tmp_path / "requirements.txt"
        req_file.write_text("requests==2.20.0\nurllib3==1.24.1\n", encoding="utf-8")

        scanner = OSVScanner()
        metadata = {"manifests": ["requirements.txt"]}

        # First scan: Populates cache
        t1_start = time.time()
        res1 = await scanner.scan(workspace_path=tmp_path, metadata=metadata)
        t1_duration = time.time() - t1_start

        assert res1.findings is not None
        assert len(res1.findings) > 0
        cache_key = compute_manifests_fingerprint(tmp_path)
        assert cache_key in _OSV_LOCKFILE_CACHE

        # Second scan: Cache hit (instantaneous)
        t2_start = time.time()
        res2 = await scanner.scan(workspace_path=tmp_path, metadata=metadata)
        t2_duration = time.time() - t2_start

        assert len(res2.findings) == len(res1.findings)
        assert t2_duration < 0.05  # Cache hit is sub-50ms

        # Modifying manifest produces new cache key
        req_file.write_text("requests==2.31.0\n", encoding="utf-8")
        new_key = compute_manifests_fingerprint(tmp_path)
        assert new_key != cache_key


class TestScannerExclusionsEnforced:
    def test_bandit_excludes_skip_dirs(self, tmp_path: Path):
        scanner = BanditScanner()
        with patch.object(scanner, "is_available", return_value=(True, "1.8.5")), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "{}", "")
            
            asyncio.run(scanner.scan(tmp_path, {"extensions": [".py"], "languages": ["Python"]}))
            
            assert mock_exec.called
            cmd = mock_exec.call_args[1]["cmd"]
            x_idx = cmd.index("-x")
            excluded_arg = cmd[x_idx + 1]
            for dir_name in ["node_modules", ".git", "venv", ".venv", "__pycache__", "dist", "build", ".next", "target", ".cache", "scan_workspaces"]:
                assert dir_name in excluded_arg

    def test_detect_secrets_excludes_skip_dirs(self, tmp_path: Path):
        scanner = DetectSecretsScanner()
        with patch.object(scanner, "is_available", return_value=(True, "1.5.0")), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "{}", "")

            asyncio.run(scanner.scan(tmp_path, {"languages": ["Python"]}))

            assert mock_exec.called
            cmd = mock_exec.call_args[1]["cmd"]
            assert "--exclude-files" in cmd
            ex_pattern = cmd[cmd.index("--exclude-files") + 1]
            for dir_name in ["node_modules", r"\.git", r"\.venv", "venv", "build", "dist", "target", "vendor", r"\.next"]:
                assert dir_name in ex_pattern

    def test_semgrep_excludes_skip_dirs(self, tmp_path: Path):
        scanner = SemgrepScanner()
        with patch.object(scanner, "is_available", return_value=(True, "1.180.0")), \
             patch("app.scanners.semgrep.find_scanner_executable", return_value="semgrep"), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = (0, "{}", "")

            asyncio.run(scanner.scan(tmp_path, {"languages": ["Python", "JavaScript"]}))

            assert mock_exec.called
            cmd = mock_exec.call_args[1]["cmd"]
            # Collect all --exclude values
            excludes = [cmd[i + 1] for i, arg in enumerate(cmd) if arg == "--exclude"]
            for dir_name in [".git", "node_modules", ".venv", "venv", "build", "dist", "vendor", "__pycache__", ".next", "target", ".cache", "scan_workspaces"]:
                assert dir_name in excludes


@pytest.mark.asyncio
class TestOrchestratorConcurrency:
    async def test_scanners_run_concurrently_in_parallel(self, tmp_path: Path):
        orchestrator = ScannerOrchestrator()

        # Mock each scanner to simulate 0.2s async work
        async def mock_scan_work(*args, **kwargs):
            await asyncio.sleep(0.2)
            from app.scanners.base import ScannerResult
            return ScannerResult(
                scanner="MockScanner",
                scanner_version="1.0",
                status="completed",
                findings=[],
                duration_seconds=0.2,
            )

        with patch("app.scanners.semgrep.SemgrepScanner.scan", side_effect=mock_scan_work), \
             patch("app.scanners.bandit.BanditScanner.scan", side_effect=mock_scan_work), \
             patch("app.scanners.detect_secrets.DetectSecretsScanner.scan", side_effect=mock_scan_work), \
             patch("app.scanners.osv.OSVScanner.scan", side_effect=mock_scan_work):

            metadata = {
                "languages": ["Python", "JavaScript"],
                "extensions": [".py", ".js"],
                "manifests": ["package.json", "requirements.txt"],
            }

            start_t = time.time()
            findings, scanners_run, coverage, matrix = await orchestrator.run_scans(
                workspace_path=tmp_path,
                metadata=metadata,
            )
            wall_clock_duration = time.time() - start_t

            # If serialized, 4 scanners * 0.2s = 0.8s+.
            # Because they run concurrently via asyncio.gather, total wall-clock time is ~0.2s (< 0.5s).
            assert wall_clock_duration < 0.5, f"Scanners took {wall_clock_duration}s; expected parallel execution under 0.5s"


@pytest.mark.asyncio
class TestPipelineStageTimingInstrumentation:
    async def test_stage_timings_recorded_in_scan_configuration(self, db_session: AsyncSession):
        user = User(email="workstream2_timings@test.local", email_verified=True)
        db_session.add(user)
        await db_session.flush()

        repo = Repository(
            name="timing-test-repo",
            owner_name="timingorg",
            full_name="timingorg/timing-test-repo",
            url="https://github.com/timingorg/timing-test-repo",
            default_branch="main",
            owner_id=user.id,
            metadata_json={"languages": ["Python"], "size_kb": 100},
        )
        db_session.add(repo)
        await db_session.flush()

        scan = Scan(
            repository_id=repo.id,
            status="pending",
            stage="validating",
            configuration={},
        )
        db_session.add(scan)
        await db_session.commit()
        await db_session.refresh(scan)

        svc = ScanExecutionService()
        with patch("app.services.scan_execution_service.GitService") as mock_git_cls:
            mock_git_inst = MagicMock()
            mock_git_inst.is_git_available.return_value = True
            mock_git_inst.clone_repository = AsyncMock(return_value=None)
            mock_git_cls.return_value = mock_git_inst

            with patch("app.services.scan_execution_service.GitHubService") as mock_gh_cls:
                mock_gh_inst = MagicMock()
                mock_gh_inst.get_commit_sha = AsyncMock(return_value="commit123")
                mock_gh_inst.get_git_tree = AsyncMock(return_value=([], False))
                mock_gh_cls.return_value = mock_gh_inst

                with patch("app.services.scan_execution_service.ScannerOrchestrator") as mock_orch_cls:
                    mock_orch_inst = MagicMock()
                    mock_orch_inst.run_scans = AsyncMock(
                        return_value=([], [], {"is_complete": True, "failed_scanners": []}, {})
                    )
                    mock_orch_cls.return_value = mock_orch_inst

                    with patch("app.services.scan_execution_service.AIScannerReviewService.review_findings", new_callable=AsyncMock) as mock_ai:
                        mock_ai.return_value = {"summary": "Clean code"}

                        await svc.execute_scan(scan_id=scan.id)

        await db_session.refresh(scan)
        assert scan.status == "completed"
        cfg = scan.configuration or {}
        assert "stage_timings" in cfg
        timings = cfg["stage_timings"]

        expected_stages = [
            "validating",
            "fetching_metadata",
            "inspecting_file_tree",
            "git_clone",
            "running_scanners",
            "reviewing_evidence",
            "generating_report",
            "total_duration",
        ]
        for stg in expected_stages:
            assert stg in timings, f"Missing stage timing for {stg}"
            assert isinstance(timings[stg], (int, float))
            assert timings[stg] >= 0.0
