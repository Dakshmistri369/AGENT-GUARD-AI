"""
AgentGuard AI — Scanner Setup & Binary Bootstrap Script.
Automatically checks for required scanners and downloads standalone binaries (such as OSV-Scanner)
into the project's local bin/ directory if not already available on the system.
Works across Windows (x64), Linux (x64, arm64), and macOS (x64, Apple Silicon).
"""
import os
import platform
import shutil
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

OSV_SCANNER_VERSION = "2.7.0"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BIN_DIR = PROJECT_ROOT / "bin"
BACKEND_BIN_DIR = PROJECT_ROOT / "backend" / "bin"

DOWNLOAD_URLS = {
    ("Windows", "AMD64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_windows_amd64.exe",
    ("Windows", "x86_64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_windows_amd64.exe",
    ("Linux", "x86_64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_linux_amd64",
    ("Linux", "aarch64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_linux_arm64",
    ("Darwin", "arm64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_darwin_arm64",
    ("Darwin", "x86_64"): f"https://github.com/google/osv-scanner/releases/download/v{OSV_SCANNER_VERSION}/osv-scanner_darwin_amd64",
}


def ensure_bin_dirs():
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_BIN_DIR.mkdir(parents=True, exist_ok=True)
    for d in [BIN_DIR, BACKEND_BIN_DIR]:
        gitkeep = d / ".gitkeep"
        if not gitkeep.exists():
            gitkeep.write_text("# Keep directory tracked in git\n", encoding="utf-8")


def check_existing_binary() -> str | None:
    # 1. Check project bin dirs
    for d in [BIN_DIR, BACKEND_BIN_DIR]:
        candidate = d / ("osv-scanner.exe" if os.name == "nt" else "osv-scanner")
        if candidate.is_file():
            return str(candidate)

    # 2. Check system PATH
    found = shutil.which("osv-scanner")
    if found:
        return found

    # 3. Check WinGet / package dirs on Windows
    if os.name == "nt":
        localappdata = os.environ.get("LOCALAPPDATA")
        if localappdata:
            pkg_dir = Path(localappdata) / "Microsoft" / "WinGet" / "Packages"
            if pkg_dir.exists():
                for m in pkg_dir.glob("**/osv-scanner.exe"):
                    if m.is_file():
                        return str(m)
    return None


def setup_osv_scanner():
    ensure_bin_dirs()
    existing = check_existing_binary()

    binary_name = "osv-scanner.exe" if os.name == "nt" else "osv-scanner"
    target_path = BIN_DIR / binary_name
    backend_target_path = BACKEND_BIN_DIR / binary_name

    if existing and existing != str(target_path):
        print(f"[AgentGuard] Found OSV-Scanner on host at: {existing}")
        if not target_path.exists():
            print(f"[AgentGuard] Linking/copying to project bin: {target_path}")
            shutil.copy2(existing, target_path)
        if not backend_target_path.exists():
            shutil.copy2(existing, backend_target_path)
    elif not existing and not target_path.exists():
        os_name = platform.system()
        arch = platform.machine()
        url = DOWNLOAD_URLS.get((os_name, arch))
        if not url:
            print(f"[AgentGuard] No prebuilt OSV-Scanner binary for {os_name} {arch}.")
            print("Please install osv-scanner manually: https://github.com/google/osv-scanner#installation")
            return

        print(f"[AgentGuard] Downloading OSV-Scanner v{OSV_SCANNER_VERSION} for {os_name} {arch}...")
        print(f"URL: {url}")
        urllib.request.urlretrieve(url, target_path)

        if os.name != "nt":
            target_path.chmod(target_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        shutil.copy2(target_path, backend_target_path)
        print(f"[AgentGuard] Downloaded OSV-Scanner successfully to {target_path}")

    # Verify binary execution
    try:
        res = subprocess.run([str(target_path), "--version"], capture_output=True, text=True, timeout=5)
        print(f"[AgentGuard] OSV-Scanner verified: {res.stdout.strip()}")
    except Exception as exc:
        print(f"[AgentGuard] Verification failed: {exc}")


if __name__ == "__main__":
    setup_osv_scanner()
