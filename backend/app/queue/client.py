"""
AgentGuard AI — Queue Client.
Provides unified enqueueing, job deduplication, worker heartbeat tracking,
and dead-letter queue (DLQ) operations.
Works natively with Redis/arq in production and transparently falls back to
an in-memory async runner for local development and test environments.
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger("agentguard.queue.client")

# In-memory stores for dev/test when Redis is not active
_IN_MEMORY_JOBS: dict[str, dict[str, Any]] = {}
_IN_MEMORY_DLQ: list[dict[str, Any]] = []
_IN_MEMORY_HEARTBEATS: dict[str, dict[str, Any]] = {}
_IN_MEMORY_LOCK = asyncio.Lock()
_BACKGROUND_TASKS: set[asyncio.Task] = set()


class ScanQueueClient:
    def __init__(self, redis_url: str | None = None, max_retries: int = 3):
        settings = get_settings()
        self.redis_url = redis_url if redis_url is not None else settings.redis_url
        self.max_retries = max_retries or settings.max_job_retries
        self.queue_name = settings.queue_name
        self._redis = None
        self._arq_pool = None

    async def _get_redis(self):
        """Lazily initialize Redis connection if configured."""
        if not self.redis_url:
            return None
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=3,
                    socket_timeout=3,
                )
                await self._redis.ping()
            except Exception as exc:
                logger.warning("Redis connection to %s failed (%s); using in-memory queue fallback.", self.redis_url, exc)
                self._redis = None
        return self._redis

    async def _get_arq_pool(self):
        """Get arq connection pool if Redis is reachable."""
        if not self.redis_url:
            return None
        if self._arq_pool is None:
            try:
                from arq import create_pool
                from arq.connections import RedisSettings
                arq_settings = RedisSettings.from_dsn(self.redis_url)
                self._arq_pool = await create_pool(arq_settings)
            except Exception as exc:
                logger.warning("Arq Redis pool creation failed (%s); falling back to direct executor.", exc)
                self._arq_pool = None
        return self._arq_pool

    async def is_redis_available(self) -> bool:
        redis_conn = await self._get_redis()
        return redis_conn is not None

    async def enqueue_scan(
        self,
        scan_id: int,
        repository_id: int,
        idempotency_token: str | None = None,
        execute_inline_if_dev: bool = False,
    ) -> dict[str, Any]:
        """
        Enqueue a scan job with idempotency deduplication.
        Returns job metadata dictionary: { "job_id": ..., "enqueued": bool, "status": ... }
        """
        dedup_key = idempotency_token or f"scan_{scan_id}"
        pool = await self._get_arq_pool()

        if pool is not None:
            # Enqueue with arq using _job_id for native deduplication
            try:
                job = await pool.enqueue_job(
                    "run_scan_job",
                    scan_id,
                    repository_id=repository_id,
                    _job_id=dedup_key,
                    _queue_name=self.queue_name,
                )
                if job:
                    logger.info("Enqueued scan %d with arq job ID %s", scan_id, dedup_key)
                    return {"job_id": dedup_key, "enqueued": True, "mode": "arq_redis"}
                else:
                    logger.info("Scan %d deduplicated (already queued/running with ID %s)", scan_id, dedup_key)
                    return {"job_id": dedup_key, "enqueued": False, "mode": "arq_redis", "reason": "duplicate"}
            except Exception as exc:
                logger.error("Failed to enqueue with arq: %s. Falling back to background executor.", exc)

        # In-memory execution path (dev / pytest)
        async with _IN_MEMORY_LOCK:
            if dedup_key in _IN_MEMORY_JOBS:
                existing = _IN_MEMORY_JOBS[dedup_key]
                if existing.get("status") in ["queued", "running"]:
                    logger.info("Scan %d already queued/running in-memory (idempotent skip).", scan_id)
                    return {
                        "job_id": dedup_key,
                        "enqueued": False,
                        "mode": "in_memory",
                        "status": existing.get("status"),
                        "reason": "duplicate",
                    }

            _IN_MEMORY_JOBS[dedup_key] = {
                "scan_id": scan_id,
                "repository_id": repository_id,
                "status": "queued",
                "enqueued_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "retries": 0,
            }

        # Spawn asynchronous worker task
        from app.queue.worker import run_scan_job_in_memory
        task = asyncio.create_task(run_scan_job_in_memory(scan_id=scan_id, dedup_key=dedup_key, max_retries=self.max_retries))
        _BACKGROUND_TASKS.add(task)
        task.add_done_callback(_BACKGROUND_TASKS.discard)

        return {"job_id": dedup_key, "enqueued": True, "mode": "in_memory"}

    async def wait_all_jobs(self, timeout: float = 10.0) -> None:
        """Wait for in-memory tasks to complete (useful in tests & graceful shutdown)."""
        if _BACKGROUND_TASKS:
            await asyncio.wait(list(_BACKGROUND_TASKS), timeout=timeout)

    async def get_queue_depth(self) -> int:
        """Return the number of currently queued jobs awaiting processing."""
        redis_conn = await self._get_redis()
        if redis_conn:
            try:
                # arq queues are stored as zsets in Redis
                zcount = await redis_conn.zcard(f"arq:queue:{self.queue_name}")
                if zcount is not None:
                    return zcount
            except Exception as exc:
                logger.warning("Failed to read Redis queue depth: %s", exc)

        async with _IN_MEMORY_LOCK:
            return sum(1 for j in _IN_MEMORY_JOBS.values() if j.get("status") == "queued")

    async def get_active_running_count(self) -> int:
        """Return the number of currently running jobs."""
        async with _IN_MEMORY_LOCK:
            return sum(1 for j in _IN_MEMORY_JOBS.values() if j.get("status") == "running")

    def reset_in_memory(self) -> None:
        """Reset in-memory job, DLQ, and heartbeat stores (primarily for tests)."""
        _IN_MEMORY_JOBS.clear()
        _IN_MEMORY_DLQ.clear()
        _IN_MEMORY_HEARTBEATS.clear()

    async def record_heartbeat(self, worker_id: str, metadata: dict[str, Any] | None = None) -> None:
        """Record worker heartbeat with TTL to verify worker fleet liveness."""
        settings = get_settings()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        heartbeat_data = {
            "worker_id": worker_id,
            "last_heartbeat": now_iso,
            "metadata": metadata or {},
        }
        redis_conn = await self._get_redis()
        if redis_conn:
            try:
                key = f"agentguard:heartbeat:{worker_id}"
                await redis_conn.set(key, json.dumps(heartbeat_data), ex=settings.worker_heartbeat_ttl_seconds)
                return
            except Exception as exc:
                logger.warning("Failed to write heartbeat to Redis: %s", exc)

        # Fallback in-memory heartbeat
        _IN_MEMORY_HEARTBEATS[worker_id] = heartbeat_data

    async def get_worker_heartbeats(self) -> list[dict[str, Any]]:
        """Retrieve active worker heartbeats."""
        redis_conn = await self._get_redis()
        if redis_conn:
            try:
                keys = await redis_conn.keys("agentguard:heartbeat:*")
                heartbeats = []
                for k in keys:
                    val = await redis_conn.get(k)
                    if val:
                        heartbeats.append(json.loads(val))
                return heartbeats
            except Exception as exc:
                logger.warning("Failed to fetch heartbeats from Redis: %s", exc)

        return list(_IN_MEMORY_HEARTBEATS.values())

    async def record_dead_letter(
        self,
        scan_id: int,
        dedup_key: str,
        reason: str,
        retry_count: int,
        error_detail: str | None = None,
    ) -> None:
        """Push a permanently failed job into the Dead-Letter Queue (DLQ)."""
        dlq_entry = {
            "scan_id": scan_id,
            "dedup_key": dedup_key,
            "reason": reason,
            "retry_count": retry_count,
            "error_detail": error_detail,
            "failed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        logger.critical(
            "DEAD-LETTER QUEUE: Scan %d exhausted %d retries and was permanently aborted. Reason: %s",
            scan_id, retry_count, reason
        )
        redis_conn = await self._get_redis()
        if redis_conn:
            try:
                await redis_conn.lpush("agentguard:dlq", json.dumps(dlq_entry))
                await redis_conn.ltrim("agentguard:dlq", 0, 999)  # Keep last 1000 DLQ items
                return
            except Exception as exc:
                logger.error("Failed to push dead-letter to Redis: %s", exc)

        _IN_MEMORY_DLQ.append(dlq_entry)

    async def get_dead_letter_jobs(self, limit: int = 50) -> list[dict[str, Any]]:
        """Fetch recent dead-letter queue records for monitoring."""
        redis_conn = await self._get_redis()
        if redis_conn:
            try:
                raw_items = await redis_conn.lrange("agentguard:dlq", 0, limit - 1)
                return [json.loads(item) for item in raw_items]
            except Exception as exc:
                logger.warning("Failed to fetch DLQ from Redis: %s", exc)

        return list(_IN_MEMORY_DLQ[-limit:])


_client_instance: ScanQueueClient | None = None

def get_queue_client() -> ScanQueueClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = ScanQueueClient()
    return _client_instance
