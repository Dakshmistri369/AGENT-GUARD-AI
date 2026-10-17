"""
AgentGuard AI — FastAPI application factory.

Auth mode: DEMO (Phase 1) — single seeded user, no JWT.
           Every response carries X-Auth-Mode: DEMO header.
           This is explicitly temporary. See docs/auth_roadmap.md.
"""
from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.database.base import Base
from app.database.session import engine

# Import all models so Alembic / create_all can discover them
import app.models  # noqa: F401

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Startup: create tables (dev/test only via create_all — Alembic handles prod).
    Shutdown: dispose engine.
    """
    if settings.is_sqlite:
        # For SQLite dev / ephemeral test DBs, create tables directly.
        # For PostgreSQL (staging/prod), run: alembic upgrade head
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    yield

    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="AgentGuard AI",
        description=(
            "Independent security and quality auditor for AI-generated and human-written software. "
            "AI coding tools create software. AgentGuard independently checks the software and "
            "provides evidence about its quality and security."
        ),
        version=settings.app_version,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # CORS — never wildcard in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Auth-Mode"],
    )

    app.include_router(api_router)

    return app


app = create_app()
