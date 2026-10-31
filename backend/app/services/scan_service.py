"""
AgentGuard AI — Scan Service.
Manages scan record lifecycles, concurrency checks, Arq job enqueueing, and cancellation.
"""
from __future__ import annotations

import datetime
import uuid
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.job import ScanJob
from app.queue.client import get_queue_client
from app.schemas.scan import ScanCreate, ScanResponse, ScanListResponse, ScanStatusResponse

logger = get_logger("agentguard.services.scan_service")
settings = get_settings()


class ScanService:
    """Orchestrates security scans with rate limiting, queueing, and ownership validation."""

    @staticmethod
    async def create_and_enqueue_scan(
        db: AsyncSession,
        user_id: str | int,
        payload: ScanCreate,
    ) -> ScanResponse:
        """Create a scan record and enqueue an Arq background worker job."""
        # 1. Verify repository ownership
        repo_query = select(Repository).where(
            Repository.id == payload.repository_id,
            Repository.owner_id == user_id,
        )
        repo_res = await db.execute(repo_query)
        repo = repo_res.scalar_one_or_none()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {payload.repository_id} not found or access denied.",
            )

        # 2. Check active concurrent scan quota for this user
        active_query = select(func.count(Scan.id)).where(
            Scan.repository_id.in_(
                select(Repository.id).where(Repository.owner_id == user_id)
            ),
            Scan.status.in_(["queued", "pending", "running"]),
        )
        active_count_res = await db.execute(active_query)
        active_count = active_count_res.scalar_one()

        if active_count >= settings.max_concurrent_scans_per_user:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"User scan quota exceeded: max {settings.max_concurrent_scans_per_user} concurrent active scans.",
            )

        # 3. Create Scan entry in 'queued' status
        scan_branch = payload.branch or repo.default_branch or "main"
        new_scan = Scan(
            repository_id=repo.id,
            status="queued",
            stage="queued",
            commit_sha=repo.pinned_sha,
            summary={},
            configuration={
                "branch": scan_branch,
                "scan_type": payload.scan_type or "full",
                "semgrep_enabled": settings.semgrep_enabled,
                "bandit_enabled": settings.bandit_enabled,
                "osv_enabled": settings.osv_enabled,
            },
        )
        db.add(new_scan)
        await db.commit()
        await db.refresh(new_scan)

        # 4. Enqueue to Arq/Redis queue
        queue_client = get_queue_client()
        arq_job_id = None
        try:
            arq_job_id = await queue_client.enqueue_scan(
                scan_id=new_scan.id,
                repo_url=repo.url,
                branch=scan_branch,
                metadata_only=(payload.scan_type == "metadata_only"),
            )
            logger.info("Enqueued scan %s for repo %s (arq job %s)", new_scan.id, repo.full_name, arq_job_id)
        except Exception as exc:
            logger.error("Failed to enqueue scan %s to Arq: %s", new_scan.id, exc)
            new_scan.status = "failed"
            new_scan.error_message = f"Queue enqueueing failed: {exc}"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Background job queue is temporarily unavailable. Please retry in a moment.",
            )

        # 5. Record ScanJob entry
        try:
            scan_job = ScanJob(
                id=str(uuid.uuid4()),
                scan_id=int(new_scan.id),
                user_id=str(user_id),
                arq_job_id=str(arq_job_id) if arq_job_id else None,
                status="queued",
            )
            db.add(scan_job)
            await db.commit()
        except Exception as job_err:
            logger.warning("Could not persist ScanJob entry: %s", job_err)

        return ScanResponse.from_orm_safe(new_scan)

    @staticmethod
    async def list_scans(
        db: AsyncSession,
        user_id: str | int,
        page: int = 1,
        page_size: int = 20,
    ) -> ScanListResponse:
        """List scans owned by the user with pagination."""
        offset = (page - 1) * page_size

        count_query = select(func.count(Scan.id)).where(
            Scan.repository_id.in_(
                select(Repository.id).where(Repository.owner_id == user_id)
            )
        )
        total_res = await db.execute(count_query)
        total = total_res.scalar_one()

        query = (
            select(Scan)
            .where(
                Scan.repository_id.in_(
                    select(Repository.id).where(Repository.owner_id == user_id)
                )
            )
            .order_by(Scan.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(query)
        scans = result.scalars().all()

        pages = max(1, (total + page_size - 1) // page_size)
        return ScanListResponse(
            items=[ScanResponse.from_orm_safe(s) for s in scans],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    @staticmethod
    async def get_scan(
        db: AsyncSession,
        user_id: str | int,
        scan_id: str | int,
    ) -> ScanResponse:
        """Retrieve single scan, verifying user ownership via connected repository."""
        query = select(Scan).where(
            Scan.id == scan_id,
            Scan.repository_id.in_(
                select(Repository.id).where(Repository.owner_id == user_id)
            ),
        )
        result = await db.execute(query)
        scan = result.scalar_one_or_none()
        if not scan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scan {scan_id} not found or access denied.",
            )
        return ScanResponse.from_orm_safe(scan)

    @staticmethod
    async def get_scan_status(
        db: AsyncSession,
        user_id: str | int,
        scan_id: str | int,
    ) -> ScanStatusResponse:
        """Return current status and summary metrics for a scan."""
        scan = await ScanService.get_scan(db, user_id, scan_id)
        duration = None
        if scan.started_at and scan.completed_at:
            duration = (scan.completed_at - scan.started_at).total_seconds()

        return ScanStatusResponse(
            scan_id=scan.id,
            status=scan.status,
            error_message=scan.error_message,
            started_at=scan.started_at,
            completed_at=scan.completed_at,
            duration_seconds=duration,
            summary=scan.summary,
        )

    @staticmethod
    async def cancel_scan(
        db: AsyncSession,
        user_id: str | int,
        scan_id: str | int,
    ) -> dict[str, Any]:
        """Cancel a queued or running scan."""
        query = select(Scan).where(
            Scan.id == scan_id,
            Scan.repository_id.in_(
                select(Repository.id).where(Repository.owner_id == user_id)
            ),
        )
        result = await db.execute(query)
        scan = result.scalar_one_or_none()
        if not scan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scan {scan_id} not found or access denied.",
            )

        if scan.status in ["completed", "failed", "cancelled"]:
            return {"status": "unchanged", "message": f"Scan {scan_id} is already in terminal state '{scan.status}'."}

        scan.status = "cancelled"
        scan.stage = "cancelled"
        scan.error_message = "Scan was cancelled by user."
        scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
        await db.commit()
        logger.info("User %s cancelled scan %s", user_id, scan_id)
        return {"status": "cancelled", "message": f"Scan {scan_id} cancelled successfully."}
