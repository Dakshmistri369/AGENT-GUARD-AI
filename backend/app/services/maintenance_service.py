"""
AgentGuard AI — Database Maintenance & Data Retention Service.
Implements hygiene policies to keep Supabase storage footprint bounded:
1. Prunes failed or aborted scans older than 7 days with 0 findings.
2. Clears verbose skip manifests from completed scans older than 90 days
   while preserving scan summaries, metrics, and finding evidence intact.
"""
from __future__ import annotations

import datetime
import logging
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finding import Finding
from app.models.scan import Scan

logger = logging.getLogger("agentguard.maintenance")


class DatabaseMaintenanceService:
    @staticmethod
    async def run_retention_hygiene(
        db: AsyncSession,
        failed_scan_retention_days: int = 7,
        manifest_retention_days: int = 90,
    ) -> dict[str, Any]:
        """
        Execute storage hygiene and retention pruning.
        Returns a summary report of pruned and compressed rows.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        failed_cutoff = now - datetime.timedelta(days=failed_scan_retention_days)
        manifest_cutoff = now - datetime.timedelta(days=manifest_retention_days)

        # 1. Prune failed / cancelled / timed_out scans older than 7 days with zero findings
        subq_finding_count = (
            select(Finding.scan_id)
            .group_by(Finding.scan_id)
        )
        stmt_failed_scans = (
            delete(Scan)
            .where(
                Scan.status.in_(["failed", "cancelled"]),
                Scan.created_at < failed_cutoff,
                ~Scan.id.in_(subq_finding_count),
            )
        )
        res_failed = await db.execute(stmt_failed_scans)
        pruned_empty_scans = res_failed.rowcount or 0

        # 2. Clear verbose skip_manifest JSONB from scans older than 90 days
        stmt_manifest_cleanup = (
            update(Scan)
            .where(
                Scan.created_at < manifest_cutoff,
                Scan.skip_manifest != {},
            )
            .values(skip_manifest={})
        )
        res_manifest = await db.execute(stmt_manifest_cleanup)
        compacted_manifests = res_manifest.rowcount or 0

        await db.commit()

        logger.info(
            "Retention hygiene complete: pruned %d empty failed scans, compacted %d manifests older than %d days",
            pruned_empty_scans,
            compacted_manifests,
            manifest_retention_days,
        )
        return {
            "pruned_empty_failed_scans": pruned_empty_scans,
            "compacted_manifests": compacted_manifests,
            "failed_cutoff": failed_cutoff.isoformat(),
            "manifest_cutoff": manifest_cutoff.isoformat(),
        }
