"""
AgentGuard AI — Solutions API Router.
Provides automated code remediation diffs, CLI dependency upgrade scripts,
and repository-wide fix plans.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.service import AIService, get_ai_service
from app.dependencies import get_current_user, get_db
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.schemas.solution import FindingSolution, RepositorySolutionPlan
from app.services.solution_service import SolutionService

logger = logging.getLogger("agentguard.api.solutions")
router = APIRouter(tags=["solutions"])


@router.get("/api/scans/{scan_id}/solutions", response_model=RepositorySolutionPlan)
async def get_scan_solutions(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositorySolutionPlan:
    """
    Get consolidated remediation solutions, before/after code patches,
    and CLI upgrade commands for all findings in a scan.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    # Verify scan exists
    stmt_scan = select(Scan).where(Scan.id == scan_id)
    res_scan = await db.execute(stmt_scan)
    scan = res_scan.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Fetch findings
    stmt_findings = (
        select(Finding)
        .where(Finding.scan_id == scan.id)
        .order_by(Finding.id.asc())
    )
    res_findings = await db.execute(stmt_findings)
    findings = list(res_findings.scalars().all())

    return SolutionService.generate_repository_solution_plan(
        scan_id=scan.id,
        repository_id=scan.repository_id,
        findings=findings,
    )


@router.get("/api/scans/{scan_id}/solutions/patch", response_class=PlainTextResponse)
async def download_scan_unified_patch(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> str:
    """
    Download a unified git apply patch file (.patch) containing all automated
    code fixes for this scan.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    response.headers["Content-Disposition"] = f'attachment; filename="agentguard_scan_{scan_id}_fixes.patch"'

    stmt_scan = select(Scan).where(Scan.id == scan_id)
    res_scan = await db.execute(stmt_scan)
    scan = res_scan.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    stmt_findings = select(Finding).where(Finding.scan_id == scan.id).order_by(Finding.id.asc())
    res_findings = await db.execute(stmt_findings)
    findings = list(res_findings.scalars().all())

    plan = SolutionService.generate_repository_solution_plan(
        scan_id=scan.id,
        repository_id=scan.repository_id,
        findings=findings,
    )

    return plan.full_unified_patch or "# No code patches generated for this scan.\n"


@router.get("/api/findings/{finding_id}/solution", response_model=FindingSolution)
async def get_finding_solution(
    finding_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FindingSolution:
    """
    Get concrete remediation solution, before/after diff, and CLI command
    for a specific finding.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = select(Finding).where(Finding.id == finding_id)
    res = await db.execute(stmt)
    finding = res.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    return SolutionService.generate_solution_for_finding(finding)


@router.post("/api/findings/{finding_id}/solution/ai-enhance", response_model=FindingSolution)
async def enhance_finding_solution_with_ai(
    finding_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> FindingSolution:
    """
    Invoke NVIDIA Nemotron / AI Service to generate an advanced deep code fix
    and verified before/after diff for a finding.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = select(Finding).where(Finding.id == finding_id)
    res = await db.execute(stmt)
    finding = res.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    return await SolutionService.enhance_solution_with_ai(finding, ai_service)
