"""
Health endpoints — real DB connectivity check, not a hardcoded 'ok'.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.config import get_settings

settings = get_settings()
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Real health check:
    - Attempts a DB round-trip query
    - Reports database type (sqlite / postgresql)
    - Reports AI provider mode
    Returns HTTP 200 if healthy, 503 if DB is unreachable.
    """
    start = time.monotonic()
    db_status = "ok"
    db_error: str | None = None

    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = "error"
        # Reveal error type only — never connection strings or credentials
        db_error = type(exc).__name__

    latency_ms = round((time.monotonic() - start) * 1000, 2)
    db_type = "sqlite" if settings.is_sqlite else "postgresql"

    payload = {
        "status": "healthy" if db_status == "ok" else "degraded",
        "version": settings.app_version,
        "environment": settings.environment,
        "database": {
            "status": db_status,
            "type": db_type,
            "latency_ms": latency_ms,
            **({"error_type": db_error} if db_error else {}),
        },
        "ai_provider": {
            "mode": settings.ai_provider,
            "mock_active": settings.ai_provider == "mock",
            "model": settings.ai_model if settings.ai_provider == "nemotron" else "mock",
        },
    }

    from fastapi.responses import JSONResponse
    status_code = 200 if db_status == "ok" else 503
    return JSONResponse(content=payload, status_code=status_code)


@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)) -> dict:
    """Kubernetes-style readiness probe — same logic as /health, minimal response."""
    try:
        await db.execute(text("SELECT 1"))
        return {"ready": True}
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"ready": False}, status_code=503)
