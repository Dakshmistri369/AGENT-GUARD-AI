"""
Redis Caching & Invalidation Layer for AgentGuard AI.
Provides resilient read-through caching for auth claims and dashboard metrics.
Never throws exceptions to caller on cache miss/downtime; safely falls back to PostgreSQL.
Includes in-memory L1 cache fallback for local/unit-testing environments.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis_cache_client = None
_l1_cache: dict[str, tuple[str, float]] = {}


async def get_redis_cache_client():
    """Lazily initialize Redis connection for read-through caching."""
    global _redis_cache_client
    settings = get_settings()
    if not settings.redis_url:
        return None

    if _redis_cache_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_cache_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
            )
            await _redis_cache_client.ping()
        except Exception as exc:
            logger.debug("Redis cache client unavailable (%s): using in-memory L1 fallback", exc)
            _redis_cache_client = None

    return _redis_cache_client


async def get_cached_json(key: str) -> Optional[dict[str, Any] | list[Any]]:
    """Retrieve and deserialise JSON value from Redis or L1 fallback. Returns None on miss."""
    # 1. Check Redis if available
    try:
        client = await get_redis_cache_client()
        if client is not None:
            val = await client.get(key)
            if val is not None:
                return json.loads(val)
    except Exception as exc:
        logger.debug("Redis cache get error for key %s: %s", key, exc)

    # 2. Check L1 in-memory fallback
    now = time.time()
    if key in _l1_cache:
        val, expires_at = _l1_cache[key]
        if now < expires_at:
            try:
                return json.loads(val)
            except Exception:
                pass
        else:
            _l1_cache.pop(key, None)

    return None


async def set_cached_json(key: str, data: Any, ex: int = 300) -> bool:
    """Serialise and store data in Redis and L1 with TTL in seconds. Returns True on success."""
    payload = json.dumps(data, default=str)
    success = False

    # Store in Redis if available
    try:
        client = await get_redis_cache_client()
        if client is not None:
            await client.set(key, payload, ex=ex)
            success = True
    except Exception as exc:
        logger.debug("Redis cache set error for key %s: %s", key, exc)

    # Always update L1 in-memory cache as well
    _l1_cache[key] = (payload, time.time() + ex)
    return True


async def delete_cached(key: str) -> bool:
    """Delete a key from Redis and L1 cache. Returns True on success."""
    _l1_cache.pop(key, None)
    try:
        client = await get_redis_cache_client()
        if client is not None:
            await client.delete(key)
    except Exception as exc:
        logger.debug("Redis cache delete error for key %s: %s", key, exc)
    return True


async def invalidate_dashboard_cache(user_id: int | str) -> bool:
    """Invalidate cached dashboard metrics for the given user."""
    return await delete_cached(f"dashboard:metrics:{user_id}")


async def invalidate_user_auth_cache(user_id: int | str, sub: Optional[str] = None) -> bool:
    """Invalidate cached authentication identity for user ID and Supabase sub."""
    res1 = await delete_cached(f"auth:user:{user_id}")
    res2 = True
    if sub:
        res2 = await delete_cached(f"auth:user:{sub}")
    return res1 and res2
