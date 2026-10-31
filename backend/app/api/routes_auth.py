"""
AgentGuard AI — Authentication & User Profile API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_current_user, get_db
from app.models.user import User

router = APIRouter(tags=["Auth"])


@router.get("/auth/me")
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the authenticated user's profile and account metadata.
    Extracted securely from verified Supabase session claims.
    """
    return {
        "id": current_user.id,
        "supabase_user_id": current_user.supabase_user_id or str(current_user.id),
        "email": current_user.email,
        "email_verified": getattr(current_user, "email_verified", True),
        "auth_status": "VERIFIED",
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "plan": "free",
    }
