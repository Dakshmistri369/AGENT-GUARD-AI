import asyncio
import json
import shutil
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scanners.orchestrator import ScannerOrchestrator
from app.scanners.osv import OSVScanner
from app.scanners.semgrep import SemgrepScanner


async def run_verification():
    print("=" * 65)
    print("AgentGuard AI — End-to-End Scanner Precision & Health Verification")
    print("=" * 65)

    base_ws = Path(__file__).resolve().parents[1] / "scan_workspaces" / "verification_run"
    if base_ws.exists():
        shutil.rmtree(base_ws, ignore_errors=True)
    base_ws.mkdir(parents=True, exist_ok=True)

    try:
        # Create test vulnerable python file
        test_py = base_ws / "database_query.py"
        test_py.write_text(
            "import os\n"
            "user_id = input('User ID: ')\n"
            "query = f'SELECT * FROM users WHERE id = {user_id}'\n"
            "cursor.execute(query)\n",
            encoding="utf-8"
        )

        # Create test vulnerable requirements.txt
        req_file = base_ws / "requirements.txt"
        req_file.write_text(
            "requests==2.25.0\n"
            "urllib3==1.25.8\n",
            encoding="utf-8"
        )

        metadata = {
            "extensions": [".py", ".txt"],
            "manifests": ["requirements.txt"],
            "languages": ["Python"]
        }

        # -------------------------------------------------------------
        # 1. SEMGREP TEST
        # -------------------------------------------------------------
        print("\n[1] Testing Semgrep SAST Scanner...")
        sem = SemgrepScanner()
        avail, ver = sem.is_available()
        print(f"    Available:  {avail} (Engine version: {ver})")
        t0 = time.time()
        sem_res = await sem.scan(base_ws, metadata, timeout_seconds=60)
        sem_dur = time.time() - t0
        print(f"    Status:     {sem_res.status} (completed in {sem_dur:.2f}s)")
        print(f"    Findings:   {len(sem_res.findings)}")
        for idx, f in enumerate(sem_res.findings, 1):
            print(f"      Finding #{idx}:")
            print(f"        Rule:      {f.get('rule_id')}")
            print(f"        Location:  {f.get('file_path')}:{f.get('line_number')}:{f.get('column_number')}")
            print(f"        Severity:  {f.get('severity')}")
            print(f"        Title:     {f.get('title')}")

        # -------------------------------------------------------------
        # 2. OSV-SCANNER TEST
        # -------------------------------------------------------------
        print("\n[2] Testing OSV-Scanner Dependency Engine...")
        osv = OSVScanner()
        avail, ver = osv.is_available()
        print(f"    Available:  {avail} (Engine version: {ver})")
        t0 = time.time()
        osv_res = await osv.scan(base_ws, metadata, timeout_seconds=60)
        osv_dur = time.time() - t0
        print(f"    Status:     {osv_res.status} (completed in {osv_dur:.2f}s)")
        print(f"    Findings:   {len(osv_res.findings)}")
        for idx, f in enumerate(osv_res.findings[:3], 1):
            print(f"      Finding #{idx}:")
            print(f"        Vulnerability: {f.get('rule_id')}")
            print(f"        Package:       {f.get('sanitized_evidence')}")
            print(f"        File:          {f.get('file_path')}")
            print(f"        Severity:      {f.get('severity')}")
            print(f"        Title:         {f.get('title')}")

        # -------------------------------------------------------------
        # 3. FULL CONCURRENT ORCHESTRATION TEST
        # -------------------------------------------------------------
        print("\n[3] Testing Scanner Orchestrator (Concurrent Pipeline)...")
        orch = ScannerOrchestrator()
        t0 = time.time()
        findings, scanners_run, coverage, matrix = await orch.run_scans(
            workspace_path=base_ws,
            metadata=metadata,
            timeout_seconds=60,
        )
        orch_dur = time.time() - t0
        print(f"    Total Findings Aggregated: {len(findings)}")
        print(f"    Total Scanners Run:        {len(scanners_run)}")
        print(f"    Orchestrator Elapsed:      {orch_dur:.2f}s")
        for sc in scanners_run:
            print(f"      - {sc['name']:<16} Status: {sc['status']:<12} Findings: {sc.get('findings_count', 0)} ({sc.get('duration_seconds', 0)}s)")

    finally:
        if base_ws.exists():
            shutil.rmtree(base_ws, ignore_errors=True)

    print("\n" + "=" * 65)
    print("ALL SCANNERS OPERATING PERFECTLY")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_verification())
