"""
Authentication API endpoints.
Provides auth configuration status and authenticated user identity introspection.
"""
from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class AuthStatusResponse(BaseModel):
    auth_mode: str
    supabase_configured: bool
    supabase_url: str
    supabase_publishable_key: str
    demo_auth_enabled: bool


class UserProfileResponse(BaseModel):
    id: int
    email: str
    supabase_user_id: Optional[str] = None
    email_verified: bool
    auth_status: str
    created_at: datetime.datetime


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    """
    Public auth status and client configuration.
    Safe to call without authentication credentials.
    """
    mode = "supabase_jwt" if settings.supabase_url else ("demo" if settings.enable_demo_auth else "supabase_jwt")
    return AuthStatusResponse(
        auth_mode=mode,
        supabase_configured=bool(settings.supabase_url),
        supabase_url=settings.supabase_url,
        supabase_publishable_key=settings.supabase_publishable_key,
        demo_auth_enabled=settings.enable_demo_auth,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    """
    Protected endpoint: returns verified identity of the authenticated user.
    Returns 401 Unauthorized if token is missing, expired, or invalid.
    """
    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        supabase_user_id=current_user.supabase_user_id,
        email_verified=current_user.email_verified,
        auth_status="VERIFIED",
        created_at=current_user.created_at,
    )
