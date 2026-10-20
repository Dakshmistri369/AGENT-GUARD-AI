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
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_current_user, get_db
from app.models.finding import Finding
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
                    timeout_seconds=settings.scan_timeout_seconds,
                )
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
                column_number=rf.get("column_number"),
                commit_sha=rf.get("commit_sha") or scan.commit_sha,
                sanitized_evidence=rf.get("sanitized_evidence"),
                explanation=rf.get("explanation"),
                remediation=rf.get("remediation"),
                verification_status=rf.get("verification_status", "unverified"),
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

    # Get repository
    stmt_repo = select(Repository).where(Repository.id == scan.repository_id)
    res_repo = await db.execute(stmt_repo)
    repo = res_repo.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated repository not found.")

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

