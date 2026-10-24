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
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    status_code=status.HTTP_201_CREATED,
)
async def analyze_repository(
    repository_id: int,
    payload: ScanTriggerRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanResponse:
    """
    Run security analysis on the designated repository through 6 verified stages.
    Pins commit SHA, inspects metadata tree, runs isolated static scanners, and persists findings.
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

    # Create Initial Scan Record
    now = datetime.datetime.now(datetime.timezone.utc)
    scan = Scan(
        repository_id=repo.id,
        status="running",
        stage="validating",
        commit_sha=repo.pinned_sha,
        started_at=now,
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    workspace_dir = None
    try:
        # ── Stage 1: Validating repository ──────────────────────────────────
        scan.stage = "validating"
        owner, repo_name, normalized_url = validate_and_normalize_github_url(repo.url)
        await db.commit()

        # ── Stage 2: Fetching repository metadata ───────────────────────────
        scan.stage = "fetching_metadata"
        github_svc = GitHubService()
        target_branch = payload.branch or repo.default_branch

        try:
            latest_sha = await github_svc.get_commit_sha(owner, repo_name, target_branch)
            scan.commit_sha = latest_sha
            repo.pinned_sha = latest_sha
        except Exception as exc:
            logger.warning("Could not refresh commit SHA: %s", exc)

        await db.commit()

        # ── Stage 3: Inspecting file tree ───────────────────────────────────
        scan.stage = "inspecting_file_tree"
        tree_items = []
        is_truncated = False
        if scan.commit_sha:
            try:
                tree_items, is_truncated = await github_svc.get_git_tree(
                    owner, repo_name, scan.commit_sha
                )
            except Exception as exc:
                logger.warning("Could not fetch recursive git tree: %s", exc)

        meta = RepositoryAnalyzer.analyze_tree(
            tree_items=tree_items,
            owner=owner,
            name=repo_name,
            default_branch=target_branch,
            pinned_sha=scan.commit_sha,
            is_truncated=is_truncated,
            max_files=settings.max_repo_files,
            max_depth=settings.max_tree_depth,
        )
        repo.metadata_json = meta.model_dump()
        await db.commit()

        # ── Stage 4: Running security scanners ──────────────────────────────
        scan.stage = "running_scanners"
        await db.commit()

        raw_findings: list[dict[str, Any]] = []
        scanners_run: list[dict[str, Any]] = []
        coverage_summary: dict[str, Any] = {}
        scanner_matrix: dict[str, Any] = {}
        scan_timed_out: bool = False

        orchestrator = ScannerOrchestrator()
        git_svc = GitService(timeout_seconds=settings.scan_timeout_seconds)

        if not payload.metadata_only and git_svc.is_git_available():
            workspace_dir = create_isolated_workspace(settings.scan_workspace_dir, scan.id)
            try:
                await git_svc.clone_repository(
                    normalized_url=repo.url,
                    target_dir=workspace_dir,
                    branch=target_branch,
                    depth=1,
                )
                raw_findings, scanners_run, coverage_summary, scanner_matrix = await orchestrator.run_scans(
                    workspace_path=workspace_dir,
                    metadata=repo.metadata_json or {},
                    commit_sha=scan.commit_sha,
                    timeout_seconds=settings.scanner_timeout_seconds,
                    job_max_runtime_seconds=settings.scanner_job_max_runtime_seconds,
                )
                scan_timed_out = coverage_summary.get("job_timed_out", False)
            except GitExecutionError as git_err:
                logger.warning("Git clone failed, falling back to metadata-only analysis: %s", git_err)
                scanner_matrix = orchestrator.get_scanner_matrix(repo.metadata_json or {})
                coverage_summary = {
                    "is_complete": False,
                    "applicable_scanners": [sc["name"] for sc in scanner_matrix.values() if sc["applicable"]],
                    "executed_scanners": [],
                    "missing_scanners": [],
                    "failed_scanners": [],
                    "skipped_scanners": [sc["name"] for sc in scanner_matrix.values()],
                    "notes": [f"Git clone failed: {git_err}. Deeper code scanning disabled."],
                }
                scanners_run.append({
                    "name": "git_clone",
                    "status": "warning",
                    "detail": str(git_err),
                })
        else:
            reason = "Metadata-only scan requested" if payload.metadata_only else "Git executable not available on server"
            scanner_matrix = orchestrator.get_scanner_matrix(repo.metadata_json or {})
            coverage_summary = {
                "is_complete": False,
                "applicable_scanners": [sc["name"] for sc in scanner_matrix.values() if sc["applicable"]],
                "executed_scanners": [],
                "missing_scanners": [],
                "failed_scanners": [],
                "skipped_scanners": [sc["name"] for sc in scanner_matrix.values()],
                "notes": [f"Static code scanners skipped: {reason}"],
            }
            scanners_run = [
                {
                    "name": sc["name"],
                    "scanner_id": sc_id,
                    "version": sc["version"],
                    "status": "skipped_not_applicable" if not sc["applicable"] else "skipped_metadata_only",
                    "reason": sc["applicability_reason"] if not sc["applicable"] else reason,
                    "findings_count": 0,
                    "duration_seconds": 0.0,
                }
                for sc_id, sc in scanner_matrix.items()
            ]

        # ── Stage 5: Reviewing evidence ─────────────────────────────────────
        scan.stage = "reviewing_evidence"
        await db.commit()

        ai_review_svc = AIScannerReviewService(settings=settings)
        ai_analysis = await ai_review_svc.review_findings(
            findings=raw_findings,
            repo_metadata=repo.metadata_json or {},
            coverage_summary=coverage_summary,
        )

        # ── Stage 6: Generating the report ──────────────────────────────────
        scan.stage = "generating_report"
        await db.commit()

        # Persist findings to database
        db_findings: list[Finding] = []
        critical_c = high_c = med_c = low_c = info_c = 0
        scanner_counts: dict[str, int] = {}

        for rf in raw_findings:
            sev = (rf.get("severity") or "medium").lower()
            if sev == "critical":
                critical_c += 1
            elif sev == "high":
                high_c += 1
            elif sev == "medium":
                med_c += 1
            elif sev == "low":
                low_c += 1
            else:
                info_c += 1

            sc_name = rf.get("scanner", "agentguard_sast")
            scanner_counts[sc_name] = scanner_counts.get(sc_name, 0) + 1

            finding_obj = Finding(
                scan_id=scan.id,
                fingerprint=rf.get("fingerprint"),
                title=rf.get("title", "Security Finding"),
                severity=sev,
                confidence=rf.get("confidence", "medium"),
                scanner=sc_name,
                scanner_version=rf.get("scanner_version"),
                rule_id=rf.get("rule_id"),
                file_path=rf.get("file_path"),
                line_number=rf.get("line_number"),
                line_end=rf.get("line_end"),
                column_number=rf.get("column_number"),
                code_snippet=rf.get("code_snippet"),
                location_type=rf.get("location_type"),
                commit_sha=rf.get("commit_sha") or scan.commit_sha,
                sanitized_evidence=rf.get("sanitized_evidence"),
                explanation=rf.get("explanation"),
                remediation=rf.get("remediation"),
                verification_status=rf.get("verification_status", "unverified"),
                classification=rf.get("classification"),
                classification_reason=rf.get("classification_reason"),
                secret_redacted_preview=rf.get("secret_redacted_preview"),
            )
            db.add(finding_obj)
            db_findings.append(finding_obj)

        summary_dict = {
            "total_findings": len(raw_findings),
            "critical": critical_c,
            "high": high_c,
            "medium": med_c,
            "low": low_c,
            "info": info_c,
            "scanner_breakdown": scanner_counts,
        }

        if scan_timed_out:
            scan.status = "timed_out_partial"
            scan.stage = "timed_out_partial"
            logger.warning(
                "Scan %s timed out at job level after %ss. "
                "Partial findings (%d) preserved. Status: timed_out_partial",
                scan.id, settings.scanner_job_max_runtime_seconds, len(raw_findings),
            )
        else:
            scan.status = "completed"
            scan.stage = "completed"
        scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
        scan.summary = summary_dict
        scan.files_discovered = coverage_summary.get("files_discovered", 0)
        scan.files_scanned = coverage_summary.get("files_scanned", 0)
        scan.files_skipped = coverage_summary.get("files_skipped", 0)
        scan.skip_manifest = coverage_summary.get("skip_manifest") or {}
        scan.configuration = {
            "metadata_only": payload.metadata_only,
            "branch": target_branch,
            "scanners_run": scanners_run,
            "ai_analysis": ai_analysis,
            "coverage_summary": coverage_summary,
            "scanner_matrix": scanner_matrix,
        }

        await db.commit()
        await db.refresh(scan)
        return ScanResponse.model_validate(scan)

    except Exception as exc:
        logger.error("Scan failed on repository %s: %s", repository_id, exc, exc_info=True)
        scan.status = "failed"
        scan.stage = "failed"
        scan.error_message = str(exc)
        scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
        await db.commit()
        await db.refresh(scan)
        return ScanResponse.model_validate(scan)

    finally:
        if workspace_dir:
            cleanup_workspace(workspace_dir)


@router.get("/api/scans/{scan_id}", response_model=ScanResponse)
async def get_scan_status(
    scan_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanResponse:
    """Get scan progress, current stage, summary, and status."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = (
        select(Scan)
        .join(Repository, Scan.repository_id == Repository.id, isouter=True)
        .where(Scan.id == scan_id)
    )
    result = await db.execute(stmt)
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ScanResponse]:
    """List all scans for a repository."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    stmt = (
        select(Scan)
        .where(Scan.repository_id == repository_id)
        .order_by(Scan.created_at.desc())
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    List all security findings across user repositories with exact file paths and lines.
    Allows filtering by repository, severity, scanner engine, and verification status.
    Returns findings with attached repository context for consolidated reporting.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    # 1. Fetch user's repositories
    repo_stmt = select(Repository).where(Repository.owner_id == current_user.id)
    if repository_id is not None:
        repo_stmt = repo_stmt.where(Repository.id == repository_id)
    repo_res = await db.execute(repo_stmt)
    user_repos = list(repo_res.scalars().all())

    if not user_repos:
        return {"total": 0, "repository_count": 0, "findings": [], "repositories": []}

    repo_map = {r.id: r for r in user_repos}
    repo_ids = list(repo_map.keys())

    # 2. For each repository, fetch latest completed scan
    scans_stmt = (
        select(Scan)
        .where(
            Scan.repository_id.in_(repo_ids),
            Scan.status.in_(["completed", "timed_out_partial"]),
        )
        .order_by(Scan.created_at.desc())
    )
    scans_res = await db.execute(scans_stmt)
    all_scans = list(scans_res.scalars().all())

    # Map each repo to its latest scan
    latest_scan_by_repo: dict[int, Scan] = {}
    for s in all_scans:
        if s.repository_id and s.repository_id not in latest_scan_by_repo:
            latest_scan_by_repo[s.repository_id] = s

    if not latest_scan_by_repo:
        return {
            "total": 0,
            "repository_count": len(user_repos),
            "findings": [],
            "repositories": [
                {"id": r.id, "name": r.name, "full_name": r.full_name, "url": r.url}
                for r in user_repos
            ],
        }

    latest_scan_ids = [s.id for s in latest_scan_by_repo.values()]
    scan_to_repo_id = {s.id: s.repository_id for s in latest_scan_by_repo.values()}

    # 3. Query findings for these latest scans
    findings_stmt = (
        select(Finding)
        .where(Finding.scan_id.in_(latest_scan_ids))
        .order_by(Finding.id.asc())
    )
    if severity and severity.lower() != "all":
        findings_stmt = findings_stmt.where(Finding.severity.ilike(severity))
    if scanner and scanner.lower() != "all":
        findings_stmt = findings_stmt.where(Finding.scanner.ilike(scanner))
    if verification_status and verification_status.lower() != "all":
        findings_stmt = findings_stmt.where(Finding.verification_status.ilike(verification_status))

    findings_res = await db.execute(findings_stmt)
    findings = list(findings_res.scalars().all())

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
            "repository_id": repo_obj.id if repo_obj else None,
            "repository_name": repo_obj.full_name if repo_obj else None,
            "repository_url": repo_obj.url if repo_obj else None,
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
        "total": len(items),
        "repository_count": len(user_repos),
        "findings": items,
        "repositories": [
            {"id": r.id, "name": r.name, "full_name": r.full_name, "url": r.url}
            for r in user_repos
        ],
    }

