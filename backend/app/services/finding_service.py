"""
AgentGuard AI — Finding Service.
Queries and filters scan findings with strict user-level authorization and pagination.
"""
from __future__ import annotations

import uuid
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.schemas.finding import FindingFilterParams, FindingListResponse, FindingResponse

logger = get_logger("agentguard.services.finding_service")


class FindingService:
    """Manages finding retrieval, filtering, and batched persistence."""

    @staticmethod
    async def list_findings(
        db: AsyncSession,
        user_id: str | int,
        scan_id: str | int,
        params: FindingFilterParams,
    ) -> FindingListResponse:
        """
        List findings for a given scan, verifying user ownership of the scan.
        Supports filtering by severity, scanner, category, file_path, package_name.
        """
        # 1. Verify scan ownership
        scan_check = await db.execute(
            select(Scan.id).where(
                Scan.id == scan_id,
                Scan.repository_id.in_(
                    select(Repository.id).where(Repository.owner_id == user_id)
                ),
            )
        )
        if not scan_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scan {scan_id} not found or access denied.",
            )

        # 2. Build filtered query
        filters = [Finding.scan_id == scan_id]

        if params.severity:
            filters.append(Finding.severity == params.severity.lower())
        if params.scanner:
            filters.append(Finding.scanner == params.scanner.lower())
        if params.category:
            filters.append(Finding.classification == params.category.lower())
        if params.file_path:
            filters.append(Finding.file_path.ilike(f"%{params.file_path}%"))

        count_query = select(func.count(Finding.id)).where(*filters)
        total_res = await db.execute(count_query)
        total = total_res.scalar_one()

        offset = (params.page - 1) * params.page_size
        query = (
            select(Finding)
            .where(*filters)
            .order_by(Finding.id.asc())
            .offset(offset)
            .limit(params.page_size)
        )
        result = await db.execute(query)
        findings = result.scalars().all()

        pages = max(1, (total + params.page_size - 1) // params.page_size)
        return FindingListResponse(
            items=[FindingResponse.model_validate(f) for f in findings],
            total=total,
            page=params.page,
            page_size=params.page_size,
            pages=pages,
        )

    @staticmethod
    async def batch_insert_findings(
        db: AsyncSession,
        scan_id: str | int,
        user_id: str | int,
        normalized_findings: list[dict[str, Any]],
    ) -> int:
        """Persist a normalized batch of findings for a scan."""
        if not normalized_findings:
            return 0

        inserted_count = 0
        for item in normalized_findings:
            finding = Finding(
                scan_id=scan_id,
                title=item.get("title", "Security Finding")[:512],
                severity=item.get("severity", "medium"),
                confidence=item.get("confidence", "medium"),
                scanner=item.get("scanner", "agentguard"),
                scanner_version=item.get("scanner_version"),
                rule_id=item.get("rule_id"),
                file_path=item.get("file_path"),
                line_number=item.get("line_start"),
                line_end=item.get("line_end"),
                code_snippet=item.get("code_snippet"),
                location_type=item.get("location_type"),
                sanitized_evidence=item.get("description"),
                explanation=item.get("description"),
                remediation=item.get("remediation"),
                classification=item.get("category", "vulnerability"),
            )
            db.add(finding)
            inserted_count += 1

        await db.commit()
        logger.info("Persisted %d findings for scan %s", inserted_count, scan_id)
        return inserted_count
