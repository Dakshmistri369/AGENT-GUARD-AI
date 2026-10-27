"""
AgentGuard AI — Scan Execution Service.
Encapsulates the full 6-stage repository security analysis lifecycle:
1. Validating repository
2. Fetching metadata & commit SHA
3. Inspecting file tree
4. Running security scanners in isolated workspace
5. Reviewing evidence via AI
6. Generating report, persisting findings, and enforcing scan coverage rules.

Used by background workers (arq/Redis) and async queue runners.
"""
from __future__ import annotations

import datetime
import logging
import time
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import session as db_session_module
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.scanners.orchestrator import ScannerOrchestrator
from app.security.workspace import cleanup_workspace, create_isolated_workspace
from app.services.ai_scanner_review import AIScannerReviewService
from app.services.git_service import GitExecutionError, GitService
from app.services.github_service import GitHubService
from app.security.url_validation import validate_and_normalize_github_url
from app.services.repository_analyzer import RepositoryAnalyzer

logger = logging.getLogger("agentguard.services.scan_execution")


class ScanExecutionService:
    def __init__(self, settings=None):
        self.settings = settings or get_settings()

    async def execute_scan(self, scan_id: int) -> dict[str, Any]:
        """
        Execute full scan lifecycle for scan_id asynchronously.
        Manages DB updates, workspace lifecycle, stage transitions, and honest coverage reporting.
        """
        async with db_session_module.AsyncSessionLocal() as db:
            stmt = select(Scan).where(Scan.id == scan_id)
            res = await db.execute(stmt)
            scan = res.scalar_one_or_none()
            if not scan:
                raise ValueError(f"Scan with ID {scan_id} not found.")

            # If scan was cancelled while queued, abort immediately
            if scan.status == "cancelled":
                logger.info("Scan %d was cancelled before execution started; skipping.", scan_id)
                return {"scan_id": scan_id, "status": "cancelled"}

            # Transition to running
            now = datetime.datetime.now(datetime.timezone.utc)
            scan.status = "running"
            scan.stage = "validating"
            scan.started_at = now
            await db.commit()
            await db.refresh(scan)

            # Retrieve associated repository
            repo = None
            if scan.repository_id:
                repo_res = await db.execute(select(Repository).where(Repository.id == scan.repository_id))
                repo = repo_res.scalar_one_or_none()

            if not repo:
                scan.status = "failed"
                scan.stage = "failed"
                scan.error_message = "Associated repository record not found."
                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await db.commit()
                return {"scan_id": scan_id, "status": "failed", "error": scan.error_message}

            workspace_dir: Path | None = None
            scan_start_time = time.time()
            stage_timings: dict[str, float] = {}

            try:
                # ── Stage 1: Validating repository ──────────────────────────
                t_val = time.time()
                scan.stage = "validating"
                owner, repo_name, normalized_url = validate_and_normalize_github_url(repo.url)
                stage_timings["validating"] = round(time.time() - t_val, 3)
                await db.commit()

                # ── Stage 2: Fetching metadata ───────────────────────────────
                t_meta = time.time()
                scan.stage = "fetching_metadata"
                github_svc = GitHubService()
                cfg = scan.configuration or {}
                target_branch = cfg.get("branch") or repo.default_branch or "main"

                try:
                    latest_sha = await github_svc.get_commit_sha(owner, repo_name, target_branch)
                    scan.commit_sha = latest_sha
                    repo.pinned_sha = latest_sha
                except Exception as exc:
                    logger.warning("Could not refresh commit SHA: %s", exc)

                stage_timings["fetching_metadata"] = round(time.time() - t_meta, 3)
                await db.commit()

                # ── Stage 3: Inspecting file tree ───────────────────────────
                t_tree = time.time()
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
                    max_files=self.settings.max_repo_files,
                    max_depth=self.settings.max_tree_depth,
                )
                repo.metadata_json = meta.model_dump()
                stage_timings["inspecting_file_tree"] = round(time.time() - t_tree, 3)
                await db.commit()

                # Check if scan was cancelled while fetching metadata
                await db.refresh(scan)
                if scan.status == "cancelled":
                    logger.info("Scan %d was cancelled mid-flight; terminating.", scan_id)
                    return {"scan_id": scan_id, "status": "cancelled"}

                # ── Stage 4: Running security scanners ──────────────────────
                scan.stage = "running_scanners"
                await db.commit()

                raw_findings: list[dict[str, Any]] = []
                scanners_run: list[dict[str, Any]] = []
                coverage_summary: dict[str, Any] = {}
                scanner_matrix: dict[str, Any] = {}
                scan_timed_out: bool = False

                orchestrator = ScannerOrchestrator()
                git_svc = GitService(timeout_seconds=self.settings.git_clone_timeout_seconds)
                metadata_only = bool(cfg.get("metadata_only", False))

                # Milestone B: Pre-clone size cap defense
                repo_size_kb = (repo.metadata_json or {}).get("size_kb", 0)
                max_clone_kb = self.settings.max_repo_clone_size_mb * 1024
                if repo_size_kb > max_clone_kb:
                    size_mb = round(repo_size_kb / 1024, 1)
                    logger.warning("Repository %s (%s MB) exceeds max clone size (%s MB); skipping clone.", repo.full_name, size_mb, self.settings.max_repo_clone_size_mb)
                    metadata_only = True

                if not metadata_only and git_svc.is_git_available():
                    workspace_dir = create_isolated_workspace(self.settings.scan_workspace_dir, scan.id)
                    try:
                        t_clone = time.time()
                        await git_svc.clone_repository(
                            normalized_url=repo.url,
                            target_dir=workspace_dir,
                            branch=target_branch,
                            depth=1,
                        )
                        stage_timings["git_clone"] = round(time.time() - t_clone, 3)

                        t_scanners = time.time()
                        raw_findings, scanners_run, coverage_summary, scanner_matrix = await orchestrator.run_scans(
                            workspace_path=workspace_dir,
                            metadata=repo.metadata_json or {},
                            commit_sha=scan.commit_sha,
                            timeout_seconds=self.settings.scanner_timeout_seconds,
                            job_max_runtime_seconds=self.settings.scanner_job_max_runtime_seconds,
                        )
                        stage_timings["running_scanners"] = round(time.time() - t_scanners, 3)
                        scan_timed_out = coverage_summary.get("job_timed_out", False)
                    except GitExecutionError as git_err:
                        logger.error("Git clone failed (repository acquisition failure): %s", git_err)
                        stage_timings["git_clone"] = round(time.time() - t_clone, 3) if 't_clone' in locals() else 0.0
                        stage_timings["total_duration"] = round(time.time() - scan_start_time, 3)
                        scan.status = "failed"
                        scan.stage = "validating"
                        scan.error_message = f"Repository acquisition failed: {git_err}. Security scanning could not start."
                        scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                        scan.configuration = {
                            **cfg,
                            "branch": target_branch,
                            "failure_category": "repository_acquisition_failure",
                            "acquisition_error": str(git_err),
                            "stage_timings": stage_timings,
                        }
                        await db.commit()
                        await db.refresh(scan)
                        return {
                            "scan_id": scan.id,
                            "status": scan.status,
                            "stage": scan.stage,
                            "error": scan.error_message,
                        }
                else:
                    reason = "Metadata-only scan requested" if metadata_only else "Git executable not available on server"
                    scanner_matrix = orchestrator.get_scanner_matrix(repo.metadata_json or {})
                    coverage_summary = {
                        "is_complete": metadata_only,  # Metadata-only is considered complete for its purpose
                        "applicable_scanners": [sc["name"] for sc in scanner_matrix.values() if sc["applicable"]],
                        "executed_scanners": [],
                        "missing_scanners": [],
                        "failed_scanners": [] if metadata_only else ["git_cli_missing"],
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

                # Check cancellation again before AI review & persistence
                await db.refresh(scan)
                if scan.status == "cancelled":
                    logger.info("Scan %d was cancelled mid-flight; terminating before persistence.", scan_id)
                    return {"scan_id": scan_id, "status": "cancelled"}

                # ── Stage 5: Reviewing evidence ─────────────────────────────
                t_ai = time.time()
                scan.stage = "reviewing_evidence"
                await db.commit()

                ai_review_svc = AIScannerReviewService(settings=self.settings)
                ai_analysis = await ai_review_svc.review_findings(
                    findings=raw_findings,
                    repo_metadata=repo.metadata_json or {},
                    coverage_summary=coverage_summary,
                )
                stage_timings["reviewing_evidence"] = round(time.time() - t_ai, 3)

                # ── Stage 6: Generating report & persisting findings ────────
                t_rep = time.time()
                scan.stage = "generating_report"
                await db.commit()

                # Delete any stale findings for this scan if retrying
                await db.execute(
                    Finding.__table__.delete().where(Finding.scan_id == scan.id)
                )

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

                summary_dict = {
                    "total_findings": len(raw_findings),
                    "critical": critical_c,
                    "high": high_c,
                    "medium": med_c,
                    "low": low_c,
                    "info": info_c,
                    "scanner_breakdown": scanner_counts,
                }

                # ── HONEST SCAN COVERAGE RULE ─────────────────────────────────
                # A scan must NEVER be marked "completed" (clean) if a required scanner failed or was unavailable!
                failed_scanners = coverage_summary.get("failed_scanners") or []
                missing_scanners = coverage_summary.get("missing_scanners") or []

                stage_timings["generating_report"] = round(time.time() - t_rep, 3)
                stage_timings["total_duration"] = round(time.time() - scan_start_time, 3)

                if scan_timed_out:
                    scan.status = "timed_out_partial"
                    scan.stage = "timed_out_partial"
                    scan.error_message = f"Scan exceeded outer job safety timeout of {self.settings.scanner_job_max_runtime_seconds}s. Partial findings preserved."
                elif failed_scanners or missing_scanners:
                    # Required scanner failed or was unavailable — cannot certify clean
                    unavail_list = sorted(list(set(failed_scanners + missing_scanners)))
                    scan.status = "failed"
                    scan.stage = "running_scanners"
                    scan.error_message = (
                        f"Required security scanner(s) failed or unavailable: {', '.join(unavail_list)}. "
                        "Scan coverage is incomplete and cannot be certified clean."
                    )
                    logger.warning("Scan %d marked failed due to incomplete scanner coverage: %s", scan.id, unavail_list)
                else:
                    scan.status = "completed"
                    scan.stage = "completed"
                    scan.error_message = None

                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                scan.summary = summary_dict
                scan.files_discovered = coverage_summary.get("files_discovered", 0)
                scan.files_scanned = coverage_summary.get("files_scanned", 0)
                scan.files_skipped = coverage_summary.get("files_skipped", 0)
                scan.skip_manifest = coverage_summary.get("skip_manifest") or {}
                scan.configuration = {
                    **cfg,
                    "branch": target_branch,
                    "scanners_run": scanners_run,
                    "ai_analysis": ai_analysis,
                    "coverage_summary": coverage_summary,
                    "scanner_matrix": scanner_matrix,
                    "stage_timings": stage_timings,
                }

                await db.commit()
                await db.refresh(scan)
                return {
                    "scan_id": scan.id,
                    "status": scan.status,
                    "stage": scan.stage,
                    "summary": scan.summary,
                    "error": scan.error_message,
                }

            except asyncio.CancelledError:
                logger.warning("Scan %d execution was cancelled.", scan_id)
                scan.status = "cancelled"
                scan.stage = "cancelled"
                scan.error_message = "Scan was cancelled by user or system shutdown."
                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await db.commit()
                raise

            except Exception as exc:
                logger.error("Scan %d failed with exception: %s", scan_id, exc, exc_info=True)
                scan.status = "failed"
                valid_stages = {"validating", "fetching_metadata", "inspecting_file_tree", "running_scanners", "reviewing_evidence", "generating_report"}
                if scan.stage not in valid_stages:
                    scan.stage = "validating"
                scan.error_message = str(exc)
                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await db.commit()
                return {"scan_id": scan_id, "status": "failed", "error": str(exc)}

            finally:
                if workspace_dir:
                    cleanup_workspace(workspace_dir)
