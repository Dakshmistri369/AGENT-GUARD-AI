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
    def __init__(self, git_path: str = "git", timeout_seconds: int | None = None):
        self._git_path = git_path
        if timeout_seconds is None:
            from app.config import get_settings
            self._timeout_seconds = get_settings().git_clone_timeout_seconds
        else:
            self._timeout_seconds = timeout_seconds

    def is_git_available(self) -> bool:
        """Check if git executable is present on the host PATH."""
        return shutil.which(self._git_path) is not None

    async def clone_repository(
        self,
        normalized_url: str,
        target_dir: Path,
        branch: str | None = None,
        depth: int = 1,
        token: str | None = None,
    ) -> None:
        """
        Safely clone an authorized repository into target_dir.
        Enforces:
        - Argument list execution (shell=False)
        - Pre-clone host disk space verification
        - Optional GitHub authentication via http.extraheader
        - Disabled git hooks, submodules, filters, and interactive prompts
        - Bounded retries on transient network errors
        - Strict timeout with guaranteed process cleanup
        - Honest failure classification (auth, network, missing, size, timeout)
        """
        if not self.is_git_available():
            raise GitExecutionError(
                "Git executable is not available on the server. Deeper static analysis requires git."
            )

        # Pre-clone disk space guard
        try:
            parent_dir = target_dir.parent
            parent_dir.mkdir(parents=True, exist_ok=True)
            disk_stat = shutil.disk_usage(parent_dir)
            if disk_stat.free < 200 * 1024 * 1024:
                raise GitExecutionError(
                    f"Insufficient disk space on host ({round(disk_stat.free / (1024 * 1024), 1)} MB free). "
                    "Cannot clone repository safely."
                )
        except OSError:
            pass

        from app.config import get_settings
        settings = get_settings()
        auth_token = token or settings.github_token

        null_device = "NUL" if os.name == "nt" else "/dev/null"

        cmd = [
            self._git_path,
            "-c", f"core.hooksPath={null_device}",
            "-c", "credential.helper=",
            "-c", "filter.lfs.smudge=",
            "-c", "filter.lfs.process=",
            "-c", "filter.lfs.required=false",
            "-c", "protocol.file.allow=never",
            "-c", "protocol.version=2",
        ]

        if auth_token:
            import base64
            # Pass authorization securely via extraheader
            b64_creds = base64.b64encode(f"x-access-token:{auth_token}".encode("utf-8")).decode("ascii")
            cmd.extend(["-c", f"http.extraheader=AUTHORIZATION: basic {b64_creds}"])

        cmd.extend([
            "clone",
            "--depth", str(max(1, depth)),
            "--single-branch",
            "--no-tags",
            "--recurse-submodules=no",
        ])

        if branch:
            cmd.extend(["--branch", branch])

        cmd.extend([normalized_url, str(target_dir)])

        logger.info("Executing safe git clone into isolated workspace: %s", target_dir)

        from app.security.subprocess_sandbox import (
            get_sanitized_subprocess_env,
            sanitize_workspace_symlinks,
            terminate_process_tree,
        )

        env = get_sanitized_subprocess_env()

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            if target_dir.exists():
                shutil.rmtree(target_dir, ignore_errors=True)

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

            if returncode == 0:
                break

            raw_err = stderr_bytes.decode("utf-8", errors="replace")
            clean_err = redact_sensitive_text(raw_err) or ""
            lower_err = clean_err.lower()

            logger.error("Git clone failed (attempt %d/%d, exit %d): %s", attempt, max_attempts, returncode, clean_err)

            # Check for transient network issues that warrant retry
            is_transient = any(
                phrase in lower_err
                for phrase in [
                    "could not resolve host",
                    "failed to connect",
                    "connection reset by peer",
                    "rpc failed",
                    "the remote end hung up unexpectedly",
                    "early eof",
                    "recv failure",
                    "fatal: unable to access",
                ]
            )

            if is_transient and attempt < max_attempts:
                logger.warning(
                    "Transient network failure during git clone; retrying in 2s (attempt %d/%d)...",
                    attempt,
                    max_attempts,
                )
                await asyncio.sleep(2)
                continue

            # Specific stderr classification
            if (
                "could not read username" in lower_err
                or "authentication failed" in lower_err
                or "terminal prompts disabled" in lower_err
            ):
                raise GitExecutionError(
                    "Repository requires authentication or is private — no valid GitHub credentials configured."
                )
            elif "repository not found" in lower_err or "not found" in lower_err:
                if not auth_token:
                    raise GitExecutionError(
                        f"Repository was not found on remote host (or repository is private): {normalized_url}"
                    )
                else:
                    raise GitExecutionError(
                        f"Repository was not found on remote host: {normalized_url}"
                    )
            elif "no space left on device" in lower_err:
                raise GitExecutionError("Insufficient disk space on host to complete repository clone.")
            else:
                raise GitExecutionError(f"Git clone failed: {clean_err.strip()[:300]}")

        # Check cloned workspace size against max_repo_clone_size_mb defense cap
        from app.config import get_settings
        settings = get_settings()
        try:
            total_size = sum(f.stat().st_size for f in target_dir.rglob("*") if f.is_file())
            max_bytes = settings.max_repo_clone_size_mb * 1024 * 1024
            if total_size > max_bytes:
                size_mb = round(total_size / (1024 * 1024), 2)
                logger.error("Cloned repository %s exceeded max allowed size: %s MB > %s MB", normalized_url, size_mb, settings.max_repo_clone_size_mb)
                raise GitExecutionError(
                    f"Cloned repository size ({size_mb} MB) exceeds maximum allowed limit ({settings.max_repo_clone_size_mb} MB). "
                    "Scan aborted to protect worker disk and memory resources."
                )
        except Exception as exc:
            if isinstance(exc, GitExecutionError):
                raise
            logger.warning("Could not calculate cloned directory size: %s", exc)

        # Milestone C: Neutralize any escaping symbolic links inside cloned workspace
        from app.security.subprocess_sandbox import sanitize_workspace_symlinks
        sanitize_workspace_symlinks(target_dir)

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
        from app.security.subprocess_sandbox import get_sanitized_subprocess_env, terminate_process_tree

        exec_env = env if env is not None else get_sanitized_subprocess_env()

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
                terminate_process_tree(process)
            raise TimeoutError(f"Git command timed out after {timeout} seconds.") from exc
        except asyncio.CancelledError:
            if process:
                terminate_process_tree(process)
            raise

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
