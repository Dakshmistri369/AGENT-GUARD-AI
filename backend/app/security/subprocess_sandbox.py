"""
AgentGuard AI — Subprocess Sandbox Isolation, Credential Scrubbing & Workspace Security Module (Milestone C).

Provides:
1. Environment Sanitization & Credential Scrubbing:
   Ensures subprocesses (scanners, git) execute with a minimal, safe environment whitelist.
   Strictly scrubs DATABASE_URL, Supabase keys, JWT secrets, and API credentials to prevent
   untrusted scanned repositories or compromised scanner parsers from accessing infrastructure secrets.

2. Process Tree Termination:
   Ensures orphaned child/descendant scanner processes are terminated cleanly on timeout or cancellation.

3. Symlink Traversal Protection:
   Detects and neutralizes malicious symlinks that point outside the isolated workspace.

4. Orphan Workspace Garbage Collection:
   Reaps abandoned workspace directories on worker/server startup and periodically.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import stat
import subprocess  # nosec B404
import sys
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("agentguard.security.sandbox")

# ── Whitelist of Safe Environment Variables for Subprocesses ──────────────────
SAFE_ENV_PASSTHROUGH = {
    # System & Platform Essentials
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "ALLUSERSPROFILE",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "COMMONPROGRAMFILES",
    # Locale & Encoding (prevents scanner crashes on non-ASCII code)
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "TERM",
    # Safe Tool Configurations
    "SEMGREP_RULES",
    "SEMGREP_VERSION",
    "BANDIT_CONFIG",
    "OSV_SCANNER_CONFIG",
}

# ── Blacklist Patterns: Explicitly Block Sensitive Keys ───────────────────────
BLOCKED_ENV_PATTERNS = [
    re.compile(r"DATABASE", re.IGNORECASE),
    re.compile(r"SUPABASE", re.IGNORECASE),
    re.compile(r"POSTGRES", re.IGNORECASE),
    re.compile(r"PG[A-Z0-9_]*", re.IGNORECASE),
    re.compile(r"REDIS", re.IGNORECASE),
    re.compile(r"SECRET", re.IGNORECASE),
    re.compile(r"PASSWORD", re.IGNORECASE),
    re.compile(r"TOKEN", re.IGNORECASE),
    re.compile(r"KEY", re.IGNORECASE),
    re.compile(r"AUTH", re.IGNORECASE),
    re.compile(r"CREDENTIAL", re.IGNORECASE),
    re.compile(r"PRIVATE", re.IGNORECASE),
    re.compile(r"SALT", re.IGNORECASE),
    re.compile(r"JWT", re.IGNORECASE),
    re.compile(r"API_KEY", re.IGNORECASE),
    re.compile(r"NVIDIA", re.IGNORECASE),
    re.compile(r"OPENAI", re.IGNORECASE),
    re.compile(r"ANTHROPIC", re.IGNORECASE),
    re.compile(r"GEMINI", re.IGNORECASE),
    re.compile(r"LANGSMITH", re.IGNORECASE),
    re.compile(r"AWS_", re.IGNORECASE),
]


def is_sensitive_env_key(key: str) -> bool:
    """Check if an environment variable key matches sensitive credential patterns."""
    return any(p.search(key) for p in BLOCKED_ENV_PATTERNS)


def get_sanitized_subprocess_env(extra_env: dict[str, str] | None = None) -> dict[str, str]:
    """
    Construct a hardened, sanitized environment dictionary for scanner and git subprocesses.
    - Only permits whitelisted system and platform environment variables.
    - Strips all application secrets, database URLs, API tokens, and JWT keys.
    - Enforces non-interactive terminal execution to prevent git/ssh credential prompts.
    - Augments PATH with Python user Scripts, WinGet, and project bin directories.
    """
    sanitized: dict[str, str] = {}

    # 1. Filter existing host environment against safe whitelist & blocked patterns
    for k, v in os.environ.items():
        if k in SAFE_ENV_PASSTHROUGH and not is_sensitive_env_key(k):
            sanitized[k] = v

    # 2. Hardened execution baseline flags
    sanitized["GIT_TERMINAL_PROMPT"] = "0"
    sanitized["GIT_ASKPASS"] = ""
    sanitized["SSH_ASKPASS"] = ""
    sanitized["PYTHONUNBUFFERED"] = "1"
    sanitized["PYTHONDONTWRITEBYTECODE"] = "1"

    # 3. Augment PATH so bundled tools (e.g. osv-scanner, semgrep, bandit) can be discovered
    sanitized_path = sanitized.get("PATH", "")
    sep = ";" if os.name == "nt" else ":"

    # Project bin directories
    base_dir = Path(__file__).resolve().parent.parent.parent
    candidate_bins = [
        str(base_dir / "bin"),
        str(base_dir.parent / "bin"),
        str(Path.cwd() / "bin"),
        str(Path.cwd() / "backend" / "bin"),
    ]
    for c_bin in candidate_bins:
        if os.path.isdir(c_bin) and c_bin not in sanitized_path:
            sanitized_path = f"{c_bin}{sep}{sanitized_path}"

    # Windows specific tool paths (Python Scripts & WinGet)
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if appdata:
            user_scripts = str(Path(appdata) / "Python" / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts")
            if os.path.isdir(user_scripts) and user_scripts not in sanitized_path:
                sanitized_path = f"{user_scripts}{sep}{sanitized_path}"

        env_scripts = str(Path(sys.executable).parent / "Scripts")
        if os.path.isdir(env_scripts) and env_scripts not in sanitized_path:
            sanitized_path = f"{env_scripts}{sep}{sanitized_path}"

        localappdata = os.environ.get("LOCALAPPDATA")
        if localappdata:
            winget_links = str(Path(localappdata) / "Microsoft" / "WinGet" / "Links")
            if os.path.isdir(winget_links) and winget_links not in sanitized_path:
                sanitized_path = f"{winget_links}{sep}{sanitized_path}"

    sanitized["PATH"] = sanitized_path

    # 4. Merge extra_env if provided, filtering out any sensitive keys
    if extra_env:
        for k, v in extra_env.items():
            if not is_sensitive_env_key(k):
                sanitized[k] = str(v)
            else:
                logger.warning("Scrubbed sensitive variable '%s' from subprocess extra_env request.", k)

    return sanitized


def terminate_process_tree(process: Any) -> None:
    """
    Forcefully terminate a process and all of its spawned child processes.
    Handles both asyncio.subprocess.Process and subprocess.Popen across Windows and POSIX.
    """
    if not process:
        return

    pid = getattr(process, "pid", None)
    if not pid:
        return

    try:
        if os.name == "nt":
            # On Windows, taskkill /PID {pid} /T /F terminates the entire process tree forcefully
            subprocess.run(  # nosec B603
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5.0,
            )
        else:
            # On POSIX, kill process group or signal process
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, 9)  # SIGKILL
            except Exception:
                process.kill()
    except Exception as exc:
        logger.debug("Process tree termination error for PID %s (may have already exited): %s", pid, exc)
        try:
            process.kill()
        except Exception:
            pass


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """
    Ensure target_path resolves strictly within base_dir.
    Guards against directory traversal, escaping symlinks, and relative parent escapes.
    """
    try:
        base_resolved = base_dir.resolve(strict=False)
        target_resolved = target_path.resolve(strict=False)
        return os.path.commonpath([str(base_resolved), str(target_resolved)]) == str(base_resolved)
    except Exception as exc:
        logger.warning("Path resolution error during safety check: %s", exc)
        return False


def sanitize_workspace_symlinks(workspace: Path) -> list[Path]:
    """
    Scan workspace recursively for symbolic links and neutralize any that resolve outside workspace.
    Returns list of removed malicious symlinks.
    """
    removed: list[Path] = []
    if not workspace.exists() or not workspace.is_dir():
        return removed

    try:
        for root, dirs, files in os.walk(workspace):
            for name in files + dirs:
                p = Path(root) / name
                if p.is_symlink():
                    try:
                        resolved = p.resolve(strict=False)
                        if not is_safe_path(workspace, resolved):
                            logger.critical(
                                "SECURITY ALERT: Neutralized malicious escaping symlink: %s -> %s",
                                p, resolved
                            )
                            p.unlink()
                            removed.append(p)
                    except Exception as sym_err:
                        logger.warning("Error checking symlink %s, removing as precaution: %s", p, sym_err)
                        try:
                            p.unlink()
                            removed.append(p)
                        except Exception:
                            pass
    except Exception as walk_err:
        logger.warning("Error during workspace symlink sanitization: %s", walk_err)

    return removed


def _remove_readonly(func, path, *args):
    """Windows onerror/onexc handler for shutil.rmtree to remove read-only flags (e.g. .git files)."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as exc:
        logger.debug("Could not force-remove read-only file %s: %s", path, exc)


def cleanup_workspace(workspace: Path | str | None) -> None:
    """Safely delete the isolated workspace directory and all contained files."""
    if not workspace:
        return

    path = Path(workspace)
    if not path.exists():
        return

    try:
        if sys.version_info >= (3, 12):
            shutil.rmtree(path, onexc=_remove_readonly)
        else:
            shutil.rmtree(path, onerror=_remove_readonly)
        logger.info("Successfully cleaned up isolated workspace: %s", path)
    except Exception as exc:
        logger.error("Failed to clean up workspace %s: %s", path, exc)


def reap_orphan_workspaces(base_dir_str: str, max_age_seconds: int = 3600) -> int:
    """
    Orphan Workspace Garbage Collector.
    Scans base_dir for leftover scan workspace directories older than max_age_seconds
    and deletes them. Returns count of reaped workspaces.
    """
    base_dir = Path(base_dir_str).resolve()
    if not base_dir.exists() or not base_dir.is_dir():
        return 0

    reaped_count = 0
    now = time.time()

    try:
        for entry in base_dir.iterdir():
            if entry.is_dir() and entry.name.startswith("scan_"):
                try:
                    stat_res = entry.stat()
                    # Check age of directory against max_age_seconds
                    age = now - stat_res.st_mtime
                    if age > max_age_seconds:
                        logger.warning(
                            "Reaping orphaned scan workspace: %s (age: %ds > %ds)",
                            entry.name, int(age), max_age_seconds
                        )
                        cleanup_workspace(entry)
                        reaped_count += 1
                except Exception as entry_err:
                    logger.debug("Error checking workspace %s: %s", entry, entry_err)
    except Exception as scan_err:
        logger.warning("Error scanning workspace directory %s: %s", base_dir, scan_err)

    if reaped_count > 0:
        logger.info("Reaped %d orphaned scan workspaces from %s", reaped_count, base_dir)

    return reaped_count
