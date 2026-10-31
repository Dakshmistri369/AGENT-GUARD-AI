"""
AgentGuard AI — Core Redis Connection Management.
Provides lazy async Redis connections for rate-limiting, job queueing, and health audits.
"""
from __future__ import annotations

import logging
from typing import Optional
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("agentguard.core.redis_client")
settings = get_settings()

_redis_pool: Optional[aioredis.Redis] = None


async def get_redis_client() -> Optional[aioredis.Redis]:
    """Retrieve or create an async Redis client instance from REDIS_URL."""
    global _redis_pool
    if _redis_pool is not None:
        return _redis_pool

    url = settings.redis_url.strip()
    if not url:
        return None

    try:
        _redis_pool = aioredis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=5.0,
            socket_connect_timeout=5.0,
            retry_on_timeout=True,
            max_connections=20,
        )
        await _redis_pool.ping()
        logger.info("Connected to Redis at %s", url.split("@")[-1] if "@" in url else url)
        return _redis_pool
    except Exception as exc:
        logger.warning("Redis connection failed (%s). Operating without Redis.", exc)
        _redis_pool = None
        return None


async def close_redis_client() -> None:
    """Close Redis pool gracefully."""
    global _redis_pool
    if _redis_pool is not None:
        try:
            await _redis_pool.close()
        except Exception:
            pass
        _redis_pool = None
