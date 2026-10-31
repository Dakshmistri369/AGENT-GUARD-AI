"""
AgentGuard AI — Scan Orchestration API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.artifact import ScanArtifact
from app.models.scan import Scan
from app.models.repository import Repository
from app.schemas.scan import ScanCreate, ScanResponse, ScanListResponse, ScanStatusResponse
from app.schemas.finding import FindingFilterParams, FindingListResponse
from app.schemas.artifact import ArtifactResponse, ArtifactListResponse
from app.services.scan_service import ScanService
from app.services.finding_service import FindingService

router = APIRouter(prefix="/scans", tags=["Scans"])


@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def create_scan(
    payload: ScanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate an asynchronous security scan for a repository.
    Enqueues background task for Semgrep, Bandit, and OSV scanning.
    """
    return await ScanService.create_and_enqueue_scan(db, current_user.id, payload)


@router.get("", response_model=ScanListResponse)
async def list_scans(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List scans for repositories owned by the user."""
    return await ScanService.list_scans(db, current_user.id, page, page_size)


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan_details(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve details and findings summary for a scan."""
    return await ScanService.get_scan(db, current_user.id, scan_id)


@router.get("/{scan_id}/status", response_model=ScanStatusResponse)
async def get_scan_status(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current execution status for a scan."""
    return await ScanService.get_scan_status(db, current_user.id, scan_id)


@router.post("/{scan_id}/cancel")
async def cancel_scan(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a queued or running scan as cancelled."""
    return await ScanService.cancel_scan(db, current_user.id, scan_id)


@router.get("/{scan_id}/findings", response_model=FindingListResponse)
async def get_scan_findings(
    scan_id: str,
    severity: str | None = Query(default=None, description="Filter by severity"),
    scanner: str | None = Query(default=None, description="Filter by scanner (semgrep, bandit, osv)"),
    category: str | None = Query(default=None, description="Filter by finding category"),
    file_path: str | None = Query(default=None, description="Filter by file path substring"),
    package_name: str | None = Query(default=None, description="Filter by package name"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List normalized findings for a scan with rich filtering and pagination."""
    params = FindingFilterParams(
        severity=severity,
        scanner=scanner,
        category=category,
        file_path=file_path,
        package_name=package_name,
        page=page,
        page_size=page_size,
    )
    return await FindingService.list_findings(db, current_user.id, scan_id, params)


@router.get("/{scan_id}/artifacts", response_model=ArtifactListResponse)
async def list_scan_artifacts(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List private storage artifacts (reports, logs) recorded for a scan."""
    # Verify scan ownership
    await ScanService.get_scan(db, current_user.id, scan_id)

    query = select(ScanArtifact).where(ScanArtifact.scan_id == str(scan_id))
    result = await db.execute(query)
    artifacts = result.scalars().all()

    return ArtifactListResponse(
        items=[ArtifactResponse.model_validate(a) for a in artifacts],
        total=len(artifacts),
    )
