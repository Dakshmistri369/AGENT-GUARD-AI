"""
AgentGuard AI — Unit & Integration Tests for Safe Git Clone & Error Model Separation.
Verifies Workstream 1 Phase 2:
1. Nonexistent repository clone fails fast with specific repository-not-found message.
2. Private repository clone with no credentials fails with specific auth-missing message.
3. Git clone timeout fails with timeout-specific message citing GIT_CLONE_TIMEOUT_SECONDS.
4. Clone size limit defense raises size-specific protection error.
5. Error model correctly separates prerequisite acquisition failures (stage: validating, failure_category: repository_acquisition_failure)
   from actual security scanner outages (stage: running_scanners, "Required security scanner(s) failed").
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Finding, Repository, Scan, User
from app.services.git_service import GitExecutionError, GitService
from app.services.scan_execution_service import ScanExecutionService


@pytest.mark.asyncio
class TestGitServiceCloneClassification:
    async def test_clone_nonexistent_repo_fails_with_specific_message(self, tmp_path: Path):
        git_svc = GitService(timeout_seconds=300)
        target_dir = tmp_path / "nonexistent"

        # Simulate git output for repository not found
        fake_stderr = b"fatal: repository 'https://github.com/agentguard-org/nonexistent-repo-999.git/' not found\n"
        with patch.object(git_svc, "_run_git_command", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (128, b"", fake_stderr)

            with pytest.raises(GitExecutionError) as exc_info:
                await git_svc.clone_repository(
                    normalized_url="https://github.com/agentguard-org/nonexistent-repo-999.git",
                    target_dir=target_dir,
                )

            assert "Repository was not found on remote host" in str(exc_info.value)
            assert "https://github.com/agentguard-org/nonexistent-repo-999.git" in str(exc_info.value)

    async def test_clone_private_repo_without_credentials_fails_with_auth_message(self, tmp_path: Path):
        git_svc = GitService(timeout_seconds=300)
        target_dir = tmp_path / "private_repo"

        # Simulate git terminal prompts disabled / authentication failed
        fake_stderr = b"fatal: could not read Username for 'https://github.com': terminal prompts disabled\n"
        with patch.object(git_svc, "_run_git_command", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (128, b"", fake_stderr)

            with pytest.raises(GitExecutionError) as exc_info:
                await git_svc.clone_repository(
                    normalized_url="https://github.com/private-org/secret-repo.git",
                    target_dir=target_dir,
                )

            assert "Repository requires authentication or is private — no valid GitHub credentials configured." in str(exc_info.value)

    async def test_clone_timeout_fails_with_timeout_specific_message(self, tmp_path: Path):
        configured_timeout = 300
        git_svc = GitService(timeout_seconds=configured_timeout)
        target_dir = tmp_path / "timeout_repo"

        with patch.object(git_svc, "_run_git_command", new_callable=AsyncMock) as mock_run:
            mock_run.side_effect = TimeoutError("Git command timed out")

            with pytest.raises(GitExecutionError) as exc_info:
                await git_svc.clone_repository(
                    normalized_url="https://github.com/large-org/huge-repo.git",
                    target_dir=target_dir,
                )

            assert f"Git clone operation timed out after {configured_timeout} seconds." in str(exc_info.value)

    async def test_clone_size_limit_exceeded_fails_with_protection_message(self, tmp_path: Path):
        git_svc = GitService(timeout_seconds=300)
        target_dir = tmp_path / "large_repo"
        target_dir.mkdir(parents=True, exist_ok=True)

        # Create a mock file exceeding 500 MB
        with patch.object(git_svc, "_run_git_command", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, b"Cloned successfully", b"")

            with patch("app.config.get_settings") as mock_settings:
                settings_mock = MagicMock()
                settings_mock.max_repo_clone_size_mb = 500
                settings_mock.github_token = ""
                mock_settings.return_value = settings_mock

                # Mock sum of file sizes to 520 MB
                with patch("pathlib.Path.rglob") as mock_rglob:
                    large_file_stat = MagicMock()
                    large_file_stat.stat.return_value.st_size = 520 * 1024 * 1024
                    large_file_stat.is_file.return_value = True
                    mock_rglob.return_value = [large_file_stat]

                    with pytest.raises(GitExecutionError) as exc_info:
                        await git_svc.clone_repository(
                            normalized_url="https://github.com/dataset/audio-archive.git",
                            target_dir=target_dir,
                        )

                    assert "Cloned repository size (520.0 MB) exceeds maximum allowed limit (500 MB)" in str(exc_info.value)
                    assert "Scan aborted to protect worker disk and memory resources." in str(exc_info.value)


@pytest.mark.asyncio
class TestErrorModelSeparationPrerequisiteVsScanner:
    async def test_prerequisite_clone_failure_aborts_at_validating_stage(self, db_session: AsyncSession):
        user = User(email="workstream1_user@test.local", email_verified=True)
        db_session.add(user)
        await db_session.flush()

        repo = Repository(
            name="test-prereq-fail-repo",
            owner_name="testorg",
            full_name="testorg/test-prereq-fail-repo",
            url="https://github.com/testorg/test-prereq-fail-repo",
            default_branch="main",
            owner_id=user.id,
            metadata_json={"languages": ["Python"], "size_kb": 1000},
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

        # Mock GitService.clone_repository to raise GitExecutionError
        svc = ScanExecutionService()
        with patch("app.services.scan_execution_service.GitService") as mock_git_cls:
            mock_git_inst = MagicMock()
            mock_git_inst.is_git_available.return_value = True
            mock_git_inst.clone_repository = AsyncMock(
                side_effect=GitExecutionError("Repository requires authentication or is private — no valid GitHub credentials configured.")
            )
            mock_git_cls.return_value = mock_git_inst

            with patch("app.services.scan_execution_service.GitHubService") as mock_gh_cls:
                mock_gh_inst = MagicMock()
                mock_gh_inst.get_commit_sha = AsyncMock(return_value="abc1234")
                mock_gh_inst.get_git_tree = AsyncMock(return_value=([], False))
                mock_gh_cls.return_value = mock_gh_inst

                result = await svc.execute_scan(scan_id=scan.id)

        await db_session.refresh(scan)
        # Verify prerequisite failure is marked failed at validating stage
        assert scan.status == "failed"
        assert scan.stage == "validating"  # MUST remain validating, NOT "failed" and NOT "running_scanners"
        assert "Repository acquisition failed: Repository requires authentication" in (scan.error_message or "")
        assert "Security scanning could not start." in (scan.error_message or "")
        assert scan.configuration.get("failure_category") == "repository_acquisition_failure"
        # Verify "git_clone" is NEVER in failed_scanners
        assert "git_clone" not in (scan.configuration.get("coverage_summary") or {}).get("failed_scanners", [])

    async def test_scanner_failure_after_clone_is_reported_with_scanner_coverage_message(self, db_session: AsyncSession):
        user = User(email="workstream1_scanner_fail@test.local", email_verified=True)
        db_session.add(user)
        await db_session.flush()

        repo = Repository(
            name="test-scanner-fail-repo",
            owner_name="testorg",
            full_name="testorg/test-scanner-fail-repo",
            url="https://github.com/testorg/test-scanner-fail-repo",
            default_branch="main",
            owner_id=user.id,
            metadata_json={"languages": ["Python"], "size_kb": 1000},
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
            mock_git_inst.clone_repository = AsyncMock(return_value=None)  # Clone succeeds!
            mock_git_cls.return_value = mock_git_inst

            with patch("app.services.scan_execution_service.GitHubService") as mock_gh_cls:
                mock_gh_inst = MagicMock()
                mock_gh_inst.get_commit_sha = AsyncMock(return_value="def5678")
                mock_gh_inst.get_git_tree = AsyncMock(return_value=([], False))
                mock_gh_cls.return_value = mock_gh_inst

                # Mock orchestrator to report Semgrep failed
                with patch("app.services.scan_execution_service.ScannerOrchestrator") as mock_orch_cls:
                    mock_orch_inst = MagicMock()
                    coverage = {
                        "is_complete": False,
                        "applicable_scanners": ["Semgrep", "Bandit"],
                        "executed_scanners": ["Bandit"],
                        "missing_scanners": [],
                        "failed_scanners": ["Semgrep"],
                        "skipped_scanners": [],
                    }
                    mock_orch_inst.run_scans = AsyncMock(
                        return_value=([], [{"name": "Semgrep", "status": "failed"}], coverage, {})
                    )
                    mock_orch_cls.return_value = mock_orch_inst

                    result = await svc.execute_scan(scan_id=scan.id)

        await db_session.refresh(scan)
        # Verify scanner failure keeps stage at running_scanners and uses scanner-unavailable message
        assert scan.status == "failed"
        assert scan.stage == "running_scanners"  # MUST be running_scanners, NOT "failed"
        assert "Required security scanner(s) failed or unavailable: Semgrep" in (scan.error_message or "")
        assert "Scan coverage is incomplete and cannot be certified clean." in (scan.error_message or "")
        assert scan.configuration.get("failure_category") != "repository_acquisition_failure"
        assert "stage_timings" in scan.configuration
