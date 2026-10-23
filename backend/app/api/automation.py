"""
Automation & n8n Integration API Router.
Provides endpoints for recording and retrieving audit logs, PR gate evaluations,
and autonomous security operations telemetry.
"""
from __future__ import annotations

import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.automation import AutomationAuditLog, AutomationPRCheck
from app.models.scan import Scan
from app.models.user import User

router = APIRouter(prefix="/automation", tags=["automation"])


class AuditLogCreate(BaseModel):
    workflow_name: str = Field(..., description="Name of the n8n or CI workflow")
    execution_id: Optional[str] = Field(None, description="n8n Execution ID or CI Run ID")
    scan_id: Optional[int] = Field(None, description="Linked AgentGuard Scan ID")
    event_type: str = Field(..., description="Type of event (scan_triggered, pr_commented, alert_sent, etc.)")
    status: str = Field(default="success", description="Status of the automation step (success, failure, skipped)")
    payload: Optional[dict[str, Any]] = Field(None, description="Arbitrary event payload / parameters")


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    workflow_name: str
    execution_id: Optional[str]
    scan_id: Optional[int]
    event_type: str
    status: str
    payload: Optional[dict[str, Any]]
    created_at: datetime.datetime


class PRCheckCreate(BaseModel):
    repository_full_name: str = Field(..., description="Target repository e.g. owner/repo")
    pr_number: int = Field(..., description="Pull Request number")
    commit_sha: Optional[str] = Field(None, description="Commit SHA analyzed")
    scan_id: Optional[int] = Field(None, description="Associated Scan ID")
    decision: str = Field(default="ALLOW", description="Gateway decision (ALLOW, BLOCK, REQUIRE_APPROVAL)")
    critical_count: int = Field(default=0, ge=0)
    high_count: int = Field(default=0, ge=0)
    deterministic_count: int = Field(default=0, ge=0)
    ai_estimated_count: int = Field(default=0, ge=0)
    comment_url: Optional[str] = Field(None, description="URL of the posted PR comment")


class PRCheckResponse(BaseModel):
    id: int
    user_id: int
    repository_full_name: str
    pr_number: int
    commit_sha: Optional[str]
    scan_id: Optional[int]
    decision: str
    critical_count: int
    high_count: int
    deterministic_count: int
    ai_estimated_count: int
    comment_url: Optional[str]
    created_at: datetime.datetime


class AutomationMetricsResponse(BaseModel):
    total_automated_events: int
    total_pr_checks: int
    prs_blocked: int
    prs_allowed: int
    total_critical_detected: int
    total_high_detected: int
    last_automation_at: Optional[datetime.datetime]


@router.post("/audit", response_model=AuditLogResponse, status_code=status.HTTP_201_CREATED)
async def record_audit_log(
    payload: AuditLogCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditLogResponse:
    """Record an audit log entry for an automation workflow execution."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    # Verify scan exists if provided
    if payload.scan_id:
        scan_res = await db.execute(select(Scan).where(Scan.id == payload.scan_id))
        if not scan_res.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked scan not found.")

    log_entry = AutomationAuditLog(
        user_id=current_user.id,
        workflow_name=payload.workflow_name,
        execution_id=payload.execution_id,
        scan_id=payload.scan_id,
        event_type=payload.event_type,
        status=payload.status,
        payload=payload.payload,
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)

    return AuditLogResponse(
        id=log_entry.id,
        user_id=log_entry.user_id,
        workflow_name=log_entry.workflow_name,
        execution_id=log_entry.execution_id,
        scan_id=log_entry.scan_id,
        event_type=log_entry.event_type,
        status=log_entry.status,
        payload=log_entry.payload,
        created_at=log_entry.created_at,
    )


@router.get("/audit", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditLogResponse]:
    """Retrieve automation audit history for current user."""
    stmt = (
        select(AutomationAuditLog)
        .where(AutomationAuditLog.user_id == current_user.id)
        .order_by(AutomationAuditLog.created_at.desc())
        .limit(limit)
    )
    if event_type:
        stmt = stmt.where(AutomationAuditLog.event_type == event_type)

    res = await db.execute(stmt)
    entries = res.scalars().all()
    return [
        AuditLogResponse(
            id=e.id,
            user_id=e.user_id,
            workflow_name=e.workflow_name,
            execution_id=e.execution_id,
            scan_id=e.scan_id,
            event_type=e.event_type,
            status=e.status,
            payload=e.payload,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.post("/pr-checks", response_model=PRCheckResponse, status_code=status.HTTP_201_CREATED)
async def record_pr_check(
    payload: PRCheckCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PRCheckResponse:
    """Record an automated pull request security evaluation."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    pr_entry = AutomationPRCheck(
        user_id=current_user.id,
        repository_full_name=payload.repository_full_name,
        pr_number=payload.pr_number,
        commit_sha=payload.commit_sha,
        scan_id=payload.scan_id,
        decision=payload.decision.upper(),
        critical_count=payload.critical_count,
        high_count=payload.high_count,
        deterministic_count=payload.deterministic_count,
        ai_estimated_count=payload.ai_estimated_count,
        comment_url=payload.comment_url,
    )
    db.add(pr_entry)
    await db.commit()
    await db.refresh(pr_entry)

    return PRCheckResponse(
        id=pr_entry.id,
        user_id=pr_entry.user_id,
        repository_full_name=pr_entry.repository_full_name,
        pr_number=pr_entry.pr_number,
        commit_sha=pr_entry.commit_sha,
        scan_id=pr_entry.scan_id,
        decision=pr_entry.decision,
        critical_count=pr_entry.critical_count,
        high_count=pr_entry.high_count,
        deterministic_count=pr_entry.deterministic_count,
        ai_estimated_count=pr_entry.ai_estimated_count,
        comment_url=pr_entry.comment_url,
        created_at=pr_entry.created_at,
    )


@router.get("/metrics", response_model=AutomationMetricsResponse)
async def get_automation_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutomationMetricsResponse:
    """Aggregate automation metrics across audit logs and PR checks."""
    # Count audit logs
    count_audit = await db.scalar(
        select(func.count(AutomationAuditLog.id)).where(AutomationAuditLog.user_id == current_user.id)
    )

    # Count PR checks
    count_prs = await db.scalar(
        select(func.count(AutomationPRCheck.id)).where(AutomationPRCheck.user_id == current_user.id)
    )

    # Count blocked vs allowed
    blocked = await db.scalar(
        select(func.count(AutomationPRCheck.id)).where(
            AutomationPRCheck.user_id == current_user.id,
            AutomationPRCheck.decision == "BLOCK",
        )
    )
    allowed = await db.scalar(
        select(func.count(AutomationPRCheck.id)).where(
            AutomationPRCheck.user_id == current_user.id,
            AutomationPRCheck.decision == "ALLOW",
        )
    )

    # Sum critical and high detected in automated PR checks
    sum_crit = await db.scalar(
        select(func.sum(AutomationPRCheck.critical_count)).where(AutomationPRCheck.user_id == current_user.id)
    )
    sum_high = await db.scalar(
        select(func.sum(AutomationPRCheck.high_count)).where(AutomationPRCheck.user_id == current_user.id)
    )

    # Last automation timestamp
    last_audit = await db.scalar(
        select(func.max(AutomationAuditLog.created_at)).where(AutomationAuditLog.user_id == current_user.id)
    )

    return AutomationMetricsResponse(
        total_automated_events=count_audit or 0,
        total_pr_checks=count_prs or 0,
        prs_blocked=blocked or 0,
        prs_allowed=allowed or 0,
        total_critical_detected=int(sum_crit or 0),
        total_high_detected=int(sum_high or 0),
        last_automation_at=last_audit,
    )
