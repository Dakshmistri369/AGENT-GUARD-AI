"""
Run VACUUM ANALYZE on findings and scans and EXPLAIN (ANALYZE, BUFFERS) on dashboard CTE.
Verifies Heap Fetches drops to 0 on Index-Only Scan.
"""
import asyncio
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.database.session import engine


async def main():
    # 1. Run VACUUM ANALYZE in AUTOCOMMIT mode
    async with engine.connect() as conn:
        autocommit_conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        print("Running VACUUM ANALYZE findings...")
        await autocommit_conn.execute(text("VACUUM ANALYZE findings;"))
        print("Running VACUUM ANALYZE scans...")
        await autocommit_conn.execute(text("VACUUM ANALYZE scans;"))
        print("VACUUM ANALYZE completed successfully.")

    # 2. Re-run EXPLAIN (ANALYZE, BUFFERS) on the CTE
    cte_query = """
    EXPLAIN (ANALYZE, BUFFERS)
    WITH user_repos AS (
        SELECT id FROM repositories WHERE owner_id = 1
    ),
    scan_stats AS (
        SELECT 
            COUNT(*) AS total_scans,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed_scans,
            COUNT(*) FILTER (WHERE status IN ('running', 'queued', 'pending')) AS running_scans,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed_scans
        FROM scans
        WHERE repository_id IN (SELECT id FROM user_repos)
    ),
    finding_stats AS (
        SELECT
            COUNT(f.id) AS total_findings,
            COUNT(f.id) FILTER (WHERE lower(f.severity) = 'critical') AS critical_findings,
            COUNT(f.id) FILTER (WHERE lower(f.severity) = 'high') AS high_findings,
            COUNT(f.id) FILTER (WHERE lower(f.severity) = 'medium') AS medium_findings,
            COUNT(f.id) FILTER (WHERE lower(f.severity) = 'low') AS low_findings,
            COUNT(f.id) FILTER (WHERE lower(f.severity) = 'info') AS info_findings,
            COUNT(f.id) FILTER (WHERE f.verification_status = 'false_positive') AS false_positives,
            COUNT(f.id) FILTER (WHERE f.verification_status IN ('unverified', 'confirmed')) AS potential_issues,
            COUNT(f.id) FILTER (
                WHERE f.verification_status IN ('unverified', 'confirmed') 
                AND (f.remediation IS NOT NULL OR f.code_snippet IS NOT NULL OR lower(f.scanner) IN ('bandit', 'detect_secrets', 'detect-secrets', 'osv_scanner', 'semgrep'))
            ) AS patches_available
        FROM findings f
        JOIN scans s ON f.scan_id = s.id
        WHERE s.repository_id IN (SELECT id FROM user_repos)
    ),
    repo_stats AS (
        SELECT COUNT(*) AS total_repositories FROM user_repos
    )
    SELECT 
        r.total_repositories,
        s.total_scans,
        s.completed_scans,
        s.running_scans,
        s.failed_scans,
        f.total_findings,
        f.critical_findings,
        f.high_findings,
        f.medium_findings,
        f.low_findings,
        f.info_findings,
        f.false_positives,
        f.potential_issues,
        f.patches_available
    FROM repo_stats r
    CROSS JOIN scan_stats s
    CROSS JOIN finding_stats f;
    """

    async with engine.connect() as conn:
        res = await conn.execute(text(cte_query))
        lines = [row[0] for row in res.fetchall()]
        print("\n" + "=" * 60)
        print("EXPLAIN (ANALYZE, BUFFERS) OUTPUT:")
        print("=" * 60)
        for line in lines:
            print(line)
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
