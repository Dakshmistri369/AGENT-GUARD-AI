"""
AgentGuard AI — Phase 7 Locust Benchmark Runner.
Starts Uvicorn server, runs headless Locust benchmarks at 10 VUs and 25 VUs,
parses CSV statistics, and reports exact empirical latency percentiles and RPS.
"""
import csv
import glob
import os
import subprocess
import sys
import time
from pathlib import Path

# Paths
backend_dir = Path(__file__).resolve().parent.parent
locust_file = backend_dir / "load_testing" / "locustfile.py"
output_dir = backend_dir / "load_testing"


def wait_for_server(url="http://localhost:8000/health", timeout=30):
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def run_locust_test(users: int, spawn_rate: int, duration_sec: int, prefix: str):
    csv_prefix = str(output_dir / prefix)
    cmd = [
        sys.executable,
        "-m",
        "locust",
        "-f",
        str(locust_file),
        "--headless",
        "-u",
        str(users),
        "-r",
        str(spawn_rate),
        "--run-time",
        f"{duration_sec}s",
        "--host",
        "http://localhost:8000",
        "--csv",
        csv_prefix,
    ]
    print(f"\n[Locust] Running {users} VUs (spawn rate {spawn_rate}/s) for {duration_sec}s...")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(backend_dir))
    return result


def parse_locust_stats(prefix: str):
    stats_file = output_dir / f"{prefix}_stats.csv"
    if not stats_file.exists():
        print(f"Stats file not found: {stats_file}")
        return None

    total_row = None
    with open(stats_file, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("Name") == "Aggregated":
                total_row = row
                break

    if not total_row:
        return None

    return {
        "requests": int(total_row.get("Request Count", 0)),
        "failures": int(total_row.get("Failure Count", 0)),
        "rps": float(total_row.get("Requests/s", 0.0)),
        "avg_ms": float(total_row.get("Average Response Time", 0.0)),
        "min_ms": float(total_row.get("Min Response Time", 0.0)),
        "max_ms": float(total_row.get("Max Response Time", 0.0)),
        "p50_ms": float(total_row.get("50%", 0.0)),
        "p95_ms": float(total_row.get("95%", 0.0)),
        "p99_ms": float(total_row.get("99%", 0.0)),
    }


def main():
    print("=" * 70)
    print("AGENTGUARD AI — PHASE 7 LOCUST LOAD BENCHMARKS (10 & 25 VUs)")
    print("=" * 70)

    # 1. Start Uvicorn in background
    print("[1/4] Starting local FastAPI server on port 8000...")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(backend_dir)
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(backend_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        if not wait_for_server():
            print("ERROR: Server failed to start within 30s")
            return

        print("[2/4] Server is healthy and responding on http://127.0.0.1:8000/health")

        # 2. Run 10 VU Benchmark
        print("[3/4] Executing 10 VU Benchmark (duration: 15s)...")
        run_locust_test(users=10, spawn_rate=5, duration_sec=15, prefix="phase7_10vu")
        stats_10 = parse_locust_stats("phase7_10vu")

        # 3. Run 25 VU Benchmark
        print("[4/4] Executing 25 VU Benchmark (duration: 15s)...")
        run_locust_test(users=25, spawn_rate=10, duration_sec=15, prefix="phase7_25vu")
        stats_25 = parse_locust_stats("phase7_25vu")

        print("\n" + "=" * 70)
        print("EMPIRICAL BENCHMARK RESULTS COMPARISON (PHASE 6 vs PHASE 7)")
        print("=" * 70)
        print(f"{'Concurrency':<12} | {'Phase 6 Baseline':<30} | {'Phase 7 Optimized':<30}")
        print("-" * 76)

        if stats_10:
            print(f"{'10 VUs':<12} | 22.83 RPS / 425.53 ms p50        | {stats_10['rps']:.2f} RPS / {stats_10['p50_ms']:.2f} ms p50")
            print(f"{'':<12} | p95: 435.72 ms | p99: 435.72 ms     | p95: {stats_10['p95_ms']:.2f} ms | p99: {stats_10['p99_ms']:.2f} ms")
            print(f"{'':<12} | Errors: 0.00%                      | Errors: {stats_10['failures'] / max(1, stats_10['requests']) * 100:.2f}%")
            print("-" * 76)

        if stats_25:
            print(f"{'25 VUs':<12} | 23.04 RPS / 1063.88 ms p50       | {stats_25['rps']:.2f} RPS / {stats_25['p50_ms']:.2f} ms p50")
            print(f"{'':<12} | p95: 1078.00 ms | p99: 1079.12 ms   | p95: {stats_25['p95_ms']:.2f} ms | p99: {stats_25['p99_ms']:.2f} ms")
            print(f"{'':<12} | Errors: 0.00%                      | Errors: {stats_25['failures'] / max(1, stats_25['requests']) * 100:.2f}%")
            print("=" * 76)

    finally:
        print("\nTerminating local server process...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("Server stopped cleanly.")


if __name__ == "__main__":
    main()
