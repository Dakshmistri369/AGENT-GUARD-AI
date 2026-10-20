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
    except Exception as _loop_err:
        _ = _loop_err

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
    Startup: ensure tables are created (idempotent across SQLite & PostgreSQL).
    Shutdown: dispose engine.
    """
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

    # CORS — allow configured origins, Vercel deployments, and local dev
    raw_origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
    for local_origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]:
        if local_origin not in raw_origins:
            raw_origins.append(local_origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=raw_origins,
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Auth-Mode"],
    )

    app.include_router(api_router)

    @app.get("/", tags=["Root"])
    async def root():
        """Root endpoint returning service identity and documentation links."""
        return {
            "name": "AgentGuard AI Security Auditor API",
            "status": "online",
            "version": settings.app_version,
            "documentation": "/api/docs",
            "health": "/health",
            "environment": settings.environment,
            "message": "Backend service is operational and connected to Supabase PostgreSQL.",
        }

    return app


app = create_app()
