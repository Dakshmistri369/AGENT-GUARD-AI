"""
AgentGuard AI — System Health & Infrastructure API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter
from app.core.config import get_settings
from app.core.supabase_client import get_supabase_admin_client
from app.core.redis_client import get_redis_client

router = APIRouter(prefix="/health", tags=["Health"])
settings = get_settings()


@router.get("")
async def get_general_health():
    """Return general service health and active features."""
    return {
        "status": "healthy",
        "service": "AgentGuard AI Security Auditor",
        "version": settings.app_version,
        "environment": settings.environment,
        "scanners": {
            "semgrep": settings.semgrep_enabled,
            "bandit": settings.bandit_enabled,
            "osv": settings.osv_enabled,
        },
        "ai": {
            "provider": settings.ai_provider,
            "nemotron_configured": bool(settings.nvidia_nemotron_api_key or settings.nvidia_api_key or settings.ai_api_key),
        },
    }


@router.get("/supabase")
async def check_supabase_health():
    """Verify connectivity to Supabase backend without exposing credentials."""
    configured = bool(settings.supabase_url and (settings.supabase_secret_key or settings.supabase_service_key or settings.supabase_publishable_key))
    if not configured:
        return {
            "status": "unconfigured",
            "message": "Supabase environment variables (SUPABASE_URL, SUPABASE_SECRET_KEY) are not set.",
        }

    try:
        client = get_supabase_admin_client()
        # Test query to check network connectivity
        _ = client.table("profiles").select("id").limit(1).execute()
        return {
            "status": "connected",
            "provider": "Supabase PostgreSQL & Storage",
            "url_host": settings.supabase_url.split("//")[-1].split(".")[0] + ".supabase.co",
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "error": "Supabase connection check encountered an exception.",
            "type": type(exc).__name__,
        }


@router.get("/redis")
async def check_redis_health():
    """Verify connectivity to Redis / Arq queue without exposing credentials."""
    if not settings.redis_url:
        return {
            "status": "unconfigured",
            "message": "REDIS_URL is not configured. Running in embedded/local queue mode.",
        }

    try:
        redis_client = await get_redis_client()
        if redis_client:
            pong = await redis_client.ping()
            return {
                "status": "connected" if pong else "degraded",
                "queue": settings.queue_name,
            }
        return {"status": "disconnected"}
    except Exception as exc:
        return {
            "status": "error",
            "error": "Redis ping failed.",
            "type": type(exc).__name__,
        }
