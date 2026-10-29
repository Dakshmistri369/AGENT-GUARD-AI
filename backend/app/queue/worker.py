"""
AgentGuard AI — Background Scan Worker (arq / Async Task Runner).
Executes queued scans with retry limits, exponential backoff, dead-letter queueing,
dedicated database failure sessions, and periodic worker heartbeats.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import os
import socket
from typing import Any

from arq import Retry
from arq.cron import cron

from app.config import get_settings
from app.database import session as db_session_module
from app.models.scan import Scan
from app.queue.client import _IN_MEMORY_JOBS, _IN_MEMORY_LOCK, get_queue_client
from app.queue.exceptions import PermanentScanError, ToolTimeoutError, TransientScanError
from app.services.scan_execution_service import ScanExecutionService

logger = logging.getLogger("agentguard.queue.worker")

WORKER_ID = f"worker-{socket.gethostname()}-{os.getpid()}"

# Module-level semaphore limiting concurrent heavy scanners across worker jobs
HEAVY_SCAN_SEMAPHORE = asyncio.Semaphore(get_settings().heavy_scan_slots)


async def heartbeat_cron_job(ctx: dict[str, Any]) -> None:
    """Periodic arq cron job executing every 30s to broadcast worker health."""
    client = get_queue_client()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    await client.record_heartbeat(
        WORKER_ID,
        {"status": "alive", "pid": os.getpid(), "timestamp": now_iso},
    )


async def _mark_scan_failed_isolated(scan_id: int, error_message: str) -> None:
    """Mark a scan failed in a dedicated short session so failure status is persisted reliably."""
    try:
        async with db_session_module.AsyncSessionLocal() as session:
            scan = await session.get(Scan, scan_id)
            if scan and scan.status not in ["completed", "failed", "cancelled"]:
                scan.status = "failed"
                scan.error_message = error_message[:1000]
                scan.completed_at = datetime.datetime.now(datetime.timezone.utc)
                await session.commit()
    except Exception as exc:
        logger.warning("Could not mark scan %d failed in isolated session: %s", scan_id, exc)


async def run_scan_job(ctx: dict[str, Any], scan_id: int, repository_id: int | None = None) -> dict[str, Any]:
    """
    arq worker job entrypoint.
    Executes scan lifecycle via ScanExecutionService with retry backoff and DLQ capture.
    """
    client = get_queue_client()
    job_try = ctx.get("job_try", 1)
    max_retries = client.max_retries
    dedup_key = ctx.get("job_id", f"scan_{scan_id}")

    logger.info("Worker %s executing scan %d (try %d/%d)", WORKER_ID, scan_id, job_try, max_retries)
    svc = ScanExecutionService()

    try:
        result = await svc.execute_scan(scan_id)
        return result

    except ToolTimeoutError as timeout_exc:
        # Tool timeouts must NOT be retried: partial results are preserved
        logger.warning(
            "Scan %d encountered tool timeout without retry: %s",
            scan_id,
            timeout_exc,
        )
        await _mark_scan_failed_isolated(scan_id, f"Tool timeout: {timeout_exc}")
        return {"scan_id": scan_id, "status": "timed_out_partial", "error": str(timeout_exc)}

    except (TransientScanError, ConnectionError, OSError) as transient_exc:
        # Infrastructure / connection error — eligible for retry with backoff
        if job_try < max_retries:
            defer_seconds = min(5 * (2 ** (job_try - 1)), 120)
            logger.warning(
                "Scan %d hit transient error on try %d/%d: %s. Scheduling arq.Retry in %ds.",
                scan_id,
                job_try,
                max_retries,
                transient_exc,
                defer_seconds,
            )
            raise Retry(defer=defer_seconds)

        # Permanent failure on retry exhaustion
        err_str = f"Exhausted maximum retries ({job_try}): {transient_exc}"
        await _mark_scan_failed_isolated(scan_id, err_str)
        await client.record_dead_letter(
            scan_id=scan_id,
            dedup_key=dedup_key,
            reason="Exhausted maximum retry limit",
            retry_count=job_try,
            error_detail=err_str,
        )
        logger.error("Scan %d permanently failed after %d retries: %s", scan_id, job_try, transient_exc)
        return {"scan_id": scan_id, "status": "failed", "error": err_str}

    except Exception as exc:
        # Check if error message indicates transient database/Redis connection failure
        err_msg = str(exc).lower()
        is_transient = any(k in err_msg for k in ["connection closed", "connection reset", "broken pipe", "pool timeout", "redis unavailable"])

        if is_transient and job_try < max_retries:
            defer_seconds = min(5 * (2 ** (job_try - 1)), 120)
            logger.warning(
                "Scan %d caught transient network exception on try %d: %s. Scheduling Retry in %ds.",
                scan_id,
                job_try,
                exc,
                defer_seconds,
            )
            raise Retry(defer=defer_seconds)

        # Permanent failure
        err_str = f"Scan failed: {exc}"
        await _mark_scan_failed_isolated(scan_id, err_str)
        await client.record_dead_letter(
            scan_id=scan_id,
            dedup_key=dedup_key,
            reason=f"Exhausted retries ({job_try}) or fatal error",
            retry_count=job_try,
            error_detail=str(exc),
        )
        logger.error("Scan %d permanently failed on try %d: %s", scan_id, job_try, exc)
        return {"scan_id": scan_id, "status": "failed", "error": err_str}


async def run_scan_job_in_memory(
    scan_id: int,
    dedup_key: str,
    max_retries: int = 3,
    retry_delays: list[float] | None = None,
) -> dict[str, Any]:
    """
    In-memory async background task runner for dev/test environments.
    Simulates retry backoff and dead-letter queueing identically to arq.
    """
    delays = retry_delays if retry_delays is not None else [0.1, 0.2, 0.5]
    client = get_queue_client()
    svc = ScanExecutionService()

    async with _IN_MEMORY_LOCK:
        if dedup_key in _IN_MEMORY_JOBS:
            _IN_MEMORY_JOBS[dedup_key]["status"] = "running"
            _IN_MEMORY_JOBS[dedup_key]["started_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            logger.info("In-memory worker executing scan %d (attempt %d/%d)", scan_id, attempt, max_retries)
            result = await svc.execute_scan(scan_id)

            async with _IN_MEMORY_LOCK:
                if dedup_key in _IN_MEMORY_JOBS:
                    _IN_MEMORY_JOBS[dedup_key]["status"] = result.get("status", "completed")
                    _IN_MEMORY_JOBS[dedup_key]["result"] = result

            return result

        except ToolTimeoutError as timeout_exc:
            # Do NOT retry tool timeouts
            logger.warning("In-memory scan %d hit tool timeout without retry: %s", scan_id, timeout_exc)
            await _mark_scan_failed_isolated(scan_id, f"Tool timeout: {timeout_exc}")
            return {"scan_id": scan_id, "status": "timed_out_partial", "error": str(timeout_exc)}

        except Exception as exc:
            last_error = exc
            logger.warning("In-memory scan %d attempt %d failed: %s", scan_id, attempt, exc)
            if attempt < max_retries:
                delay = delays[min(attempt - 1, len(delays) - 1)]
                await asyncio.sleep(delay)

    # Exhausted retries — Dead Letter Queue & mark failed in DB
    err_str = f"DLQ: Exhausted {max_retries} retries: {last_error}"
    await _mark_scan_failed_isolated(scan_id, err_str)
    await client.record_dead_letter(
        scan_id=scan_id,
        dedup_key=dedup_key,
        reason=f"Exhausted maximum in-memory retry limit ({max_retries})",
        retry_count=max_retries,
        error_detail=str(last_error),
    )

    async with _IN_MEMORY_LOCK:
        if dedup_key in _IN_MEMORY_JOBS:
            _IN_MEMORY_JOBS[dedup_key]["status"] = "failed"
            _IN_MEMORY_JOBS[dedup_key]["error"] = str(last_error)

    return {"scan_id": scan_id, "status": "failed", "error": err_str}


# ── arq Worker Configuration (for CLI execution `arq app.queue.worker.WorkerSettings`) ──
class WorkerSettings:
    functions = [run_scan_job]
    cron_jobs = [cron(heartbeat_cron_job, second={0, 30})]
    settings = get_settings()
    queue_name = settings.queue_name
    job_timeout = max(settings.scanner_job_max_runtime_seconds, 1800)
    max_jobs = settings.worker_max_jobs
    max_tries = settings.max_job_retries

    @staticmethod
    def _create_redis_settings():
        from arq.connections import RedisSettings
        s = get_settings()
        if s.redis_url:
            return RedisSettings.from_dsn(s.redis_url)
        return RedisSettings()

    redis_settings = _create_redis_settings()

    @staticmethod
    async def on_startup(ctx: dict[str, Any]):
        client = get_queue_client()
        await client.record_heartbeat(WORKER_ID, {"status": "started", "pid": os.getpid()})
        try:
            from app.security.subprocess_sandbox import reap_orphan_workspaces
            reap_orphan_workspaces(WorkerSettings.settings.scan_workspace_dir, max_age_seconds=WorkerSettings.settings.workspace_max_age_seconds)
        except Exception as exc:
            logger.warning("Could not reap orphan workspaces on worker startup: %s", exc)
        logger.info("AgentGuard background worker %s started.", WORKER_ID)

    @staticmethod
    async def on_shutdown(ctx: dict[str, Any]):
        client = get_queue_client()
        await client.record_heartbeat(WORKER_ID, {"status": "shutdown", "pid": os.getpid()})
        logger.info("AgentGuard background worker %s shut down.", WORKER_ID)
