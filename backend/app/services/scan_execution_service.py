"""
AgentGuard AI — Scan Execution Service.
Encapsulates the full 6-stage repository security analysis lifecycle:
1. Validating repository
2. Fetching metadata & commit SHA
3. Inspecting file tree
4. Running security scanners in isolated workspace (concurrent, small-files-first, incremental)
5. Reviewing evidence via AI
6. Generating report, persisting findings, and enforcing honest scan coverage rules.

Architectural Guarantees:
- Short isolated database sessions (never holds open connections across long operations).
- Result cache keyed by (repository_id, commit_sha) with 24-hour TTL.
- Incremental scanning via git diff between successive commits.
- Safe process cleanup in finally blocks.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import time
from pathlib import Path
from typing import Any

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.cache import invalidate_dashboard_cache
from app.database import session as db_session_module
from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.scanners.orchestrator import ScannerOrchestrator
from app.security.url_validation import validate_and_normalize_github_url
from app.security.workspace import cleanup_workspace, create_isolated_workspace
from app.services.ai_scanner_review import AIScannerReviewService
from app.services.git_service import GitExecutionError, GitService
from app.services.github_service import GitHubService
from app.services.repository_analyzer import RepositoryAnalyzer

logger = logging.getLogger("agentguard.services.scan_execution")

RULESET_VERSION = "2026.10"


class ScanExecutionService:
    def __init__(self, settings=None):
        self.settings = settings or get_settings()

    async def _update_scan_progress(
        self,
        scan_id: int,
        stage: str,
        progress_percent: int,
        extra_cfg: dict[str, Any] | None = None,
    ) -> bool:
        """
        Update scan stage and progress in an isolated short database session.
        Returns False if the scan was cancelled by user or system.
        """
        try:
            async with db_session_module.AsyncSessionLocal() as db:
                scan = await db.get(Scan, scan_id)
                if not scan:
                    return False
                if scan.status == "cancelled":
                    return False
                scan.stage = stage
                cfg = dict(scan.configuration or {})
                cfg["progress_percent"] = progress_percent
                if extra_cfg:
                    cfg.update(extra_cfg)
                scan.configuration = cfg
                await db.commit()
                return True
        except Exception as exc:
            logger.warning("Could not update progress for scan %d (stage=%s): %s", scan_id, stage, exc)
            return True

    async def _check_and_apply_scan_cache(
        self,
        scan_id: int,
        repo_id: int,
        commit_sha: str,
        target_branch: str,
    ) -> dict[str, Any] | None:
        """
        Check if a completed scan for this exact repository and commit SHA exists from last 24h.
        If hit, copy findings and summary immediately without re-cloning or re-scanning.
        """
        if not commit_sha:
            return None

        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
            seconds=self.settings.scan_cache_ttl_seconds
        )

        async with db_session_module.AsyncSessionLocal() as db:
            stmt = (
                select(Scan)
                .where(
                    Scan.repository_id == repo_id,
                    Scan.commit_sha == commit_sha,
                    Scan.status == "completed",
                    Scan.id != scan_id,
                    Scan.created_at >= cutoff,
                )
                .order_by(Scan.id.desc())
                .limit(1)
            )
            res = await db.execute(stmt)
            cached_scan = res.scalar_one_or_none()
            if not cached_scan:
                return None

            logger.info(
                "Scan cache hit for repo %d at SHA %s (reusing Scan #%d completed at %s)",
                repo_id,
                commit_sha[:7],
                cached_scan.id,
                cached_scan.completed_at,
            )

            # Retrieve findings from cached scan
            f_stmt = select(Finding).where(Finding.scan_id == cached_scan.id)
            f_res = await db.execute(f_stmt)
            cached_findings = f_res.scalars().all()

            # Load target scan record
            target_scan = await db.get(Scan, scan_id)
            if not target_scan or target_scan.status in ["cancelled", "completed"]:
                return None

            # Copy findings into new scan
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            new_findings = []
            for cf in cached_findings:
                new_findings.append({
                    "scan_id": scan_id,
                    "fingerprint": cf.fingerprint,
                    "title": cf.title,
                    "severity": cf.severity,
                    "confidence": cf.confidence,
                    "scanner": cf.scanner,
                    "scanner_version": cf.scanner_version,
                    "rule_id": cf.rule_id,
                    "file_path": cf.file_path,
                    "line_number": cf.line_number,
                    "line_end": cf.line_end,
                    "column_number": cf.column_number,
                    "code_snippet": cf.code_snippet,
                    "location_type": cf.location_type,
                    "commit_sha": cf.commit_sha or commit_sha,
                    "sanitized_evidence": cf.sanitized_evidence,
                    "explanation": cf.explanation,
                    "remediation": cf.remediation,
                    "verification_status": cf.verification_status,
                    "classification": cf.classification,
                    "classification_reason": cf.classification_reason,
                    "secret_redacted_preview": cf.secret_redacted_preview,
                    "created_at": now_utc,
                })

            if new_findings:
                CHUNK_SIZE = 1000
                for i in range(0, len(new_findings), CHUNK_SIZE):
                    await db.execute(insert(Finding), new_findings[i : i + CHUNK_SIZE])

            target_scan.status = "completed"
            target_scan.stage = "completed"
            target_scan.commit_sha = commit_sha
            target_scan.summary = cached_scan.summary
            target_scan.files_discovered = cached_scan.files_discovered
            target_scan.files_scanned = cached_scan.files_scanned
            target_scan.files_skipped = cached_scan.files_skipped
            target_scan.skip_manifest = cached_scan.skip_manifest
            target_scan.completed_at = now_utc

            cached_cfg = dict(cached_scan.configuration or {})
            target_scan.configuration = {
                **(target_scan.configuration or {}),
                **cached_cfg,
                "branch": target_branch,
                "cached": True,
                "cached_from_scan_id": cached_scan.id,
                "progress_percent": 100,
            }

            await db.commit()
            await db.refresh(target_scan)

            repo = await db.get(Repository, repo_id)
            if repo and repo.owner_id:
                await invalidate_dashboard_cache(repo.owner_id)

            return {
                "scan_id": target_scan.id,
                "status": "completed",
                "stage": "completed",
                "summary": target_scan.summary,
                "cached": True,
                "cached_from_scan_id": cached_scan.id,
            }

    async def execute_scan(self, scan_id: int) -> dict[str, Any]:
        """
        Execute full scan lifecycle for scan_id asynchronously.
        Manages DB updates with short dedicated sessions, isolated workspaces,
        incremental scanning, concurrent tools, and honest coverage reporting.
        """
        scan_start_time = time.time()
        stage_timings: dict[str, float] = {}

        # ── Step 1: Initialize Scan & Read Repository Metadata (Short DB Session) ──
        async with db_session_module.AsyncSessionLocal() as db:
            scan = await db.get(Scan, scan_id)
            if not scan:
                raise ValueError(f"Scan with ID {scan_id} not found.")

            if scan.status in ["cancelled", "completed", "failed", "timed_out_partial"]:
                logger.info("Scan %d is already in terminal state '%s'; skipping execution.", scan_id, scan.status)
                return {"scan_id": scan.id, "status": scan.status}

            now = datetime.datetime.now(datetime.timezone.utc)
            scan.status = "running"
            scan.stage = "validating"
            scan.started_at = now
            scan.error_message = None
            cfg = dict(scan.configuration or {})
            cfg["progress_percent"] = 5
            scan.configuration = cfg
            await db.commit()

            repo = None
            if scan.repository_id:
                repo = await db.get(Repository, scan.repository_id)

            if not repo:
                scan.status = "failed"
                scan.stage = "failed"
                scan.error_message = "Associated repository record not found."
                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await db.commit()
                return {"scan_id": scan_id, "status": "failed", "error": scan.error_message}

            # Extract repository details before closing session
            repo_id = repo.id
            repo_url = repo.url
            repo_owner_id = repo.owner_id
            repo_full_name = repo.full_name
            repo_default_branch = repo.default_branch or "main"
            repo_pinned_sha = repo.pinned_sha
            repo_metadata_json = dict(repo.metadata_json or {})
            scan_cfg = dict(scan.configuration or {})
            scan_commit_sha = scan.commit_sha

        workspace_dir: Path | None = None

        try:
            # ── Stage 1: Validating repository ──────────────────────────
            t_val = time.time()
            owner, repo_name, normalized_url = validate_and_normalize_github_url(repo_url)
            stage_timings["validating"] = round(time.time() - t_val, 3)

            # ── Stage 2: Fetching metadata ───────────────────────────────
            t_meta = time.time()
            github_svc = GitHubService()
            target_branch = scan_cfg.get("branch") or repo_default_branch or "main"

            latest_sha = scan_commit_sha
            if not latest_sha:
                try:
                    latest_sha = await github_svc.get_commit_sha(owner, repo_name, target_branch)
                except Exception as exc:
                    logger.warning("Could not refresh commit SHA via GitHub API: %s", exc)

            stage_timings["fetching_metadata"] = round(time.time() - t_meta, 3)

            # Update commit SHA and stage in short session
            async with db_session_module.AsyncSessionLocal() as db:
                sc_up = await db.get(Scan, scan_id)
                if sc_up:
                    sc_up.commit_sha = latest_sha
                    sc_up.stage = "inspecting_file_tree"
                    sc_cfg = dict(sc_up.configuration or {})
                    sc_cfg["progress_percent"] = 15
                    sc_up.configuration = sc_cfg
                    await db.commit()

            # ── Check Scan Cache (24-Hour Exact Tuple Reuse) ────────────
            if latest_sha:
                cached_res = await self._check_and_apply_scan_cache(
                    scan_id=scan_id,
                    repo_id=repo_id,
                    commit_sha=latest_sha,
                    target_branch=target_branch,
                )
                if cached_res:
                    return cached_res

            # ── Stage 3: Inspecting file tree ───────────────────────────
            t_tree = time.time()
            tree_items = []
            is_truncated = False
            if latest_sha:
                try:
                    tree_items, is_truncated = await github_svc.get_git_tree(owner, repo_name, latest_sha)
                except Exception as exc:
                    logger.warning("Could not fetch recursive git tree: %s", exc)

            meta = RepositoryAnalyzer.analyze_tree(
                tree_items=tree_items,
                owner=owner,
                name=repo_name,
                default_branch=target_branch,
                pinned_sha=latest_sha,
                is_truncated=is_truncated,
                max_files=self.settings.max_repo_files,
                max_depth=self.settings.max_tree_depth,
            )
            effective_meta = meta.model_dump()
            stage_timings["inspecting_file_tree"] = round(time.time() - t_tree, 3)

            # Update repository metadata in short session
            async with db_session_module.AsyncSessionLocal() as db:
                r_up = await db.get(Repository, repo_id)
                if r_up:
                    r_up.metadata_json = effective_meta
                    await db.commit()

            # Check if scan was cancelled
            still_active = await self._update_scan_progress(scan_id, "running_scanners", 30)
            if not still_active:
                logger.info("Scan %d was cancelled mid-flight; terminating.", scan_id)
                return {"scan_id": scan_id, "status": "cancelled"}

            # ── Stage 4: Running security scanners ──────────────────────
            raw_findings: list[dict[str, Any]] = []
            scanners_run: list[dict[str, Any]] = []
            coverage_summary: dict[str, Any] = {}
            scanner_matrix: dict[str, Any] = {}
            scan_timed_out: bool = False
            changed_files: list[str] | None = None

            orchestrator = ScannerOrchestrator()
            git_svc = GitService(timeout_seconds=self.settings.git_clone_timeout_seconds)
            metadata_only = bool(scan_cfg.get("metadata_only", False))

            # Pre-clone size cap defense
            repo_size_kb = effective_meta.get("size_kb", 0)
            max_clone_kb = self.settings.max_repo_clone_size_mb * 1024
            if repo_size_kb > max_clone_kb:
                logger.warning("Repository %s (%s KB) exceeds max clone size; skipping clone.", repo_full_name, repo_size_kb)
                metadata_only = True

            if not metadata_only and git_svc.is_git_available():
                workspace_dir = create_isolated_workspace(self.settings.scan_workspace_dir, scan_id)
                try:
                    t_clone = time.time()
                    await git_svc.clone_repository(
                        normalized_url=repo_url,
                        target_dir=workspace_dir,
                        branch=target_branch,
                        depth=1,
                    )
                    clone_dur = round(time.time() - t_clone, 3)
                    stage_timings["repository_acquisition"] = clone_dur
                    stage_timings["git_clone"] = clone_dur

                    # Incremental diff detection
                    if self.settings.enable_incremental_scans and repo_pinned_sha and latest_sha and repo_pinned_sha != latest_sha:
                        try:
                            diff_files = await git_svc.get_changed_files_between_commits(
                                repo_dir=workspace_dir,
                                old_sha=repo_pinned_sha,
                                new_sha=latest_sha,
                            )
                            if diff_files:
                                changed_files = diff_files
                                logger.info("Incremental scan enabled: %d modified files detected since SHA %s", len(changed_files), repo_pinned_sha[:7])
                        except Exception as diff_err:
                            logger.debug("Could not compute incremental git diff: %s", diff_err)

                    t_scanners = time.time()
                    raw_findings, scanners_run, coverage_summary, scanner_matrix = await orchestrator.run_scans(
                        workspace_path=workspace_dir,
                        metadata=effective_meta,
                        commit_sha=latest_sha,
                        timeout_seconds=self.settings.scanner_timeout_seconds,
                        job_max_runtime_seconds=self.settings.scanner_job_max_runtime_seconds,
                        incremental_files=changed_files,
                    )
                    stage_timings["running_scanners"] = round(time.time() - t_scanners, 3)

                    per_sc = coverage_summary.get("per_scanner_durations", {})
                    stage_timings["semgrep"] = per_sc.get("semgrep", 0.0)
                    stage_timings["bandit"] = per_sc.get("bandit", 0.0)
                    stage_timings["dependency_manifest_detection_and_osv"] = per_sc.get("osv_scanner", 0.0)
                    stage_timings["secret_scanning"] = per_sc.get("detect_secrets", 0.0)
                    stage_timings["file_discovery_and_filtering"] = round(stage_timings.get("inspecting_file_tree", 0.0), 3)
                    stage_timings["repository_bytes"] = coverage_summary.get("repository_bytes", 0)

                    scan_timed_out = coverage_summary.get("job_timed_out", False)

                except GitExecutionError as git_err:
                    logger.error("Git clone failed: %s", git_err)
                    dur = round(time.time() - t_clone, 3) if 't_clone' in locals() else 0.0
                    stage_timings["repository_acquisition"] = dur
                    stage_timings["git_clone"] = dur
                    stage_timings["total_wall_clock"] = round(time.time() - scan_start_time, 3)
                    stage_timings["total_duration"] = stage_timings["total_wall_clock"]

                    async with db_session_module.AsyncSessionLocal() as db:
                        s_fail = await db.get(Scan, scan_id)
                        if s_fail:
                            s_fail.status = "failed"
                            s_fail.stage = "validating"
                            s_fail.error_message = f"Repository acquisition failed: {git_err}."
                            s_fail.completed_at = datetime.datetime.now(datetime.timezone.utc)
                            s_fail.configuration = {
                                **(s_fail.configuration or {}),
                                "branch": target_branch,
                                "failure_category": "repository_acquisition_failure",
                                "stage_timings": stage_timings,
                            }
                            await db.commit()
                            return {"scan_id": scan_id, "status": "failed", "error": s_fail.error_message}
            else:
                reason = "Metadata-only scan requested" if metadata_only else "Git executable not available on server"
                scanner_matrix = orchestrator.get_scanner_matrix(effective_meta)
                coverage_summary = {
                    "is_complete": metadata_only,
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

            # ── Stage 5: Reviewing evidence ─────────────────────────────
            still_active = await self._update_scan_progress(scan_id, "reviewing_evidence", 80)
            if not still_active:
                logger.info("Scan %d cancelled before AI review.", scan_id)
                return {"scan_id": scan_id, "status": "cancelled"}

            t_ai = time.time()
            ai_review_svc = AIScannerReviewService(settings=self.settings)
            try:
                ai_analysis = await asyncio.wait_for(
                    ai_review_svc.review_findings(
                        findings=raw_findings,
                        repo_metadata=effective_meta,
                        coverage_summary=coverage_summary,
                    ),
                    timeout=float(min(self.settings.ai_timeout_seconds, 30)),
                )
            except (asyncio.TimeoutError, TimeoutError):
                ai_analysis = {
                    "status": "timed_out",
                    "message": "AI evidence review timed out. All static findings preserved.",
                    "top_priorities": [],
                    "recommended_tests": [],
                }
            except Exception as ai_err:
                ai_analysis = {
                    "status": "error",
                    "message": f"AI review encountered an error: {ai_err}.",
                    "top_priorities": [],
                    "recommended_tests": [],
                }
            ai_dur = round(time.time() - t_ai, 3)
            stage_timings["ai_explanations"] = ai_dur
            stage_timings["reviewing_evidence"] = ai_dur

            # ── Stage 6: Generating report & persisting findings ────────
            await self._update_scan_progress(scan_id, "generating_report", 95)
            t_rep = time.time()

            critical_c = high_c = med_c = low_c = info_c = 0
            scanner_counts: dict[str, int] = {}
            findings_to_persist: list[dict[str, Any]] = []
            now_utc = datetime.datetime.now(datetime.timezone.utc)

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

                findings_to_persist.append({
                    "scan_id": scan_id,
                    "fingerprint": rf.get("fingerprint"),
                    "title": rf.get("title", "Security Finding"),
                    "severity": sev,
                    "confidence": rf.get("confidence", "medium"),
                    "scanner": sc_name,
                    "scanner_version": rf.get("scanner_version"),
                    "rule_id": rf.get("rule_id"),
                    "file_path": rf.get("file_path"),
                    "line_number": rf.get("line_number"),
                    "line_end": rf.get("line_end"),
                    "column_number": rf.get("column_number"),
                    "code_snippet": rf.get("code_snippet"),
                    "location_type": rf.get("location_type"),
                    "commit_sha": rf.get("commit_sha") or latest_sha,
                    "sanitized_evidence": rf.get("sanitized_evidence"),
                    "explanation": rf.get("explanation"),
                    "remediation": rf.get("remediation"),
                    "verification_status": rf.get("verification_status", "unverified"),
                    "classification": rf.get("classification") or "confirmed_secret",
                    "classification_reason": rf.get("classification_reason"),
                    "secret_redacted_preview": rf.get("secret_redacted_preview"),
                    "created_at": now_utc,
                })

            summary_dict = {
                "total_findings": len(raw_findings),
                "critical": critical_c,
                "high": high_c,
                "medium": med_c,
                "low": low_c,
                "info": info_c,
                "scanner_breakdown": scanner_counts,
            }

            failed_scanners = coverage_summary.get("failed_scanners") or []
            missing_scanners = coverage_summary.get("missing_scanners") or []

            stage_timings["generating_report"] = round(time.time() - t_rep, 3)
            wall_clock = round(time.time() - scan_start_time, 3)
            stage_timings["total_wall_clock"] = wall_clock
            stage_timings["total_duration"] = wall_clock

            # Persist findings and scan status in final dedicated short session
            async with db_session_module.AsyncSessionLocal() as db:
                t_db = time.time()
                await db.execute(Finding.__table__.delete().where(Finding.scan_id == scan_id))
                if findings_to_persist:
                    CHUNK_SIZE = 1000
                    for i in range(0, len(findings_to_persist), CHUNK_SIZE):
                        chunk = findings_to_persist[i : i + CHUNK_SIZE]
                        db.add_all([Finding(**item) for item in chunk])
                stage_timings["database_writes"] = round(time.time() - t_db, 3)

                scan_final = await db.get(Scan, scan_id)
                if not scan_final:
                    return {"scan_id": scan_id, "status": "failed", "error": "Scan record disappeared"}

                if scan_timed_out:
                    scan_final.status = "timed_out_partial"
                    scan_final.stage = "timed_out_partial"
                    scan_final.error_message = f"Scan exceeded outer safety timeout. Partial findings preserved."
                elif failed_scanners or missing_scanners:
                    unavail_list = sorted(list(set(failed_scanners + missing_scanners)))
                    scan_final.status = "failed"
                    scan_final.stage = "running_scanners"
                    scan_final.error_message = (
                        f"Required security scanner(s) failed or unavailable: {', '.join(unavail_list)}. "
                        "Scan coverage is incomplete and cannot be certified clean."
                    )
                else:
                    scan_final.status = "completed"
                    scan_final.stage = "completed"
                    scan_final.error_message = None

                scan_final.completed_at = datetime.datetime.now(datetime.timezone.utc)
                scan_final.summary = summary_dict
                scan_final.files_discovered = coverage_summary.get("files_discovered", 0)
                scan_final.files_scanned = coverage_summary.get("files_scanned", 0)
                scan_final.files_skipped = coverage_summary.get("files_skipped", 0)
                scan_final.skip_manifest = coverage_summary.get("skip_manifest") or {}
                scan_final.configuration = {
                    **(scan_final.configuration or {}),
                    "branch": target_branch,
                    "scanners_run": scanners_run,
                    "ai_analysis": ai_analysis,
                    "coverage_summary": coverage_summary,
                    "scanner_matrix": scanner_matrix,
                    "stage_timings": stage_timings,
                    "progress_percent": 100,
                }

                if latest_sha:
                    r_pin = await db.get(Repository, repo_id)
                    if r_pin:
                        r_pin.pinned_sha = latest_sha

                await db.commit()
                await db.refresh(scan_final)

                if repo_owner_id:
                    await invalidate_dashboard_cache(repo_owner_id)

                return {
                    "scan_id": scan_final.id,
                    "status": scan_final.status,
                    "stage": scan_final.stage,
                    "summary": scan_final.summary,
                    "error": scan_final.error_message,
                }

        except asyncio.CancelledError:
            logger.warning("Scan %d execution was cancelled.", scan_id)
            async with db_session_module.AsyncSessionLocal() as db:
                sc_canc = await db.get(Scan, scan_id)
                if sc_canc:
                    sc_canc.status = "cancelled"
                    sc_canc.stage = "cancelled"
                    sc_canc.error_message = "Scan was cancelled by user or system shutdown."
                    sc_canc.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    await db.commit()
            raise

        except Exception as exc:
            logger.error("Scan %d failed with exception: %s", scan_id, exc, exc_info=True)
            async with db_session_module.AsyncSessionLocal() as db:
                sc_err = await db.get(Scan, scan_id)
                if sc_err:
                    sc_err.status = "failed"
                    if sc_err.stage not in {"validating", "fetching_metadata", "inspecting_file_tree", "running_scanners", "reviewing_evidence", "generating_report"}:
                        sc_err.stage = "validating"
                    sc_err.error_message = str(exc)[:1000]
                    sc_err.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    await db.commit()
            return {"scan_id": scan_id, "status": "failed", "error": str(exc)[:1000]}

        finally:
            if workspace_dir:
                cleanup_workspace(workspace_dir)
