"""
AgentGuard AI — Arq Worker Entrypoint.
Processes asynchronous scan jobs and AI enrichment tasks.
"""
from __future__ import annotations

import asyncio
from typing import Any
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.logging import get_logger, setup_logging
from app.workers.tasks_scan import run_repository_scan
from app.workers.tasks_ai import generate_ai_explanations

logger = get_logger("agentguard.workers.arq_worker")
settings = get_settings()


async def cleanup_expired_artifacts(ctx: dict) -> dict[str, Any]:
    """Scheduled task to clean up old temporary workspaces and artifacts."""
    logger.info("Executing scheduled artifact cleanup")
    return {"status": "success", "cleaned": 0}


async def startup(ctx: dict) -> None:
    """Worker startup hook."""
    setup_logging()
    logger.info("AgentGuard Arq worker started successfully on queue: %s", settings.queue_name)


async def shutdown(ctx: dict) -> None:
    """Worker shutdown hook."""
    logger.info("AgentGuard Arq worker shutting down")


def get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL into Arq RedisSettings."""
    url = settings.redis_url.strip()
    if url:
        return RedisSettings.from_dsn(url)
    return RedisSettings()


class WorkerSettings:
    """Arq worker configuration."""
    functions = [
        run_repository_scan,
        generate_ai_explanations,
        cleanup_expired_artifacts,
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = get_redis_settings()
    max_jobs = settings.worker_max_jobs
    job_timeout = settings.scanner_job_max_runtime_seconds
    queue_name = settings.queue_name
