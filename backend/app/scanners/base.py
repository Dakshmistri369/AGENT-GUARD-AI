"""
AgentGuard AI — Base Security Scanner Interface & Execution Primitives.
Defines ScannerResult, project-type applicability checks, timeout management,
output size limiting, and safe non-shell subprocess execution.
Never executes untrusted repository code or build scripts.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import sys
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.security.workspace import redact_sensitive_text

DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024  # 4 MB max stdout/stderr


@dataclass
class ScannerResult:
    """Standardized execution outcome for an individual security scanner."""
    scanner: str
    scanner_version: str | None
    status: str  # 'completed' | 'failed' | 'timed_out' | 'skipped_not_applicable' | 'skipped_unavailable'
    findings: list[dict[str, Any]] = field(default_factory=list)
    raw_output: str | None = None
    error: str | None = None
    duration_seconds: float = 0.0
    applicable: bool = True
    reason: str | None = None


def _get_windows_registry_paths() -> list[str]:
    """Retrieve User and System PATH entries directly from Windows Registry."""
    if os.name != "nt":
        return []
    paths: list[str] = []
    try:
        import winreg
        for root, sub in [
            (winreg.HKEY_CURRENT_USER, r"Environment"),
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
        ]:
            try:
                with winreg.OpenKey(root, sub) as key:
                    val, _ = winreg.QueryValueEx(key, "Path")
                    for item in str(val).split(";"):
                        cleaned = os.path.expandvars(item.strip())
                        if cleaned and cleaned not in paths:
                            paths.append(cleaned)
            except OSError as _key_err:
                _ = _key_err
    except Exception as _reg_err:
        _ = _reg_err
    return paths


def find_scanner_executable(tool_name: str) -> str | None:
    """
    Search for executable binary on system PATH, user Scripts directories,
    Windows Registry PATHs, and WinGet packages directories.
    Handles Windows .exe and POSIX binaries transparently.
    """
    tools_to_check = [tool_name]
    if os.name == "nt" and tool_name == "semgrep":
        tools_to_check = ["pysemgrep", "semgrep"]

    # 1. Standard PATH search
    for t_name in tools_to_check:
        direct_path = shutil.which(t_name)
        if direct_path:
            return direct_path

    # 2. Check Python user Scripts directory (Windows AppData / POSIX .local/bin)
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if appdata:
            scripts_dir = Path(appdata) / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts"
            for t_name in tools_to_check:
                candidate = scripts_dir / f"{t_name}.exe"
                if candidate.exists():
                    return str(candidate)

    # 3. Check current Python environment Scripts/bin
    env_scripts = Path(sys.executable).parent / ("Scripts" if os.name == "nt" else "bin")
    for t_name in tools_to_check:
        candidate_env = env_scripts / (f"{t_name}.exe" if os.name == "nt" else t_name)
        if candidate_env.exists():
            return str(candidate_env)

    # 4. Check Windows Registry PATH entries (User & Machine)
    if os.name == "nt":
        for reg_dir in _get_windows_registry_paths():
            for t_name in tools_to_check:
                candidate = Path(reg_dir) / f"{t_name}.exe"
                if candidate.exists():
                    return str(candidate)

    # 5. Check Windows WinGet and user-level package directories
    if os.name == "nt":
        localappdata = os.environ.get("LOCALAPPDATA")
        if localappdata:
            for t_name in tools_to_check:
                winget_link = Path(localappdata) / "Microsoft" / "WinGet" / "Links" / f"{t_name}.exe"
                if winget_link.exists():
                    return str(winget_link)

            packages_dir = Path(localappdata) / "Microsoft" / "WinGet" / "Packages"
            if packages_dir.exists():
                try:
                    for t_name in tools_to_check:
                        for match in packages_dir.glob(f"**/{t_name}.exe"):
                            if match.is_file():
                                return str(match)
                except (OSError, PermissionError) as _pkg_err:
                    _ = _pkg_err

    return None


class BaseScanner(ABC):
    """Abstract base class for all AgentGuard security scanners."""

    scanner_id: str
    name: str

    @abstractmethod
    def is_available(self) -> tuple[bool, str | None]:
        """Check if scanner binary or module is available on host and return (available, version)."""
        pass

    @abstractmethod
    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        """Determine if this scanner is applicable for the detected languages/manifests."""
        pass

    @abstractmethod
    async def scan(
        self,
        workspace_path: Path,
        metadata: dict[str, Any],
        commit_sha: str | None = None,
        timeout_seconds: int = 120,
    ) -> ScannerResult:
        """Execute scanner against isolated workspace and return normalized findings."""
        pass

    async def execute_cmd(
        self,
        cmd: list[str],
        cwd: Path | None = None,
        timeout_seconds: int = 120,
        max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
        extra_env: dict[str, str] | None = None,
    ) -> tuple[int, str, str]:
        """
        Execute command with strict argument list (shell=False), timeouts, and output limits.
        Disables interactive prompts and injects safe environment paths.
        Supports fallback execution on event loops lacking async subprocesses (Windows SelectorEventLoop).
        """
        import subprocess  # nosec B404

        # Ensure user Scripts and WinGet directories are included in PATH for subprocesses
        env = {**os.environ}
        if extra_env:
            env.update(extra_env)

        if os.name == "nt":
            appdata = os.environ.get("APPDATA")
            if appdata:
                user_scripts = str(Path(appdata) / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts")
                current_path = env.get("PATH", "")
                if user_scripts not in current_path:
                    env["PATH"] = f"{user_scripts};{current_path}"

            env_scripts = str(Path(sys.executable).parent / "Scripts")
            current_path = env.get("PATH", "")
            if env_scripts not in current_path:
                env["PATH"] = f"{env_scripts};{current_path}"

            localappdata = os.environ.get("LOCALAPPDATA")
            if localappdata:
                winget_links = str(Path(localappdata) / "Microsoft" / "WinGet" / "Links")
                current_path = env.get("PATH", "")
                if winget_links not in current_path:
                    env["PATH"] = f"{winget_links};{current_path}"

            # Also ensure all registry PATH directories are included
            reg_paths = _get_windows_registry_paths()
            current_path = env.get("PATH", "")
            extra_paths = [p for p in reg_paths if p not in current_path]
            if extra_paths:
                env["PATH"] = f"{';'.join(extra_paths)};{current_path}"

        # Prevent git or tools from prompting interactively
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["PYTHONUNBUFFERED"] = "1"

        process = None
        try:
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=str(cwd) if cwd else None,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )

                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(), timeout=float(timeout_seconds)
                )
                returncode = process.returncode or 0
            except NotImplementedError:
                # Async subprocess not implemented in this event loop (e.g. Windows SelectorEventLoop)
                def _sync_run():
                    return subprocess.run(  # nosec B603
                        cmd,
                        cwd=str(cwd) if cwd else None,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        env=env,
                        timeout=float(timeout_seconds),
                    )

                proc_res = await asyncio.to_thread(_sync_run)
                stdout_bytes = proc_res.stdout
                stderr_bytes = proc_res.stderr
                returncode = proc_res.returncode or 0

            # Cap output to prevent memory exhaustion
            stdout_str = stdout_bytes[:max_output_bytes].decode("utf-8", errors="replace")
            stderr_str = stderr_bytes[:max_output_bytes].decode("utf-8", errors="replace")

            return returncode, stdout_str, stderr_str

        except (asyncio.TimeoutError, TimeoutError, subprocess.TimeoutExpired) as exc:
            if process:
                try:
                    process.kill()
                except Exception as _kill_err:
                    _ = _kill_err
            raise TimeoutError(f"Scanner '{self.name}' timed out after {timeout_seconds} seconds.") from exc
