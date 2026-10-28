"""
AgentGuard AI — Background Scan Worker (arq / Async Task Runner).
Executes queued scans with retry limits, exponential backoff, dead-letter queueing,
and periodic worker heartbeats.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import os
import socket
from typing import Any

from app.config import get_settings
from app.queue.client import _IN_MEMORY_JOBS, _IN_MEMORY_LOCK, get_queue_client
from app.services.scan_execution_service import ScanExecutionService

logger = logging.getLogger("agentguard.queue.worker")

WORKER_ID = f"worker-{socket.gethostname()}-{os.getpid()}"


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
        if result.get("status") == "failed" and job_try < max_retries:
            error_msg = result.get("error", "Unknown scan failure")
            # If failure was due to transient error, allow arq retry
            if "database" in error_msg.lower() or "timeout" in error_msg.lower() or "connection" in error_msg.lower():
                logger.warning("Scan %d hit transient error on try %d: %s. Triggering retry.", scan_id, job_try, error_msg)
                raise RuntimeError(error_msg)
        return result

    except Exception as exc:
        if job_try >= max_retries:
            # Permanent failure — push to Dead-Letter Queue
            await client.record_dead_letter(
                scan_id=scan_id,
                dedup_key=dedup_key,
                reason="Exhausted maximum retry limit",
                retry_count=job_try,
                error_detail=str(exc),
            )
            logger.error("Scan %d permanently failed after %d retries: %s", scan_id, job_try, exc)
            return {"scan_id": scan_id, "status": "failed", "error": f"DLQ: Exhausted {job_try} retries: {exc}"}
        # Re-raise to trigger arq retry with backoff
        raise


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

        except Exception as exc:
            last_error = exc
            logger.warning("In-memory scan %d attempt %d failed: %s", scan_id, attempt, exc)
            if attempt < max_retries:
                delay = delays[min(attempt - 1, len(delays) - 1)]
                await asyncio.sleep(delay)

    # Exhausted retries — Dead Letter Queue
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

    return {"scan_id": scan_id, "status": "failed", "error": f"DLQ: Exhausted {max_retries} retries: {last_error}"}


# ── arq Worker Configuration (for CLI execution `arq app.queue.worker.WorkerSettings`) ──
class WorkerSettings:
    functions = [run_scan_job]
    settings = get_settings()
    queue_name = settings.queue_name
    job_timeout = settings.scanner_job_max_runtime_seconds
    max_jobs = 4  # Controlled worker concurrency per process

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
