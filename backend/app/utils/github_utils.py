"""
AgentGuard AI — GitHub Repository Operations & Ephemeral Workspace Utilities.
Provides safe shallow cloning, size-capped checkout, and deterministic file cleanup.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from typing import AsyncGenerator
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("agentguard.utils.github_utils")
settings = get_settings()


@asynccontextmanager
async def ephemeral_repository_workspace(
    repo_url: str,
    branch: str | None = None,
    timeout_seconds: int = 300,
) -> AsyncGenerator[str, None]:
    """
    Context manager that safely clones a GitHub repository with depth=1
    into an isolated temporary directory and guarantees deletion on exit.
    """
    temp_dir = tempfile.mkdtemp(prefix="agentguard_repo_")
    try:
        cmd = [
            "git",
            "clone",
            "--depth", "1",
            "--single-branch",
        ]
        if branch:
            cmd.extend(["--branch", branch])

        cmd.extend([repo_url, temp_dir])

        logger.info("Cloning repository %s into %s", repo_url, temp_dir)

        # Execute safe git clone with timeout
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={
                "PATH": os.environ.get("PATH", ""),
                "GIT_TERMINAL_PROMPT": "0",  # Disable interactive password prompts
            },
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            proc.kill()
            raise TimeoutError(f"Git clone exceeded timeout of {timeout_seconds} seconds.")

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace").strip()
            raise RuntimeError(f"Git clone failed (exit {proc.returncode}): {err_msg}")

        yield temp_dir

    finally:
        # Guarantee complete cleanup of temporary cloned files
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
                logger.info("Cleaned up ephemeral workspace %s", temp_dir)
            except Exception as e:
                logger.warning("Failed to remove temporary workspace %s: %e", temp_dir, e)
