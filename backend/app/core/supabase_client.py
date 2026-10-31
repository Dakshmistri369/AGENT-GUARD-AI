"""
AgentGuard AI — Supabase Client Module.
Initializes and provides the server-side Supabase client using the service role key.
The service role key is NEVER exposed to the client-side React app.
"""
from __future__ import annotations

from typing import Optional
from supabase import create_client, Client

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("agentguard.core.supabase_client")
settings = get_settings()

_supabase_admin_client: Optional[Client] = None


def get_supabase_admin_client() -> Client:
    """
    Return or initialize a singleton Supabase admin client.
    Uses SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY).
    """
    global _supabase_admin_client
    if _supabase_admin_client is not None:
        return _supabase_admin_client

    url = settings.supabase_url.strip()
    key = (settings.supabase_secret_key or settings.supabase_service_key or settings.supabase_publishable_key).strip()

    if not url or not key:
        logger.warning(
            "Supabase credentials not fully configured (SUPABASE_URL or SUPABASE_SECRET_KEY empty). "
            "Backend runs in degraded/local mock mode."
        )
        # Create client with placeholder if offline, or raise when executed in strict production
        url = url or "https://placeholder-project.supabase.co"
        key = key or "placeholder-service-key"

    try:
        _supabase_admin_client = create_client(url, key)
        logger.info("Initialized Supabase service client for %s", url)
    except Exception as exc:
        logger.error("Failed to initialize Supabase client: %s", exc)
        raise

    return _supabase_admin_client


def reset_supabase_client() -> None:
    """Reset the client instance (useful in testing)."""
    global _supabase_admin_client
    _supabase_admin_client = None
