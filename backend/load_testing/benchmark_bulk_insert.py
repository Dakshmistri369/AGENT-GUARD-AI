"""
AgentGuard AI — 500-Finding Bulk Insert Benchmark.
Measures execution time of SQLAlchemy 2.0 Core insert(Finding) vs. ORM add_all.
Target: < 100 ms (down from 1,068.88 ms in Phase 6).
"""
import asyncio
import datetime
import os
import sys
import time
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import func, insert, select
from app.database.session import AsyncSessionLocal
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User


async def run_bulk_insert_benchmark():
    async with AsyncSessionLocal() as session:
        # 1. Setup or retrieve benchmark User & Repo & Scan
        user_res = await session.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            user = User(email="bench_user@agentguard.dev", email_verified=True)
            session.add(user)
            await session.commit()
            await session.refresh(user)

        repo_res = await session.execute(select(Repository).where(Repository.owner_id == user.id).limit(1))
        repo = repo_res.scalar_one_or_none()
        if not repo:
            repo = Repository(
                owner_id=user.id,
                name="bulk-bench-repo",
                owner_name="benchmarks",
                full_name="benchmarks/bulk-bench-repo",
                url="https://github.com/benchmarks/bulk-bench-repo",
            )
            session.add(repo)
            await session.commit()
            await session.refresh(repo)

        scan = Scan(
            repository_id=repo.id,
            status="running",
            stage="running_scanners",
        )
        session.add(scan)
        await session.commit()
        await session.refresh(scan)

        # 2. Prepare 500 realistic finding dictionaries
        severities = ["critical", "high", "medium", "low", "info"]
        scanners = ["semgrep", "bandit", "detect-secrets", "osv_scanner"]
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        finding_dicts = []
        for i in range(500):
            sev = severities[i % len(severities)]
            sc = scanners[i % len(scanners)]
            finding_dicts.append({
                "scan_id": scan.id,
                "fingerprint": f"fp_{scan.id}_{i}_{sc}",
                "title": f"Benchmark Finding #{i + 1} ({sev.upper()})",
                "severity": sev,
                "confidence": "high",
                "scanner": sc,
                "scanner_version": "1.0.0",
                "rule_id": f"RULE-{i % 50}",
                "file_path": f"src/modules/service_{i % 10}/handler_{i}.py",
                "line_number": (i * 7) % 500 + 1,
                "line_end": (i * 7) % 500 + 3,
                "column_number": 12,
                "code_snippet": f"critical_token = 'secret_val_{i}'  # nosec",
                "location_type": "file_level",
                "commit_sha": "a1b2c3d4e5f67890",
                "sanitized_evidence": "redacted_token_value",
                "explanation": f"Automated benchmark finding {i}",
                "remediation": "Rotate token and store in secrets manager.",
                "verification_status": "unverified",
                "classification": "confirmed_secret",
                "classification_reason": "High entropy token match",
                "secret_redacted_preview": f"sec_***_{i}",
                "created_at": now_utc,
            })

        # 3. Benchmark SQLAlchemy 2.0 Core Bulk insert()
        t0 = time.perf_counter()
        await session.execute(insert(Finding), finding_dicts)
        await session.commit()
        t1 = time.perf_counter()

        duration_ms = (t1 - t0) * 1000

        # 4. Verify insertion count
        count_res = await session.execute(
            select(func.count(Finding.id)).where(Finding.scan_id == scan.id)
        )
        count = count_res.scalar() or 0

        # 5. Cleanup benchmark scan
        await session.execute(Finding.__table__.delete().where(Finding.scan_id == scan.id))
        await session.delete(scan)
        await session.commit()

        print("=" * 60)
        print("AGENTGUARD AI — 500-FINDING BULK INSERT BENCHMARK")
        print("=" * 60)
        print(f"Inserted Findings:    {count} rows")
        print(f"Phase 6 ORM Baseline: 1,068.88 ms")
        print(f"Phase 7 Core Insert:  {duration_ms:.2f} ms")
        speedup = 1068.88 / duration_ms if duration_ms > 0 else 0
        print(f"Speedup Factor:       {speedup:.1f}x faster")
        print(f"Latency Reduction:    {(1 - (duration_ms / 1068.88)) * 100:.1f}%")
        print(f"Target Met (< 100ms): {'YES' if duration_ms < 100 else 'NO'}")
        print("=" * 60)

        return duration_ms, count


if __name__ == "__main__":
    asyncio.run(run_bulk_insert_benchmark())
