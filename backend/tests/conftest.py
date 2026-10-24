"""
pytest conftest — shared fixtures for all backend tests.
Uses an in-memory SQLite DB so tests are fully isolated and require no
external services.
"""
from __future__ import annotations

import os
# Force in-memory SQLite for test isolation
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from typing import AsyncGenerator

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.dependencies import get_db, get_current_user
from app.main import create_app
from app.models.user import User

# ── In-memory SQLite engine for tests ────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

DEMO_USER_ID = 1
DEMO_USER_EMAIL = "demo@agentguard.local"


@pytest_asyncio.fixture(scope="session")
async def setup_db():
    """Create all tables once per test session; drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(setup_db) -> AsyncGenerator[AsyncSession, None]:
    """Fresh async session per test; rolls back after each test."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTPX async test client with:
    - DB overridden to the test in-memory session
    - Demo user injected without real auth
    """
    demo_user = User(
        id=DEMO_USER_ID,
        email=DEMO_USER_EMAIL,
        password_hash="DEMO_TEST_NO_AUTH",  # nosec B106 # pragma: whitelist secret
    )

    app = create_app()

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        # Ensure demo user exists in the test session
        from sqlalchemy import select
        result = await db_session.execute(select(User).where(User.id == DEMO_USER_ID))
        user = result.scalar_one_or_none()
        if user is None:
            db_session.add(demo_user)
            await db_session.commit()
            await db_session.refresh(demo_user)
            user = demo_user
        return user

    from app.ai.service import get_ai_service, AIService
    from app.ai.client import MockAIClient

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_ai_service] = lambda: AIService(client=MockAIClient(model="mock-nemotron-v1"))

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def other_user_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    A second client acting as a DIFFERENT user (id=2).
    Used to test ownership isolation (404 when accessing another user's resources).
    """
    other_user = User(
        id=2,
        email="other@agentguard.local",
        password_hash="OTHER_USER_NO_AUTH",  # nosec B106 # pragma: whitelist secret
    )

    app = create_app()

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        from sqlalchemy import select
        result = await db_session.execute(select(User).where(User.id == 2))
        user = result.scalar_one_or_none()
        if user is None:
            db_session.add(other_user)
            await db_session.commit()
            await db_session.refresh(other_user)
            user = other_user
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
