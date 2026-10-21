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


def _sync_database_schema(connection) -> None:
    """Migrate schema dynamically if users table columns are missing."""
    from sqlalchemy import inspect, text

    inspector = inspect(connection)
    if "users" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("users")}
        dialect = connection.dialect.name

        if "supabase_user_id" not in columns:
            if dialect == "postgresql":
                connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id VARCHAR(64) UNIQUE;"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_supabase_user_id ON users (supabase_user_id);"))
            else:
                connection.execute(text("ALTER TABLE users ADD COLUMN supabase_user_id VARCHAR(64);"))
                connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_supabase_user_id ON users (supabase_user_id);"))

        if "email_verified" not in columns:
            if dialect == "postgresql":
                connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE NOT NULL;"))
            else:
                connection.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0 NOT NULL;"))

        if dialect == "postgresql" and "password_hash" in columns:
            connection.execute(text("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Startup: ensure tables are created (idempotent across SQLite & PostgreSQL).
    Shutdown: dispose engine.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_sync_database_schema)

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
            "note": "This is the backend API. The React UI & Login page are served by your frontend deployment (Vercel or localhost:5173).",
        }

    @app.get("/login", tags=["Root"])
    async def login_route_helper():
        """Guidance route for users visiting the backend URL looking for the frontend login page."""
        return {
            "service": "AgentGuard AI Backend (FastAPI / Render)",
            "message": "This is the backend API server. The interactive UI and Login page are hosted on your frontend deployment (Vercel or localhost:5173).",
            "frontend_origin": settings.frontend_origin,
            "api_documentation": "/api/docs",
            "auth_status": "/api/auth/status",
        }

    return app


app = create_app()
