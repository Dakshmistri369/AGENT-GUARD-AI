"""Database engine and session factory."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings

settings = get_settings()

# SQLite requires StaticPool + check_same_thread=False for async + testing
connect_args: dict = {}
pool_kwargs: dict = {}

if settings.is_sqlite:
    connect_args["check_same_thread"] = False
    pool_kwargs["poolclass"] = StaticPool

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args=connect_args,
    **pool_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
