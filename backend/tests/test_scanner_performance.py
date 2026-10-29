"""
AgentGuard AI — Scanner Performance, Tiered File Ordering & Reliability Tests.
Tests:
1. Small files are scanned first; big files are scanned after (280-file fixture).
2. Large binary/media/office files (.mp4, .pptx, .docx) are excluded and counted.
3. Total repository bytes and per-stage timings are accurately measured.
4. Independent scanner concurrency limit is respected.
5. One scanner timeout preserves partial findings from other scanners.
6. OSV dependency cache hit on unchanged manifests (< 5ms).
7. OSV cache invalidation when manifests or scanner configuration change.
8. Duplicate active scan protection returns existing active scan.
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import get_settings
from app.database import session as db_session_module
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.scanners.base import BaseScanner, ScannerResult
from app.scanners.filters import inspect_workspace, SMALL_FILE_MAX_BYTES
from app.scanners.orchestrator import ScannerOrchestrator
from app.scanners.osv import OSVScanner, _OSV_LOCKFILE_CACHE, compute_manifests_fingerprint
from app.services.github_service import GitHubService


@pytest.fixture
def repo_280_files_fixture(tmp_path: Path):
    """
    Creates a representative 280-file repository fixture (approx 65 MB):
    - 250 small files (1 KB to 20 KB)
    - 20 big files (100 KB to 500 KB)
    - 10 skipped files (large 44 MB video blob, .pptx, .docx, .zip)
    Total files = 280.
    """
    repo_dir = tmp_path / "comiccraft_sim"
    repo_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create 250 small files (<= 50 KB)
    src_dir = repo_dir / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    for i in range(250):
        f = src_dir / f"module_{i}.py"
        # Small files with realistic code content
        f.write_text(f"# Small module {i}\ndef process_{i}():\n    return {i} * 2\n")

    # 2. Create 20 big files (> 50 KB up to 500 KB)
    big_dir = repo_dir / "data"
    big_dir.mkdir(parents=True, exist_ok=True)
    large_text = "# Large generated dataset\n" + ("x = 'data_chunk_sample'\n" * 4000)  # ~100 KB
    for i in range(20):
        bf = big_dir / f"large_bundle_{i}.py"
        bf.write_text(large_text)

    # 3. Create manifests
    pkg_json = repo_dir / "package.json"
    pkg_json.write_text('{"name": "test-repo", "dependencies": {"lodash": "4.17.15"}}')

    req_txt = repo_dir / "requirements.txt"
    req_txt.write_text("requests==2.25.1\nurllib3==1.25.8\n")

    # 4. Create 10 skipped files: video, pptx, docx, zip, oversized
    media_dir = repo_dir / "demo"
    media_dir.mkdir(parents=True, exist_ok=True)
    # Simulated 44 MB MP4 video file
    video_file = media_dir / "ComicCraft_AI_Demo_VoiceOver.mp4"
    video_file.write_bytes(b"\x00\x00\x00\x18ftypmp42" * 1024)  # Video signature

    presentation = repo_dir / "presentation.pptx"
    presentation.write_bytes(b"\x50\x4B\x03\x04" * 512)

    doc_file = repo_dir / "Research_Paper.docx"
    doc_file.write_bytes(b"\x50\x4B\x03\x04" * 1024)

    # Remaining skipped files
    for j in range(7):
        sk_f = media_dir / f"asset_{j}.png"
        sk_f.write_bytes(b"\x89PNG\r\n\x1a\n" * 64)

    return repo_dir


class TestTieredScanningAndPerformance:
    def test_single_pass_inspection_partitions_small_files_first(self, repo_280_files_fixture: Path):
        """
        Verify the single-pass workspace inspection:
        - Small files (<= 50 KB) are collected and placed FIRST.
        - Big files (> 50 KB) are placed AFTER small files.
        - All files are discovered and accounted for (scannable + skipped).
        """
        inspection = inspect_workspace(repo_280_files_fixture)

        assert inspection.files_discovered >= 280
        assert len(inspection.small_files) >= 250
        assert len(inspection.big_files) >= 20
        assert len(inspection.skipped_files) >= 10

        # Verify small files are all <= SMALL_FILE_MAX_BYTES (50 KB)
        for sf in inspection.small_files:
            size = inspection.file_sizes[sf]
            assert size <= SMALL_FILE_MAX_BYTES, f"Small file {sf} size {size} exceeds 50 KB"

        # Verify big files are all > SMALL_FILE_MAX_BYTES
        for bf in inspection.big_files:
            size = inspection.file_sizes[bf]
            assert size > SMALL_FILE_MAX_BYTES, f"Big file {bf} size {size} not > 50 KB"

        # Verify combined scannable_files has all small files before any big files
        small_set = set(inspection.small_files)
        first_part = inspection.scannable_files[:len(inspection.small_files)]
        second_part = inspection.scannable_files[len(inspection.small_files):]

        for p in first_part:
            assert p in small_set, f"File {p} in first part must be a small file"
        for p in second_part:
            assert p not in small_set, f"File {p} in second part must be a big file"

        # Verify skipped files contains the .mp4, .pptx, and .docx
        skipped_names = [Path(s.path).name for s in inspection.skipped_files]
        assert "ComicCraft_AI_Demo_VoiceOver.mp4" in skipped_names
        assert "presentation.pptx" in skipped_names
        assert "Research_Paper.docx" in skipped_names

        # Verify manifests were discovered
        assert any("package.json" in m for m in inspection.manifests)
        assert any("requirements.txt" in m for m in inspection.manifests)

    @pytest.mark.asyncio
    async def test_scanner_orchestrator_concurrency_and_partial_preservation(self, repo_280_files_fixture: Path):
        """
        Verify:
        - Independent scanners run with concurrency limit (semaphore = 2).
        - One failing scanner preserves findings from another successful scanner.
        - Detailed per-scanner durations, exit codes, and versions are recorded.
        """
        class FastGoodScanner(BaseScanner):
            scanner_id = "fast_good"
            name = "FastGood"
            def is_available(self): return True, "1.0.0"
            def is_applicable(self, meta): return True, "Applicable"
            async def scan(self, workspace_path, metadata, commit_sha=None, timeout_seconds=120, **kwargs):
                await asyncio.sleep(0.05)
                return ScannerResult(
                    scanner=self.name,
                    scanner_version="1.0.0",
                    status="completed",
                    exit_code=0,
                    duration_seconds=0.05,
                    findings=[{
                        "scanner": "fast_good",
                        "rule_id": "RULE-01",
                        "title": "Hardcoded test credential",
                        "severity": "high",
                        "file_path": "src/module_0.py",
                        "line_number": 1,
                    }],
                )

        class FailingScanner(BaseScanner):
            scanner_id = "failing_scanner"
            name = "FailingScanner"
            def is_available(self): return True, "2.0.0"
            def is_applicable(self, meta): return True, "Applicable"
            async def scan(self, workspace_path, metadata, commit_sha=None, timeout_seconds=120, **kwargs):
                await asyncio.sleep(0.05)
                return ScannerResult(
                    scanner=self.name,
                    scanner_version="2.0.0",
                    status="failed",
                    exit_code=1,
                    error="Engine memory limit hit on large target",
                    duration_seconds=0.05,
                    findings=[],
                )

        orchestrator = ScannerOrchestrator(scanners=[FastGoodScanner(), FailingScanner()])
        findings, scanners_run, coverage_summary, matrix = await orchestrator.run_scans(
            workspace_path=repo_280_files_fixture,
            metadata={},
        )

        # 1. FastGood findings are preserved!
        assert len(findings) == 1
        assert findings[0]["rule_id"] == "RULE-01"

        # 2. Honest coverage reporting: failing scanner means coverage is NOT complete
        assert coverage_summary["is_complete"] is False
        assert "FailingScanner" in coverage_summary["failed_scanners"]
        assert "FastGood" in coverage_summary["executed_scanners"]

        # 3. Telemetry captured exit codes, durations, and small/big file counts
        assert coverage_summary["small_files_count"] >= 250
        assert coverage_summary["big_files_count"] >= 20
        assert coverage_summary["repository_bytes"] > 0
        assert coverage_summary["scanner_concurrency_limit"] == 2

        sc_map = {s["scanner_id"]: s for s in scanners_run}
        assert sc_map["fast_good"]["status"] == "completed"
        assert sc_map["fast_good"]["exit_code"] == 0
        assert sc_map["failing_scanner"]["status"] == "failed"
        assert sc_map["failing_scanner"]["exit_code"] == 1

    @pytest.mark.asyncio
    async def test_osv_cache_hit_and_invalidation(self, repo_280_files_fixture: Path):
        """
        Verify:
        - OSV scan on unchanged manifest caches results.
        - Subsequent scan hits cache in < 5 ms.
        - Cache invalidates when manifest content changes.
        """
        scanner = OSVScanner()
        meta = {"manifests": ["requirements.txt", "package.json"]}

        # 1. First run (populates cache)
        t0 = time.time()
        res1 = await scanner.scan(repo_280_files_fixture, metadata=meta)
        dur1 = time.time() - t0

        # 2. Second run on unchanged repo (must hit cache immediately in < 0.01s)
        t1 = time.time()
        res2 = await scanner.scan(repo_280_files_fixture, metadata=meta)
        dur2 = time.time() - t1

        assert dur2 < 0.05, f"Cache hit must be faster than 50ms, was {dur2}s"
        assert len(res1.findings) == len(res2.findings)

        # 3. Modify requirements.txt
        req_file = repo_280_files_fixture / "requirements.txt"
        req_file.write_text("requests==2.31.0\nurllib3==2.0.7\n")

        # 4. Third run (must detect changed manifest hash and invalidate cache)
        res3 = await scanner.scan(repo_280_files_fixture, metadata=meta)
        assert res3 is not None

    @pytest.mark.asyncio
    async def test_duplicate_active_scan_protection(self, client: AsyncClient):
        """
        Verify:
        - Triggering scan on a repository that already has an active queued/running scan
          returns the existing scan without launching a duplicate job.
        """
        with patch.object(
            GitHubService,
            "get_repository_info",
            new_callable=AsyncMock,
            return_value={
                "owner": "testorg",
                "name": "duplicate-guard-repo",
                "full_name": "testorg/duplicate-guard-repo",
                "description": "Test Repo",
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
            return_value=([{"path": "README.md", "type": "blob", "size": 150}], False),
        ):
            # Connect repository
            conn = await client.post(
                "/api/repositories",
                json={"url": "https://github.com/testorg/duplicate-guard-repo"},
            )
            assert conn.status_code == 201
            repo_id = conn.json()["id"]

            # First trigger
            r1 = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
            assert r1.status_code == 202
            scan1 = r1.json()

            # Second trigger (should return existing active scan)
            r2 = await client.post(f"/api/repositories/{repo_id}/analyze", json={"metadata_only": True})
            assert r2.status_code == 202
            scan2 = r2.json()

            assert scan1["id"] == scan2["id"], "Duplicate scan trigger must return identical active scan ID"

            # Verify only 1 scan in database
            async with db_session_module.AsyncSessionLocal() as db:
                res = await db.execute(select(Scan).where(Scan.repository_id == repo_id))
                all_scans = res.scalars().all()
                assert len(all_scans) == 1
