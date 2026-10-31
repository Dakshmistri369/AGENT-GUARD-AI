"""
AgentGuard AI — Arq Worker Scan Execution Task.
Safely clones repository into ephemeral sandbox, runs AST security scanners,
normalizes findings, uploads private artifacts to Supabase Storage, and updates DB status.
"""
from __future__ import annotations

import asyncio
import datetime
import json
import os
import time
from typing import Any

from sqlalchemy import select
from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.session import AsyncSessionLocal
from app.models.scan import Scan
from app.models.repository import Repository
from app.services.finding_service import FindingService
from app.services.storage_service import StorageService
from app.services.ai_service import AiService
from app.utils.github_utils import ephemeral_repository_workspace
from app.utils.scanner_normalizer import ScannerNormalizer

logger = get_logger("agentguard.workers.tasks_scan")
settings = get_settings()


async def run_repository_scan(
    ctx: dict,
    scan_id: str | int,
    repository_id: str | int,
    user_id: str | int,
    repo_url: str,
    branch: str | None = "main",
) -> dict[str, Any]:
    """Execute complete repository scan asynchronously."""
    start_time = time.time()
    started_at = datetime.datetime.now(datetime.timezone.utc)
    logger.info("Starting scan job for scan_id=%s repo=%s branch=%s", scan_id, repo_url, branch)

    storage_svc = StorageService()

    async with AsyncSessionLocal() as db:
        # Mark scan as running
        scan_res = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = scan_res.scalar_one_or_none()
        if not scan:
            logger.error("Scan %s not found in database", scan_id)
            return {"status": "error", "message": f"Scan {scan_id} not found"}

        scan.status = "running"
        scan.stage = "running_scanners"
        scan.started_at = started_at
        await db.commit()

        scanner_logs: dict[str, str] = {}
        all_normalized_findings: list[dict[str, Any]] = []

        try:
            # 1. Ephemeral safe shallow-clone
            async with ephemeral_repository_workspace(
                repo_url=repo_url,
                branch=branch,
                timeout_seconds=settings.git_clone_timeout_seconds,
            ) as workspace_dir:
                scan.stage = "running_scanners"
                await db.commit()

                # 2. Run Semgrep if enabled
                if settings.semgrep_enabled:
                    try:
                        sem_proc = await asyncio.create_subprocess_exec(
                            "semgrep",
                            "--config", "p/ci",
                            "--json",
                            "--metrics=off",
                            "--disable-version-check",
                            "--timeout", "15",
                            workspace_dir,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        sem_out, sem_err = await asyncio.wait_for(sem_proc.communicate(), timeout=300)
                        scanner_logs["semgrep"] = sem_err.decode(errors="replace")
                        if sem_out:
                            sem_json = json.loads(sem_out.decode(errors="replace"))
                            all_normalized_findings.extend(ScannerNormalizer.normalize_semgrep(sem_json))
                    except Exception as sem_exc:
                        logger.warning("Semgrep execution skipped or failed: %s", sem_exc)
                        scanner_logs["semgrep"] = f"Error: {sem_exc}"

                # 3. Run Bandit if enabled
                if settings.bandit_enabled:
                    try:
                        ban_proc = await asyncio.create_subprocess_exec(
                            "bandit",
                            "-r",
                            "-f", "json",
                            workspace_dir,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        ban_out, ban_err = await asyncio.wait_for(ban_proc.communicate(), timeout=180)
                        scanner_logs["bandit"] = ban_err.decode(errors="replace")
                        if ban_out:
                            try:
                                ban_json = json.loads(ban_out.decode(errors="replace"))
                                all_normalized_findings.extend(ScannerNormalizer.normalize_bandit(ban_json))
                            except json.JSONDecodeError:
                                pass
                    except Exception as ban_exc:
                        logger.warning("Bandit execution skipped or failed: %s", ban_exc)
                        scanner_logs["bandit"] = f"Error: {ban_exc}"

                # 4. Run OSV scanner / dependencies check
                if settings.osv_enabled:
                    try:
                        osv_proc = await asyncio.create_subprocess_exec(
                            "osv-scanner",
                            "--json",
                            "-r",
                            workspace_dir,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        osv_out, osv_err = await asyncio.wait_for(osv_proc.communicate(), timeout=120)
                        scanner_logs["osv"] = osv_err.decode(errors="replace")
                        if osv_out:
                            try:
                                osv_json = json.loads(osv_out.decode(errors="replace"))
                                all_normalized_findings.extend(ScannerNormalizer.normalize_osv(osv_json))
                            except json.JSONDecodeError:
                                pass
                    except Exception as osv_exc:
                        logger.warning("OSV-Scanner execution skipped or failed: %s", osv_exc)
                        scanner_logs["osv"] = f"Error: {osv_exc}"

            # 5. Persist normalized findings to PostgreSQL
            inserted_count = await FindingService.batch_insert_findings(
                db=db,
                scan_id=scan.id,
                user_id=user_id,
                normalized_findings=all_normalized_findings,
            )

            # 6. Upload scanner logs to Supabase Storage ('scan-logs')
            for sc_name, sc_log in scanner_logs.items():
                log_path = f"{user_id}/{scan.id}/{sc_name}.log"
                storage_svc.upload_artifact(
                    bucket_id=settings.storage_bucket_logs,
                    storage_path=log_path,
                    content=sc_log,
                    content_type="text/plain",
                )
                await storage_svc.save_artifact_record(
                    db=db,
                    scan_id=scan.id,
                    user_id=user_id,
                    artifact_type="log",
                    file_name=f"{sc_name}.log",
                    storage_bucket=settings.storage_bucket_logs,
                    storage_path=log_path,
                    file_size_bytes=len(sc_log.encode("utf-8")),
                    mime_type="text/plain",
                )

            # 7. Generate & Upload summary JSON report to Supabase Storage ('scan-reports')
            summary = {
                "total_findings": len(all_normalized_findings),
                "critical_count": sum(1 for f in all_normalized_findings if f["severity"] == "critical"),
                "high_count": sum(1 for f in all_normalized_findings if f["severity"] == "high"),
                "medium_count": sum(1 for f in all_normalized_findings if f["severity"] == "medium"),
                "low_count": sum(1 for f in all_normalized_findings if f["severity"] == "low"),
                "info_count": sum(1 for f in all_normalized_findings if f["severity"] == "info"),
                "findings_by_scanner": {
                    "semgrep": sum(1 for f in all_normalized_findings if f["scanner"] == "semgrep"),
                    "bandit": sum(1 for f in all_normalized_findings if f["scanner"] == "bandit"),
                    "osv": sum(1 for f in all_normalized_findings if f["scanner"] == "osv"),
                },
            }

            report_data = {
                "scan_id": scan.id,
                "repository_url": repo_url,
                "branch": branch,
                "summary": summary,
                "findings": all_normalized_findings,
                "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            report_json = json.dumps(report_data, indent=2)
            report_path = f"{user_id}/{scan.id}/security-report.json"
            storage_svc.upload_artifact(
                bucket_id=settings.storage_bucket_reports,
                storage_path=report_path,
                content=report_json,
                content_type="application/json",
            )
            await storage_svc.save_artifact_record(
                db=db,
                scan_id=scan.id,
                user_id=user_id,
                artifact_type="report",
                file_name="security-report.json",
                storage_bucket=settings.storage_bucket_reports,
                storage_path=report_path,
                file_size_bytes=len(report_json.encode("utf-8")),
                mime_type="application/json",
            )

            # 8. Mark scan completed
            duration = time.time() - start_time
            scan.status = "completed"
            scan.stage = "completed"
            scan.summary = summary
            scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
            await db.commit()

            # 9. Optionally trigger AI explanations in background
            try:
                await AiService.generate_explanations_for_findings(db, scan.id)
            except Exception as ai_err:
                logger.warning("Post-scan AI explanation step failed non-critically: %s", ai_err)

            logger.info("Scan %s completed in %.2fs with %d findings", scan.id, duration, len(all_normalized_findings))
            return {"status": "completed", "scan_id": scan.id, "duration": duration, "findings": len(all_normalized_findings)}

        except Exception as exc:
            logger.error("Scan %s failed: %s", scan.id, exc, exc_info=True)
            scan.status = "failed"
            scan.stage = "failed"
            scan.error_message = str(exc)
            scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
            await db.commit()
            return {"status": "failed", "scan_id": scan.id, "error": str(exc)}
