"""
AgentGuard AI — Safe Git Operations Service.
Executes non-shell git subprocesses with strict argument lists, security flags,
timeouts, and output redaction to isolate clones safely.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.services.git")


class GitExecutionError(Exception):
    """Raised when git command fails or encounters unsafe conditions."""
    pass


class GitService:
    def __init__(self, git_path: str = "git", timeout_seconds: int = 180):
        self._git_path = git_path
        self._timeout_seconds = max(180, timeout_seconds)

    def is_git_available(self) -> bool:
        """Check if git executable is present on the host PATH."""
        return shutil.which(self._git_path) is not None

    async def clone_repository(
        self,
        normalized_url: str,
        target_dir: Path,
        branch: str | None = None,
        depth: int = 1,
    ) -> None:
        """
        Safely clone an authorized repository into target_dir.
        Enforces:
        - Argument list execution (shell=False)
        - Disabled git hooks and credential prompts
        - Disabled submodules
        - Disabled Git LFS filters
        - Strict timeout with guaranteed process cleanup
        """
        if not self.is_git_available():
            raise GitExecutionError(
                "Git executable is not available on the server. Deeper static analysis requires git."
            )

        null_device = "NUL" if os.name == "nt" else "/dev/null"

        cmd = [
            self._git_path,
            "-c", f"core.hooksPath={null_device}",
            "-c", "credential.helper=",
            "-c", "filter.lfs.smudge=",
            "-c", "filter.lfs.process=",
            "-c", "filter.lfs.required=false",
            "clone",
            "--depth", str(max(1, depth)),
            "--single-branch",
            "--no-tags",
            "--recurse-submodules=no",
        ]

        if branch:
            cmd.extend(["--branch", branch])

        cmd.extend([normalized_url, str(target_dir)])

        logger.info("Executing safe git clone into isolated workspace: %s", target_dir)

        env = {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
        }
        env.pop("GIT_ASKPASS", None)

        try:
            returncode, stdout_bytes, stderr_bytes = await self._run_git_command(
                cmd=cmd,
                env=env,
                timeout=float(self._timeout_seconds),
            )
        except TimeoutError as exc:
            logger.error("Git clone timed out after %ds for %s", self._timeout_seconds, normalized_url)
            raise GitExecutionError(f"Git clone operation timed out after {self._timeout_seconds} seconds.") from exc
        except Exception as exc:
            if isinstance(exc, GitExecutionError):
                raise
            err_msg = str(exc) or exc.__class__.__name__
            logger.error("Failed to spawn or run git subprocess: %s", err_msg)
            raise GitExecutionError(f"Failed to execute git clone: {err_msg}") from exc

        if returncode != 0:
            raw_err = stderr_bytes.decode("utf-8", errors="replace")
            clean_err = redact_sensitive_text(raw_err)
            logger.error("Git clone failed (exit %d): %s", returncode, clean_err)
            raise GitExecutionError(f"Git clone failed: {clean_err.strip()[:300]}")

    async def _run_git_command(
        self,
        cmd: list[str],
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
        timeout: float = 180.0,
    ) -> tuple[int, bytes, bytes]:
        """
        Execute git command safely, with automatic fallback for event loops lacking
        async subprocess support (such as Windows SelectorEventLoop under Uvicorn reload).
        """
        import subprocess  # nosec B404

        exec_env = env or {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        exec_env.pop("GIT_ASKPASS", None)

        process = None
        try:
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=str(cwd) if cwd else None,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=exec_env,
                )
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(), timeout=timeout
                )
                return (process.returncode or 0), stdout_bytes, stderr_bytes
            except NotImplementedError:
                # Async subprocess not implemented in this event loop (e.g. Windows SelectorEventLoop)
                def _sync_git():
                    p = subprocess.run(  # nosec B603
                        cmd,
                        cwd=str(cwd) if cwd else None,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=exec_env,
                        timeout=timeout,
                    )
                    return p.returncode, p.stdout, p.stderr

                return await asyncio.to_thread(_sync_git)

        except (asyncio.TimeoutError, TimeoutError, subprocess.TimeoutExpired) as exc:
            if process:
                try:
                    process.kill()
                    await process.wait()
                except Exception as _kill_err:
                    _ = _kill_err
            raise TimeoutError(f"Git command timed out after {timeout} seconds.") from exc

    async def get_head_commit_sha(self, repo_dir: Path) -> str:
        """Read HEAD commit SHA from local repository clone."""
        if not self.is_git_available():
            raise GitExecutionError("Git is not available.")

        cmd = [self._git_path, "-C", str(repo_dir), "rev-parse", "HEAD"]
        try:
            returncode, stdout_bytes, stderr_bytes = await self._run_git_command(cmd=cmd, timeout=10.0)
            if returncode != 0:
                raise GitExecutionError(stderr_bytes.decode("utf-8", errors="replace"))
            return stdout_bytes.decode("utf-8", errors="replace").strip()
        except Exception as exc:
            raise GitExecutionError(f"Failed to read commit SHA from clone: {exc}") from exc
