"""
AgentGuard AI — Findings Explorer API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.finding import Finding
from app.models.scan import Scan
from app.models.repository import Repository
from app.schemas.finding import FindingListResponse, FindingResponse

router = APIRouter(prefix="/findings", tags=["Findings"])


@router.get("", response_model=FindingListResponse)
async def list_all_user_findings(
    severity: str | None = Query(default=None, description="Filter by severity"),
    scanner: str | None = Query(default=None, description="Filter by scanner (semgrep, bandit, osv)"),
    category: str | None = Query(default=None, description="Filter by category"),
    repository_id: str | None = Query(default=None, description="Filter by repository ID"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all findings belonging to repositories owned by the user.
    Enforces user isolation via connected repository ownership.
    """
    user_repos = select(Repository.id).where(Repository.owner_id == current_user.id)
    if repository_id:
        user_repos = user_repos.where(Repository.id == repository_id)

    user_scans = select(Scan.id).where(Scan.repository_id.in_(user_repos))

    filters = [Finding.scan_id.in_(user_scans)]
    if severity:
        filters.append(Finding.severity == severity.lower())
    if scanner:
        filters.append(Finding.scanner == scanner.lower())
    if category:
        filters.append(Finding.classification == category.lower())

    count_query = select(func.count(Finding.id)).where(*filters)
    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    offset = (page - 1) * page_size
    query = (
        select(Finding)
        .where(*filters)
        .order_by(Finding.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    findings = result.scalars().all()

    pages = max(1, (total + page_size - 1) // page_size)
    return FindingListResponse(
        items=[FindingResponse.model_validate(f) for f in findings],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
