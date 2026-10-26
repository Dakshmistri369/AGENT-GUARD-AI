"""
FastAPI dependencies — database session injection, Supabase JWT user resolution.
"""
from __future__ import annotations

import logging
import os
from typing import AsyncGenerator, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
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


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency for real Supabase JWT authentication.

    If Authorization header is provided:
        Extracts Bearer token, verifies via Supabase JWKS / secret,
        and provisions / retrieves local User.
    If Authorization header is missing:
        If enable_demo_auth=True and environment=='development':
            Falls back to demo user with explicit warning log.
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
        return await get_or_create_user_from_claims(claims, db)

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
        return demo_user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials were not provided or invalid",
        headers={"WWW-Authenticate": "Bearer"},
    )
