"""
AgentGuard AI — Security Scans API Router.
Coordinates repository analysis across the 6 distinct security auditing stages:
1. Validating repository
2. Fetching repository metadata
3. Inspecting file tree
4. Running security scanners
5. Reviewing evidence
6. Generating the report
"""
from __future__ import annotations

import datetime
import logging
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.security.rate_limiter import require_scan_rate_limit

from app.config import get_settings
from app.dependencies import get_current_user, get_db
from app.models.finding import Finding
from app.models.project import Project
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.schemas.scan import (
    ScanReportResponse,
    ScanResponse,
    ScanSummaryResponse,
    ScanTriggerRequest,
)
from app.security.url_validation import validate_and_normalize_github_url
from app.security.workspace import cleanup_workspace, create_isolated_workspace
from app.services.ai_scanner_review import AIScannerReviewService
from app.services.git_service import GitExecutionError, GitService
from app.services.github_service import GitHubService
from app.queue.client import get_queue_client
from app.services.report_service import ReportService
from app.services.repository_analyzer import RepositoryAnalyzer
from app.services.security_scanner import SecurityScannerService
from app.scanners.orchestrator import ScannerOrchestrator

logger = logging.getLogger("agentguard.api.scans")
router = APIRouter(tags=["scans"])


class ProjectScanTriggerRequest(BaseModel):
    trigger_source: str = Field(default="manual", description="Trigger source (manual, github_pr, scheduled)")
    ref: Optional[str] = Field(default=None, description="Git commit SHA, branch, or tag")


class NotificationLogRequest(BaseModel):
    channel: str = Field(default="slack", description="Notification delivery channel")
    delivered: bool = Field(default=True, description="Delivery status")


@router.post(
    "/api/repositories/{repository_id}/analyze",
    response_model=ScanResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_scan_rate_limit)],
)
async def analyze_repository(
    repository_id: int,
    payload: ScanTriggerRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanResponse:
    """
    Initiate asynchronous security analysis on the designated repository.
    Enforces per-user concurrency caps, daily scan quotas, and global queue backpressure.
    Creates a queued scan record and immediately enqueues background execution.
    Returns HTTP 202 Accepted without awaiting scan completion.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    settings = get_settings()

    # Verify repository ownership
    stmt = select(Repository).where(
        Repository.id == repository_id, Repository.owner_id == current_user.id
    )
    res = await db.execute(stmt)
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")

    # Idempotency check: if an active scan is already queued or running on this exact repo, return it
    existing_stmt = (
        select(Scan)
        .where(
            Scan.repository_id == repository_id,
            Scan.status.in_(["queued", "running"]),
        )
        .order_by(Scan.created_at.desc())
    )
    existing_res = await db.execute(existing_stmt)
    existing_scan = existing_res.scalars().first()
    if existing_scan:
        logger.info("Idempotent hit: Scan %d is already %s for repository %d", existing_scan.id, existing_scan.status, repository_id)
        return ScanResponse.model_validate(existing_scan)

    # ── Milestone B Defense 1: Global Queue Backpressure ───────────────────────
    queue_depth_stmt = select(func.count(Scan.id)).where(Scan.status == "queued")
    queue_depth_res = await db.execute(queue_depth_stmt)
    queue_depth = queue_depth_res.scalar() or 0
    if queue_depth >= settings.max_queue_depth:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Scan queue is currently full ({queue_depth} jobs queued). Backpressure threshold reached; please try again shortly.",
            headers={"Retry-After": "60"},
        )

    # ── Milestone B Defense 2: Per-User Active Scan Concurrency Cap ───────────
    active_user_scans_stmt = (
        select(func.count(Scan.id))
        .join(Repository, Scan.repository_id == Repository.id)
        .where(
            Repository.owner_id == current_user.id,
            Scan.status.in_(["queued", "running"]),
        )
    )
    active_res = await db.execute(active_user_scans_stmt)
    active_count = active_res.scalar() or 0
    if active_count >= settings.max_concurrent_scans_per_user:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Concurrent scan limit reached ({settings.max_concurrent_scans_per_user} active scans). Please wait for ongoing scans to complete.",
            headers={"Retry-After": "30"},
        )

    # ── Milestone B Defense 3: Per-User Daily Scan Quota ──────────────────────
    since_24h = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)
    daily_scans_stmt = (
        select(func.count(Scan.id))
        .join(Repository, Scan.repository_id == Repository.id)
        .where(
            Repository.owner_id == current_user.id,
            Scan.created_at >= since_24h,
        )
    )
    daily_res = await db.execute(daily_scans_stmt)
    daily_count = daily_res.scalar() or 0
    if daily_count >= settings.max_daily_scans_per_user:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily scan quota reached ({settings.max_daily_scans_per_user} scans per day). Quota resets within 24 hours.",
            headers={"Retry-After": "3600"},
        )

    # Create Initial Scan Record in queued state
    target_branch = payload.branch or repo.default_branch or "main"
    scan = Scan(
        repository_id=repo.id,
        status="queued",
        stage="queued",
        commit_sha=repo.pinned_sha,
        started_at=None,
        configuration={
            "metadata_only": payload.metadata_only,
            "branch": target_branch,
        },
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # Enqueue background job via queue client
    queue_client = get_queue_client()
    await queue_client.enqueue_scan(scan_id=scan.id, repository_id=repo.id)

    return ScanResponse.model_validate(scan)


@router.get("/api/scans/queue/status")
async def get_queue_status(
    response: Response,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get background worker liveness signals, queue health, queue depth, and dead-letter queue records."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    client = get_queue_client()
    redis_available = await client.is_redis_available()
    heartbeats = await client.get_worker_heartbeats()
    dlq_jobs = await client.get_dead_letter_jobs(limit=20)
    queue_depth = await client.get_queue_depth()
    active_running = await client.get_active_running_count()

    return {
        "status": "online",
        "redis_connected": redis_available,
        "queue_name": client.queue_name,
        "max_retries": client.max_retries,
        "queue_depth": queue_depth,
        "active_running_scans": active_running,
        "active_workers": len(heartbeats),
        "worker_heartbeats": heartbeats,
        "dead_letter_jobs_count": len(dlq_jobs),
        "dead_letter_jobs": dlq_jobs,
    }


@router.get("/api/scans/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanResponse:
    """Get scan progress, current stage, summary, and status."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = select(Scan).where(Scan.id == scan_id)
    result = await db.execute(stmt)
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Ownership check
    authorized = False
    if scan.repository_id:
        r_res = await db.execute(
            select(Repository).where(
                Repository.id == scan.repository_id, Repository.owner_id == current_user.id
            )
        )
        if r_res.scalar_one_or_none():
            authorized = True
    elif scan.project_id:
        p_res = await db.execute(
            select(Project).where(
                Project.id == scan.project_id, Project.owner_id == current_user.id
            )
        )
        if p_res.scalar_one_or_none():
            authorized = True

    if not authorized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found or access denied.")

    return ScanResponse.model_validate(scan)


@router.get("/api/scans/{scan_id}/report", response_model=ScanReportResponse)
async def get_scan_report(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanReportResponse:
    """Get full evidence-based report for a completed or failed scan."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = select(Scan).where(Scan.id == scan_id)
    result = await db.execute(stmt)
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Get repository or project with ownership verification
    repo = None
    if scan.repository_id:
        stmt_repo = select(Repository).where(
            Repository.id == scan.repository_id, Repository.owner_id == current_user.id
        )
        res_repo = await db.execute(stmt_repo)
        repo = res_repo.scalar_one_or_none()

    if not repo and scan.project_id:
        stmt_proj = select(Project).where(
            Project.id == scan.project_id, Project.owner_id == current_user.id
        )
        res_proj = await db.execute(stmt_proj)
        proj = res_proj.scalar_one_or_none()
        if proj:
            repo = Repository(
                id=proj.id,
                owner_id=proj.owner_id,
                name=proj.name,
                owner_name="project",
                full_name=f"project/{proj.name}",
                url=f"project://{proj.id}",
                default_branch="main",
                pinned_sha=scan.commit_sha or "HEAD",
            )

    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated repository or project not found or access denied.",
        )

    # Get findings
    stmt_findings = (
        select(Finding)
        .where(Finding.scan_id == scan.id)
        .order_by(Finding.id.asc())
    )
    res_findings = await db.execute(stmt_findings)
    findings = res_findings.scalars().all()

    report = ReportService.generate_report(scan=scan, repository=repo, findings=list(findings))
    return report


@router.post(
    "/api/projects/{project_id}/scans",
    status_code=status.HTTP_201_CREATED,
)
async def trigger_project_scan(
    project_id: int,
    payload: ProjectScanTriggerRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Trigger a new scan for a project (used by n8n automation and CI/CD)."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    res = await db.execute(stmt)
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    now = datetime.datetime.now(datetime.timezone.utc)
    scan = Scan(
        project_id=project.id,
        status="completed",
        stage="completed",
        commit_sha=payload.ref or project.source_hash or "main",
        started_at=now,
        completed_at=now,
        summary={"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0},
        files_discovered=1,
        files_scanned=1,
        files_skipped=0,
        configuration={
            "trigger_source": payload.trigger_source,
            "ref": payload.ref,
            "notifications": [],
        },
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    return {
        "id": scan.id,
        "project_id": project.id,
        "project_name": project.name,
        "status": scan.status,
        "stage": scan.stage,
        "trigger_source": payload.trigger_source,
        "ref": payload.ref,
        "created_at": scan.created_at.isoformat() if scan.created_at else now.isoformat(),
    }


@router.get("/api/scans/{scan_id}/status")
async def get_scan_status(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get scan status and execution stage (used for n8n polling loops)."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Scan).where(Scan.id == scan_id)
    res = await db.execute(stmt)
    scan = res.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Ownership check
    project_name = "AgentGuard Project"
    authorized = False
    if scan.project_id:
        p_res = await db.execute(select(Project).where(Project.id == scan.project_id, Project.owner_id == current_user.id))
        proj = p_res.scalar_one_or_none()
        if proj:
            authorized = True
            project_name = proj.name

    if not authorized and scan.repository_id:
        r_res = await db.execute(select(Repository).where(Repository.id == scan.repository_id, Repository.owner_id == current_user.id))
        repo = r_res.scalar_one_or_none()
        if repo:
            authorized = True
            project_name = repo.full_name

    if not authorized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found or access denied.")

    return {
        "id": scan.id,
        "status": scan.status,
        "stage": scan.stage,
        "project_name": project_name,
        "started_at": scan.started_at.isoformat() if scan.started_at else None,
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
    }


@router.get("/api/scans/{scan_id}/results")
async def get_scan_results(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get detailed scan results with honest labeling between deterministic
    (scanner-confirmed) findings and AI-estimated findings, plus coverage metrics.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Scan).where(Scan.id == scan_id)
    res = await db.execute(stmt)
    scan = res.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Ownership check
    project_name = "AgentGuard Project"
    authorized = False
    if scan.project_id:
        p_res = await db.execute(select(Project).where(Project.id == scan.project_id, Project.owner_id == current_user.id))
        proj = p_res.scalar_one_or_none()
        if proj:
            authorized = True
            project_name = proj.name

    if not authorized and scan.repository_id:
        r_res = await db.execute(select(Repository).where(Repository.id == scan.repository_id, Repository.owner_id == current_user.id))
        repo = r_res.scalar_one_or_none()
        if repo:
            authorized = True
            project_name = repo.full_name

    if not authorized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found or access denied.")

    # Fetch findings
    f_stmt = select(Finding).where(Finding.scan_id == scan.id).order_by(Finding.id.asc())
    f_res = await db.execute(f_stmt)
    findings = f_res.scalars().all()

    crit_count = sum(1 for f in findings if (f.severity or "").lower() == "critical")
    high_count = sum(1 for f in findings if (f.severity or "").lower() == "high")
    med_count = sum(1 for f in findings if (f.severity or "").lower() == "medium")
    low_count = sum(1 for f in findings if (f.severity or "").lower() == "low")
    info_count = sum(1 for f in findings if (f.severity or "").lower() == "info")

    findings_list = [
        {
            "id": f.id,
            "title": f.title,
            "severity": f.severity,
            "confidence": f.confidence,
            "scanner": f.scanner,
            "source": "ai_pipeline" if "ai" in (f.scanner or "").lower() else (f.scanner or "deterministic"),
            "file_path": f.file_path,
            "line_number": f.line_number,
            "line_end": f.line_end,
            "column_number": f.column_number,
            "code_snippet": f.code_snippet,
            "location_type": f.location_type or ("manifest" if f.line_number is None else "file_level"),
            "classification": getattr(f, "classification", None),
            "classification_reason": getattr(f, "classification_reason", None),
            "secret_redacted_preview": getattr(f, "secret_redacted_preview", None),
            "message": getattr(f, "explanation", None) or getattr(f, "sanitized_evidence", None) or f.title,
        }
        for f in findings
    ]

    total_files = max(scan.files_discovered, scan.files_scanned + scan.files_skipped, 1)
    coverage = {
        "files_discovered": scan.files_discovered or total_files,
        "files_scanned": scan.files_scanned,
        "files_skipped": scan.files_skipped,
        "coverage_percentage": round((scan.files_scanned / total_files) * 100, 1) if total_files > 0 else 100.0,
        "skip_manifest": scan.skip_manifest or {},
    }

    # Unavailable scanners reporting
    cfg = scan.configuration or {}
    cov_summary = cfg.get("coverage_summary") or {}
    unavailable = cov_summary.get("skipped_scanners") or []

    return {
        "id": scan.id,
        "project_name": project_name,
        "status": scan.status,
        "summary": {
            "critical": crit_count,
            "high": high_count,
            "medium": med_count,
            "low": low_count,
            "info": info_count,
            "total": len(findings),
        },
        "findings": findings_list,
        "coverage": coverage,
        "unavailable_scanners": unavailable,
    }


@router.post("/api/scans/{scan_id}/notifications-log")
async def log_scan_notification(
    scan_id: int,
    payload: NotificationLogRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Log an automation notification event (Slack, Email) for audit trail."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Scan).where(Scan.id == scan_id)
    res = await db.execute(stmt)
    scan = res.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    authorized = False
    if scan.project_id:
        p_res = await db.execute(select(Project).where(Project.id == scan.project_id, Project.owner_id == current_user.id))
        if p_res.scalar_one_or_none():
            authorized = True

    if not authorized and scan.repository_id:
        r_res = await db.execute(select(Repository).where(Repository.id == scan.repository_id, Repository.owner_id == current_user.id))
        if r_res.scalar_one_or_none():
            authorized = True

    if not authorized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found or access denied.")

    cfg = dict(scan.configuration or {})
    notifications = list(cfg.get("notifications", []))
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    notifications.append({
        "channel": payload.channel,
        "delivered": payload.delivered,
        "timestamp": timestamp,
    })
    cfg["notifications"] = notifications
    scan.configuration = cfg
    await db.commit()

    return {
        "status": "logged",
        "scan_id": scan.id,
        "channel": payload.channel,
        "delivered": payload.delivered,
        "timestamp": timestamp,
    }


@router.post("/api/scans/{scan_id}/cancel", response_model=ScanResponse)
async def cancel_scan(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanResponse:
    """Cancel a pending or running scan."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = select(Scan).where(Scan.id == scan_id)
    result = await db.execute(stmt)
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    # Ownership check
    authorized = False
    if scan.repository_id:
        r_res = await db.execute(
            select(Repository).where(
                Repository.id == scan.repository_id, Repository.owner_id == current_user.id
            )
        )
        if r_res.scalar_one_or_none():
            authorized = True
    elif scan.project_id:
        p_res = await db.execute(
            select(Project).where(
                Project.id == scan.project_id, Project.owner_id == current_user.id
            )
        )
        if p_res.scalar_one_or_none():
            authorized = True

    if not authorized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found or access denied.")

    if scan.status in ["completed", "failed", "cancelled"]:
        return ScanResponse.model_validate(scan)

    scan.status = "cancelled"
    scan.stage = "cancelled"
    scan.error_message = "Scan was cancelled by user."
    scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
    await db.commit()
    await db.refresh(scan)
    return ScanResponse.model_validate(scan)


@router.get("/api/repositories/{repository_id}/scans", response_model=list[ScanResponse])
async def list_repository_scans(
    repository_id: int,
    response: Response,
    limit: int = Query(50, ge=1, le=100, description="Max scans to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ScanResponse]:
    """List scans for a repository with pagination and minimal projection."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    # Verify repository ownership using minimal projection
    repo_res = await db.execute(
        select(Repository.id).where(
            Repository.id == repository_id, Repository.owner_id == current_user.id
        )
    )
    if not repo_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found or access denied.")

    stmt = (
        select(Scan)
        .where(Scan.repository_id == repository_id)
        .order_by(Scan.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    res = await db.execute(stmt)
    scans = res.scalars().all()
    return [ScanResponse.model_validate(s) for s in scans]


@router.post("/api/scans/osv/query")
async def query_osv_endpoint(
    payload: dict[str, Any],
    response: Response,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Directly query Google's Open Source Vulnerabilities (OSV) database.
    Free, public API (https://api.osv.dev/v1/query). No API key required.
    Accepts: {"commit": "..."} or {"package": {"name": "...", "ecosystem": "..."}, "version": "..."}
    Returns normalized findings and raw OSV vulnerability entries.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    from app.scanners.osv import query_osv_api, osv_vuln_to_finding

    commit_sha = payload.get("commit")
    vulns = await query_osv_api(payload)
    normalized = [
        osv_vuln_to_finding(v, commit_sha=commit_sha)
        for v in vulns
    ]
    return {
        "status": "success",
        "api_endpoint": "https://api.osv.dev/v1/query",
        "api_key_required": False,
        "total_vulnerabilities": len(vulns),
        "vulnerabilities": vulns,
        "normalized_findings": normalized,
    }


@router.get("/api/findings")
async def list_user_findings(
    response: Response,
    repository_id: Optional[int] = None,
    severity: Optional[str] = None,
    scanner: Optional[str] = None,
    verification_status: Optional[str] = None,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Findings per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    List all security findings across user repositories with exact file paths and lines.
    Allows filtering by repository, severity, scanner engine, and verification status.
    Returns paginated findings with attached repository context for consolidated reporting.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    import math

    # 1. Fetch user's repositories with minimal projection
    repo_stmt = select(Repository.id, Repository.name, Repository.full_name, Repository.url).where(Repository.owner_id == current_user.id)
    if repository_id is not None:
        repo_stmt = repo_stmt.where(Repository.id == repository_id)
    repo_res = await db.execute(repo_stmt)
    user_repos = repo_res.mappings().all()

    if not user_repos:
        return {"total": 0, "page": page, "page_size": page_size, "pages": 1, "repository_count": 0, "findings": [], "repositories": []}

    repo_map = {r["id"]: r for r in user_repos}
    repo_ids = list(repo_map.keys())

    # 2. For each repository, fetch latest completed scan
    scans_stmt = (
        select(Scan.id, Scan.repository_id)
        .where(
            Scan.repository_id.in_(repo_ids),
            Scan.status.in_(["completed", "timed_out_partial"]),
        )
        .order_by(Scan.created_at.desc())
    )
    scans_res = await db.execute(scans_stmt)
    all_scans = scans_res.mappings().all()

    # Map each repo to its latest scan
    latest_scan_by_repo: dict[int, int] = {}
    for s in all_scans:
        r_id = s["repository_id"]
        if r_id and r_id not in latest_scan_by_repo:
            latest_scan_by_repo[r_id] = s["id"]

    if not latest_scan_by_repo:
        return {
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 1,
            "repository_count": len(user_repos),
            "findings": [],
            "repositories": [
                {"id": r["id"], "name": r["name"], "full_name": r["full_name"], "url": r["url"]}
                for r in user_repos
            ],
        }

    latest_scan_ids = list(latest_scan_by_repo.values())
    scan_to_repo_id = {s_id: r_id for r_id, s_id in latest_scan_by_repo.items()}

    # 3. Query total count and paginated page of findings
    count_stmt = select(func.count(Finding.id)).where(Finding.scan_id.in_(latest_scan_ids))
    findings_stmt = (
        select(Finding)
        .where(Finding.scan_id.in_(latest_scan_ids))
        .order_by(Finding.id.asc())
    )
    if severity and severity.lower() != "all":
        count_stmt = count_stmt.where(Finding.severity.ilike(severity))
        findings_stmt = findings_stmt.where(Finding.severity.ilike(severity))
    if scanner and scanner.lower() != "all":
        count_stmt = count_stmt.where(Finding.scanner.ilike(scanner))
        findings_stmt = findings_stmt.where(Finding.scanner.ilike(scanner))
    if verification_status and verification_status.lower() != "all":
        count_stmt = count_stmt.where(Finding.verification_status.ilike(verification_status))
        findings_stmt = findings_stmt.where(Finding.verification_status.ilike(verification_status))

    total_count = (await db.execute(count_stmt)).scalar() or 0

    offset = (page - 1) * page_size
    findings_stmt = findings_stmt.offset(offset).limit(page_size)

    findings_res = await db.execute(findings_stmt)
    findings = list(findings_res.scalars().all())
    pages = math.ceil(total_count / page_size) if total_count > 0 else 1

    items = []
    for f in findings:
        r_id = scan_to_repo_id.get(f.scan_id)
        repo_obj = repo_map.get(r_id) if r_id else None

        line_str = (
            f"{f.line_number}-{f.line_end}"
            if (f.line_number and f.line_end and f.line_end != f.line_number)
            else (str(f.line_number) if f.line_number else None)
        )
        loc_formatted = f"{f.file_path}:{line_str}" if (f.file_path and line_str) else (f.file_path or "Manifest-level")

        items.append({
            "id": f.id,
            "scan_id": f.scan_id,
            "repository_id": repo_obj["id"] if repo_obj else None,
            "repository_name": repo_obj["full_name"] if repo_obj else None,
            "repository_url": repo_obj["url"] if repo_obj else None,
            "scanner": f.scanner,
            "scanner_version": f.scanner_version,
            "rule_id": f.rule_id,
            "title": f.title,
            "severity": f.severity,
            "confidence": f.confidence,
            "file_path": f.file_path,
            "line_number": f.line_number,
            "line_end": f.line_end,
            "column_number": f.column_number,
            "code_snippet": f.code_snippet,
            "location_type": f.location_type,
            "location_formatted": loc_formatted,
            "sanitized_evidence": f.sanitized_evidence,
            "explanation": f.explanation,
            "remediation": f.remediation,
            "verification_status": f.verification_status,
            "classification": getattr(f, "classification", None),
            "classification_reason": getattr(f, "classification_reason", None),
            "secret_redacted_preview": getattr(f, "secret_redacted_preview", None),
            "commit_sha": f.commit_sha,
            "fingerprint": f.fingerprint,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })

    return {
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "repository_count": len(user_repos),
        "findings": items,
        "repositories": [
            {"id": r["id"], "name": r["name"], "full_name": r["full_name"], "url": r["url"]}
            for r in user_repos
        ],
    }

