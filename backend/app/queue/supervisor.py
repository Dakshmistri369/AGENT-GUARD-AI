"""
AgentGuard AI — Queue Supervisor & Embedded Background Runner.
Ensures zero-downtime, rapid scan execution in all deployment architectures:
1. Multi-service deployments with external arq worker fleets.
2. Single-service deployments (e.g. Render Free Tier where background workers cannot be created).
3. Local development and pytest test runners.

Features:
- Embedded arq worker running inside the web application event loop when Redis is available.
- Active scan watchdog: detects unconsumed queued scans (waiting > 8s) and auto-dispatches in-process execution.
- Graceful shutdown lifecycle management.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import os
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.database import session as db_session_module
from app.models.scan import Scan
from app.queue.client import get_queue_client
from app.queue.worker import WorkerSettings, run_scan_job_in_memory

logger = logging.getLogger("agentguard.queue.supervisor")

_SUPERVISOR_TASKS: set[asyncio.Task] = set()
_EMBEDDED_WORKER: Any = None
_WATCHDOG_RUNNING = False


async def _run_embedded_arq_worker() -> None:
    """Run an arq worker inside the FastAPI asyncio event loop."""
    global _EMBEDDED_WORKER
    settings = get_settings()
    if not settings.redis_url:
        return

    try:
        from arq.worker import create_worker
        logger.info("Initializing embedded arq worker inside API process...")
        _EMBEDDED_WORKER = create_worker(WorkerSettings)
        await _EMBEDDED_WORKER.async_run()
    except asyncio.CancelledError:
        logger.info("Embedded arq worker task cancelled.")
    except Exception as exc:
        logger.warning("Embedded arq worker exited with error: %s", exc)
    finally:
        if _EMBEDDED_WORKER:
            try:
                await _EMBEDDED_WORKER.close()
            except Exception:
                pass
            _EMBEDDED_WORKER = None


async def _scan_watchdog_loop() -> None:
    """
    Watchdog loop running every 6 seconds to rescue any scan stuck in 'queued' state.
    Guarantees scans are never left 'Waiting for Worker Slot' if worker fleet is offline.
    """
    global _WATCHDOG_RUNNING
    _WATCHDOG_RUNNING = True
    logger.info("AgentGuard scan queue watchdog started.")

    while _WATCHDOG_RUNNING:
        try:
            await asyncio.sleep(6)
            if not _WATCHDOG_RUNNING:
                break

            now = datetime.datetime.now(datetime.timezone.utc)
            cutoff = now - datetime.timedelta(seconds=8)

            async with db_session_module.AsyncSessionLocal() as db:
                # Find scans stuck in 'queued' that have not been picked up within 8 seconds
                stmt = select(Scan).where(
                    Scan.status == "queued",
                    Scan.created_at <= cutoff,
                )
                res = await db.execute(stmt)
                stuck_scans = res.scalars().all()

                for scan in stuck_scans:
                    dedup_key = f"scan_{scan.id}"
                    client = get_queue_client()

                    # Check if already running in memory
                    from app.queue.client import _IN_MEMORY_JOBS, _IN_MEMORY_LOCK
                    async with _IN_MEMORY_LOCK:
                        job_info = _IN_MEMORY_JOBS.get(dedup_key)
                        if job_info and job_info.get("status") == "running":
                            continue

                    logger.info(
                        "Watchdog rescued queued scan #%d (waiting since %s) — auto-dispatching in-process execution",
                        scan.id,
                        scan.created_at,
                    )

                    # Mark in-memory and dispatch execution task
                    task = asyncio.create_task(
                        run_scan_job_in_memory(
                            scan_id=scan.id,
                            dedup_key=dedup_key,
                            max_retries=client.max_retries,
                        )
                    )
                    from app.queue.client import _BACKGROUND_TASKS
                    _BACKGROUND_TASKS.add(task)
                    task.add_done_callback(_BACKGROUND_TASKS.discard)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.debug("Error in scan watchdog loop: %s", exc)

    logger.info("AgentGuard scan queue watchdog stopped.")


async def start_queue_supervisor() -> None:
    """Start embedded worker (if Redis reachable) and watchdog in background tasks."""
    settings = get_settings()
    client = get_queue_client()

    # If Redis is configured and available, start embedded arq worker
    if settings.redis_url and await client.is_redis_available():
        worker_task = asyncio.create_task(_run_embedded_arq_worker())
        _SUPERVISOR_TASKS.add(worker_task)
        worker_task.add_done_callback(_SUPERVISOR_TASKS.discard)

    # Always start scan watchdog to guarantee queued scans execute rapidly
    watchdog_task = asyncio.create_task(_scan_watchdog_loop())
    _SUPERVISOR_TASKS.add(watchdog_task)
    watchdog_task.add_done_callback(_SUPERVISOR_TASKS.discard)


async def stop_queue_supervisor() -> None:
    """Gracefully stop embedded worker and watchdog tasks."""
    global _WATCHDOG_RUNNING, _EMBEDDED_WORKER
    _WATCHDOG_RUNNING = False

    if _EMBEDDED_WORKER:
        try:
            await _EMBEDDED_WORKER.close()
        except Exception as exc:
            logger.debug("Error closing embedded worker: %s", exc)
        _EMBEDDED_WORKER = None

    for task in list(_SUPERVISOR_TASKS):
        task.cancel()

    if _SUPERVISOR_TASKS:
        await asyncio.gather(*_SUPERVISOR_TASKS, return_exceptions=True)
    _SUPERVISOR_TASKS.clear()
