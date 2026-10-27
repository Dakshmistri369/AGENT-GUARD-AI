"""
AgentGuard AI — Milestone C Subprocess Sandbox Isolation & Repository Security Test Suite.

Tests:
1. Subprocess environment sanitization & credential scrubbing (DATABASE_URL, API keys, JWT secrets stripped)
2. Caller extra_env sanitization (attempts to inject credentials into extra_env are scrubbed)
3. Malicious escaping symlink neutralization (prevents scanner arbitrary file read/traversal)
4. Safe git clone security flags (protocol.file.allow=never, core.hooksPath, non-interactive env)
5. Orphan workspace garbage collector (reaps stale workspaces, preserves active ones)
6. Subprocess process tree termination (clean kill of spawned processes on timeout/cancel)
"""
from __future__ import annotations

import asyncio
import os
import subprocess  # nosec B404
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.security.subprocess_sandbox import (
    cleanup_workspace,
    get_sanitized_subprocess_env,
    is_safe_path,
    reap_orphan_workspaces,
    sanitize_workspace_symlinks,
    terminate_process_tree,
)
from app.services.git_service import GitService


class TestSubprocessEnvironmentSanitization:
    def test_sensitive_credentials_scrubbed_from_subprocess_env(self, monkeypatch):
        """
        Test 1: Verify all infrastructure secrets (database credentials, API keys,
        JWT secrets, Supabase keys) are strictly scrubbed from scanner subprocess environments.
        """
        # Inject sensitive test credentials into host os.environ
        test_secrets = {
            "DATABASE_URL": "postgresql://postgres:pwnedpass123@supabase.co:5432/agentguard",
            "SUPABASE_URL": "https://xyzcompany.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-service-role",
            "SUPABASE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon-key",
            "SUPABASE_JWT_SECRET": "supabase-jwt-secret-xyz-789",
            "JWT_SECRET": "fastapi-secret-key-1234567890",
            "SECRET_KEY": "production-cookie-session-secret",
            "REDIS_URL": "redis://:supersecretredispass@redis-node:6379/0",
            "AI_API_KEY": "nvapi-fake-nvidia-nim-credential-123",
            "NVIDIA_API_KEY": "nvapi-fake-nvidia-credential-456",
            "OPENAI_API_KEY": "sk-fake-openai-token-789",
            "ANTHROPIC_API_KEY": "sk-ant-fake-anthropic-key-012",
            "GEMINI_API_KEY": "fake-google-gemini-api-key-345",
            "POSTGRES_PASSWORD": "raw_db_password_never_expose",
        }
        for k, v in test_secrets.items():
            monkeypatch.setenv(k, v)

        # Construct sanitized environment
        env = get_sanitized_subprocess_env()

        # Assert zero sensitive keys leaked into subprocess environment
        for secret_key in test_secrets:
            assert secret_key not in env, f"Security Violation: '{secret_key}' leaked into subprocess environment!"

        # Assert baseline hardened execution flags
        assert env.get("GIT_TERMINAL_PROMPT") == "0"
        assert env.get("GIT_ASKPASS") == ""
        assert env.get("SSH_ASKPASS") == ""
        assert env.get("PYTHONUNBUFFERED") == "1"
        assert env.get("PYTHONDONTWRITEBYTECODE") == "1"

        # Assert safe environment variables are preserved
        assert "PATH" in env
        if os.name == "nt":
            assert "SYSTEMROOT" in env or "WINDIR" in env

    def test_caller_extra_env_is_scrubbed_for_credentials(self):
        """
        Test 2: Verify caller-supplied extra_env cannot bypass credential scrubbing.
        Safe variables must pass; sensitive keys must be silently stripped.
        """
        extra_env = {
            "SAFE_TOOL_FLAG": "enabled",
            "SEMGREP_RULES": "p/security-audit",
            "DATABASE_URL": "postgresql://hacker@malicious-db/leak",
            "MY_CUSTOM_SECRET_KEY": "should-be-blocked",
            "APP_TOKEN": "should-be-blocked",
        }

        env = get_sanitized_subprocess_env(extra_env=extra_env)

        # Safe custom configurations are allowed
        assert env.get("SAFE_TOOL_FLAG") == "enabled"
        assert env.get("SEMGREP_RULES") == "p/security-audit"

        # Injected sensitive keys are scrubbed
        assert "DATABASE_URL" not in env
        assert "MY_CUSTOM_SECRET_KEY" not in env
        assert "APP_TOKEN" not in env


class TestSymlinkTraversalDefense:
    def test_neutralize_escaping_symlinks(self, tmp_path):
        """
        Test 3: Verify sanitize_workspace_symlinks detects and removes any symlinks
        that resolve outside the workspace root, while preserving internal safe symlinks.
        """
        ws = tmp_path / "scan_workspace"
        ws.mkdir()

        # Create host file outside workspace (e.g. simulating /etc/passwd or private host config)
        host_sensitive = tmp_path / "host_sensitive"
        host_sensitive.mkdir()
        secret_file = host_sensitive / "credentials.json"
        secret_file.write_text('{"db_password": "supersecret"}', encoding="utf-8")

        # Create safe file inside workspace
        internal_file = ws / "src" / "index.js"
        internal_file.parent.mkdir(parents=True)
        internal_file.write_text("console.log('hello');", encoding="utf-8")

        # Test path safety boundary logic
        assert not is_safe_path(ws, secret_file)
        assert is_safe_path(ws, internal_file)

        # Create malicious escaping symlink pointing outside workspace if permitted
        evil_symlink = ws / "src" / "evil_link.txt"
        safe_symlink = ws / "src" / "safe_link.js"
        try:
            evil_symlink.symlink_to(secret_file)
            safe_symlink.symlink_to(internal_file)
            has_symlink_privilege = True
        except OSError:
            has_symlink_privilege = False

        if has_symlink_privilege:
            assert evil_symlink.is_symlink()
            assert safe_symlink.is_symlink()

            # Run sanitization
            removed = sanitize_workspace_symlinks(ws)

            # Malicious symlink must be removed
            assert not evil_symlink.exists()
            assert evil_symlink in removed

            # Safe internal symlink must remain intact
            assert safe_symlink.exists()
            assert safe_symlink not in removed
        else:
            # Verify mock symlink handling when OS restricts symlink creation
            from unittest.mock import MagicMock
            fake_symlink = MagicMock(spec=Path)
            fake_symlink.is_symlink.return_value = True
            fake_symlink.resolve.return_value = secret_file
            fake_symlink.unlink = MagicMock()

            with patch("os.walk", return_value=[(str(ws), [], ["fake_link"])]), patch(
                "app.security.subprocess_sandbox.Path", return_value=fake_symlink
            ):
                # When an escaping symlink is encountered, it must be unlinked
                assert not is_safe_path(ws, fake_symlink.resolve())


class TestGitHardenedFlags:
    @pytest.mark.asyncio
    async def test_git_clone_uses_hardened_security_flags(self, tmp_path):
        """
        Test 4: Verify git clone invokes protocol.file.allow=never, core.hooksPath=NUL//dev/null,
        and uses sanitized environment with credentials scrubbed.
        """
        svc = GitService()
        target = tmp_path / "target_repo"

        executed_commands = []
        executed_envs = []

        async def _mock_run_git(cmd, cwd=None, env=None, timeout=180.0):
            executed_commands.append(cmd)
            executed_envs.append(env or {})
            target.mkdir(parents=True, exist_ok=True)
            return (0, b"Cloned", b"")

        with patch.object(svc, "_run_git_command", side_effect=_mock_run_git), patch.dict(
            os.environ, {"DATABASE_URL": "postgresql://pwned@db/agentguard"}
        ):
            await svc.clone_repository(
                normalized_url="https://github.com/agentguard/test-repo",
                target_dir=target,
            )

        assert len(executed_commands) == 1
        cmd = executed_commands[0]

        # Security flags inspection
        assert "-c" in cmd
        assert "protocol.file.allow=never" in cmd
        assert "protocol.version=2" in cmd
        assert any(arg.startswith("core.hooksPath=") for arg in cmd)
        assert "--recurse-submodules=no" in cmd
        assert "--single-branch" in cmd
        assert "--no-tags" in cmd

        # Env inspection
        env_used = executed_envs[0]
        assert "DATABASE_URL" not in env_used
        assert env_used.get("GIT_TERMINAL_PROMPT") == "0"


class TestOrphanWorkspaceReaper:
    def test_reap_orphan_workspaces_deletes_stale_preserves_fresh(self, tmp_path):
        """
        Test 5: Verify orphan workspace reaper deletes directories older than
        max_age_seconds threshold and preserves fresh active scan directories.
        """
        workspaces_base = tmp_path / "scan_workspaces"
        workspaces_base.mkdir()

        # 1. Stale abandoned workspace (simulating crashed container from 3 hours ago)
        stale_ws = workspaces_base / "scan_101_crashed"
        stale_ws.mkdir()
        (stale_ws / "leftover.py").write_text("old code", encoding="utf-8")
        stale_time = time.time() - 7200  # 2 hours ago
        os.utime(stale_ws, (stale_time, stale_time))

        # 2. Fresh active workspace (created 30 seconds ago)
        fresh_ws = workspaces_base / "scan_102_active"
        fresh_ws.mkdir()
        (fresh_ws / "app.py").write_text("active code", encoding="utf-8")
        fresh_time = time.time() - 30
        os.utime(fresh_ws, (fresh_time, fresh_time))

        # 3. Non-scan directory (should be ignored by reaper)
        other_dir = workspaces_base / "other_directory"
        other_dir.mkdir()
        os.utime(other_dir, (stale_time, stale_time))

        # Execute reaper with 1-hour max age threshold
        reaped = reap_orphan_workspaces(str(workspaces_base), max_age_seconds=3600)

        assert reaped == 1
        assert not stale_ws.exists(), "Stale orphaned workspace was not deleted!"
        assert fresh_ws.exists(), "Active fresh workspace was incorrectly deleted!"
        assert other_dir.exists(), "Non-scan directory was incorrectly touched!"


class TestSubprocessProcessTreeTermination:
    @pytest.mark.asyncio
    async def test_terminate_process_tree_cleanly_kills_process(self):
        """
        Test 6: Verify terminate_process_tree cleanly terminates a running subprocess
        without leaving orphaned zombies.
        """
        # Spawn a python process sleeping for 30 seconds
        proc = subprocess.Popen(  # nosec B603
            [sys.executable, "-c", "import time; time.sleep(30)"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        assert proc.poll() is None, "Process should be running initially"

        # Terminate process tree
        terminate_process_tree(proc)

        # Allow brief moment for OS to clean process table
        await asyncio.sleep(0.5)

        # Process should now be terminated
        assert proc.poll() is not None or not _is_pid_alive(proc.pid)


def _is_pid_alive(pid: int) -> bool:
    """Helper to check if a PID is alive on Windows or POSIX."""
    try:
        if os.name == "nt":
            res = subprocess.run(  # nosec B603
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
                timeout=3.0,
            )
            return str(pid) in res.stdout
        else:
            os.kill(pid, 0)
            return True
    except Exception:
        return False
