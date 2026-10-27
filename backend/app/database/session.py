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
else:
    # PostgreSQL pool settings for Supabase / Cloud Postgres (tuned for max_connections=60)
    pool_kwargs["pool_size"] = settings.db_pool_size
    pool_kwargs["max_overflow"] = settings.db_max_overflow
    pool_kwargs["pool_pre_ping"] = True
    pool_kwargs["pool_recycle"] = 300  # Recycle idle connections before cloud timeouts
    pool_kwargs["pool_timeout"] = 20

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
