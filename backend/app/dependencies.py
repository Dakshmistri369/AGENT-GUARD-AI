"""
FastAPI dependencies — database session injection, demo user resolution.

NOTE: Real authentication (JWT) is NOT implemented in Phase 1.
      A seeded demo user (id=1) is returned by get_current_user.
      Every response includes the header:
          X-Auth-Mode: DEMO — no real authentication active
      This is explicitly temporary. See docs/auth_roadmap.md.
"""
from __future__ import annotations

from typing import AsyncGenerator

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import AsyncSessionLocal
from app.models.user import User
from app.config import get_settings

settings = get_settings()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session; close on exit."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(db: AsyncSession = Depends(get_db)) -> User:
    """
    TEMPORARY DEMO AUTH — returns the seeded demo user.
    Real JWT authentication will replace this in Phase 6.
    """
    result = await db.execute(select(User).where(User.id == settings.demo_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        # Seed the demo user on first request if not yet created
        user = User(
            id=settings.demo_user_id,
            email=settings.demo_user_email,
            password_hash="DEMO_MODE_NO_REAL_AUTH",  # nosec B106
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user
