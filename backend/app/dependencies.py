"""
FastAPI dependencies — database session injection, Supabase JWT user resolution.
"""
from __future__ import annotations

import datetime
import logging
import os
from typing import AsyncGenerator, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.cache import get_cached_json, set_cached_json
from app.core.supabase_auth import decode_supabase_token, get_or_create_user_from_claims
from app.database.session import AsyncSessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

__all__ = ["get_db", "get_current_user", "User"]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session; close on exit."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def _reconstruct_user_from_dict(data: dict) -> User:
    """Construct lightweight user identity model directly from cached state (zero-DB auth)."""
    created_at_val = None
    if data.get("created_at"):
        try:
            created_at_val = datetime.datetime.fromisoformat(data["created_at"])
        except Exception:
            created_at_val = datetime.datetime.now(datetime.timezone.utc)
    else:
        created_at_val = datetime.datetime.now(datetime.timezone.utc)

    return User(
        id=data["id"],
        supabase_user_id=data.get("supabase_user_id"),
        email=data.get("email"),
        email_verified=data.get("email_verified", True),
        created_at=created_at_val,
        password_hash=None,
    )


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency for real Supabase JWT authentication with stateless/zero-DB caching.

    If Authorization header is provided:
        Extracts Bearer token and verifies via Supabase JWKS / secret cryptographically.
        Checks Redis for verified user identity; returns cached in-memory identity without DB query.
        Falls back to DB auto-provisioning only on cache miss, then caches validation state for 300s.
    If Authorization header is missing:
        If enable_demo_auth=True and environment=='development':
            Falls back to cached demo user with explicit warning log.
        Else:
            Raises HTTP 401 Unauthorized.
    """
    token: Optional[str] = None
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

    if token:
        claims = decode_supabase_token(token)
        sub = str(claims["sub"])
        auth_cache_key = f"auth:user:{sub}"

        # 1. Zero-DB Fast Path: Check Redis for cached user identity
        cached_user = await get_cached_json(auth_cache_key)
        if cached_user and isinstance(cached_user, dict) and cached_user.get("id"):
            return _reconstruct_user_from_dict(cached_user)

        # 2. Cache Miss: Provision / retrieve from PostgreSQL and cache validation state
        user = await get_or_create_user_from_claims(claims, db)
        user_dict = {
            "id": user.id,
            "supabase_user_id": user.supabase_user_id,
            "email": user.email,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if getattr(user, "created_at", None) else datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await set_cached_json(auth_cache_key, user_dict, ex=300)
        if user.id:
            await set_cached_json(f"auth:user:{user.id}", user_dict, ex=300)
        return user

    # Determine whether demo user fallback is permitted:
    # 1. settings.enable_demo_auth is True (explicit demo mode across all environments)
    # 2. Local development environment
    # 3. Supabase is unconfigured and mock/demo is allowed in production
    allow_demo = (
        settings.enable_demo_auth
        or settings.environment == "development"
        or (
            os.environ.get("AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION") == "1"
            and not settings.supabase_url
            and not settings.supabase_jwt_secret
        )
    )

    # In production with real Supabase credentials configured, demo fallback is forbidden
    # unless enable_demo_auth is explicitly enabled.
    if (
        settings.environment == "production"
        and (settings.supabase_url or settings.supabase_jwt_secret)
        and not settings.enable_demo_auth
    ):
        allow_demo = False

    if allow_demo:
        logger.warning(
            "Demo auth fallback active for unauthenticated request to %s (DEMO MODE)",
            request.url.path,
        )
        # Check demo user cache
        demo_cache_key = "auth:user:demo"
        cached_demo = await get_cached_json(demo_cache_key)
        if cached_demo and isinstance(cached_demo, dict) and cached_demo.get("id"):
            return _reconstruct_user_from_dict(cached_demo)

        result = await db.execute(select(User).where(User.email == settings.demo_user_email))
        demo_user = result.scalar_one_or_none()
        if demo_user is None:
            try:
                demo_user = User(
                    email=settings.demo_user_email,
                    password_hash="DEMO_MODE_NO_REAL_AUTH",  # nosec B106 # pragma: whitelist secret
                    email_verified=True,
                )
                db.add(demo_user)
                await db.commit()
                await db.refresh(demo_user)
            except Exception:
                await db.rollback()
                result = await db.execute(select(User).where(User.email == settings.demo_user_email))
                demo_user = result.scalar_one_or_none()

        if demo_user:
            demo_dict = {
                "id": demo_user.id,
                "supabase_user_id": demo_user.supabase_user_id,
                "email": demo_user.email,
                "email_verified": demo_user.email_verified,
                "created_at": demo_user.created_at.isoformat() if getattr(demo_user, "created_at", None) else datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            await set_cached_json(demo_cache_key, demo_dict, ex=300)
            await set_cached_json(f"auth:user:{demo_user.id}", demo_dict, ex=300)

        return demo_user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials were not provided or invalid",
        headers={"WWW-Authenticate": "Bearer"},
    )
