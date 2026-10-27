"""
AgentGuard AI — Distributed Rate Limiter & Abuse Defense.
Enforces sliding-window rate limiting per client IP or authenticated user ID.
Backed by Redis when available for distributed worker nodes, with an in-memory
sliding-window fallback for local development, standalone nodes, and test environments.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import HTTPException, Request, Response, status

from app.config import get_settings
from app.queue.client import get_queue_client

logger = logging.getLogger("agentguard.security.rate_limiter")

# In-memory sliding window tracking: key -> list of float timestamps
_MEMORY_WINDOWS: dict[str, list[float]] = {}
_MEMORY_LOCK = asyncio.Lock()


class RateLimiter:
    """Sliding-window rate limiter with Redis and in-memory backends."""

    def __init__(self):
        self._settings = get_settings()

    async def check_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int = 60,
    ) -> tuple[bool, int, int]:
        """
        Check whether an action identified by key is allowed.
        Returns:
            (is_allowed: bool, remaining: int, reset_seconds: int)
        """
        now = time.time()
        client = get_queue_client()
        redis_conn = await client._get_redis()

        if redis_conn:
            try:
                redis_key = f"agentguard:ratelimit:{key}"
                pipe = redis_conn.pipeline()
                # Remove timestamps outside current sliding window
                pipe.zremrangebyscore(redis_key, 0, now - window_seconds)
                # Count events in window
                pipe.zcard(redis_key)
                # Add current timestamp
                pipe.zadd(redis_key, {str(now): now})
                # Expire key after window
                pipe.expire(redis_key, window_seconds + 5)
                results = await pipe.execute()

                current_count = results[1]
                if current_count >= limit:
                    # Over limit: remove the timestamp we just tentatively added
                    await redis_conn.zrem(redis_key, str(now))
                    oldest_items = await redis_conn.zrange(redis_key, 0, 0, withscores=True)
                    reset_seconds = int(window_seconds - (now - oldest_items[0][1])) if oldest_items else window_seconds
                    return False, 0, max(1, reset_seconds)

                remaining = max(0, limit - (current_count + 1))
                return True, remaining, window_seconds
            except Exception as exc:
                logger.warning("Redis rate limiter check failed (%s); falling back to memory.", exc)

        # In-memory sliding window fallback
        async with _MEMORY_LOCK:
            window_start = now - window_seconds
            timestamps = _MEMORY_WINDOWS.get(key, [])
            # Prune old timestamps
            timestamps = [ts for ts in timestamps if ts > window_start]

            if len(timestamps) >= limit:
                oldest = timestamps[0]
                reset_seconds = int(window_seconds - (now - oldest))
                _MEMORY_WINDOWS[key] = timestamps
                return False, 0, max(1, reset_seconds)

            timestamps.append(now)
            _MEMORY_WINDOWS[key] = timestamps
            remaining = limit - len(timestamps)
            return True, remaining, window_seconds

    def reset_in_memory(self):
        """Clear in-memory rate limit store (for testing)."""
        _MEMORY_WINDOWS.clear()


_rate_limiter = RateLimiter()


def get_client_identifier(request: Request) -> str:
    """Derive client rate-limiting identifier from auth token, user, or IP address."""
    # Check for authorization header / user
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token_hash = hash(auth_header)
        return f"token:{token_hash}"

    # Fallback to client IP
    client_ip = "127.0.0.1"
    if request.client and request.client.host:
        client_ip = request.client.host
    # Respect Forwarded / X-Forwarded-For if behind reverse proxy
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    return f"ip:{client_ip}"


async def require_api_rate_limit(request: Request, response: Response) -> None:
    """FastAPI dependency enforcing general API endpoint rate limits."""
    settings = get_settings()
    identifier = get_client_identifier(request)
    limit = settings.rate_limit_per_minute_api

    allowed, remaining, reset_secs = await _rate_limiter.check_rate_limit(
        key=f"api:{identifier}",
        limit=limit,
        window_seconds=60,
    )

    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset_secs)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API request rate limit exceeded ({limit} requests/min). Please retry in {reset_secs} seconds.",
            headers={
                "Retry-After": str(reset_secs),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_secs),
            },
        )


async def require_scan_rate_limit(request: Request, response: Response) -> None:
    """FastAPI dependency enforcing stricter scan triggering and AI endpoint rate limits."""
    settings = get_settings()
    identifier = get_client_identifier(request)
    limit = settings.rate_limit_per_minute_scan

    allowed, remaining, reset_secs = await _rate_limiter.check_rate_limit(
        key=f"scan_trigger:{identifier}",
        limit=limit,
        window_seconds=60,
    )

    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset_secs)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Scan submission rate limit exceeded ({limit} requests/min). Please retry in {reset_secs} seconds.",
            headers={
                "Retry-After": str(reset_secs),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(reset_secs),
            },
        )
