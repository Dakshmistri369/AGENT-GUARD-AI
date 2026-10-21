"""
Supabase Authentication & JWT Verification for FastAPI.

Validates Supabase-issued JSON Web Tokens via:
1. Asymmetric JWKS (ES256/RS256) against {supabase_url}/auth/v1/.well-known/jwks.json
2. Symmetric HS256 secret (when SUPABASE_JWT_SECRET is configured)

Provisions or links corresponding local User records on demand with strict isolation.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import jwt
from jwt import PyJWKClient, PyJWKClientError, PyJWTError
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> Optional[PyJWKClient]:
    """Return or initialize cached PyJWKClient for Supabase JWKS endpoint."""
    global _jwks_client
    if _jwks_client is None and settings.supabase_url:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def decode_supabase_token(token: str) -> dict[str, Any]:
    """
    Decode and verify a Supabase JWT.
    
    Validates token signatures via JWKS or JWT secret, audience ('authenticated'),
    and expiration timestamp.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing or empty",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "ES256")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    payload: Optional[dict[str, Any]] = None

    # Asymmetric keys (ES256 / RS256) via JWKS
    if alg in ("ES256", "RS256"):
        client = get_jwks_client()
        if client is not None:
            try:
                signing_key = client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    audience="authenticated",
                    options={"verify_aud": True, "verify_exp": True},
                )
            except (PyJWKClientError, PyJWTError) as exc:
                logger.warning("JWKS token verification failed: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Token verification failed: {exc}",
                    headers={"WWW-Authenticate": "Bearer"},
                ) from exc
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase URL not configured for JWKS token verification",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Symmetric HS256 verification
    elif alg == "HS256":
        secret = settings.supabase_jwt_secret or settings.jwt_secret
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase JWT secret not configured for HS256 token verification",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True, "verify_exp": True},
            )
        except PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid HS256 token: {exc}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported token algorithm: {alg}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing subject claim ('sub')",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_or_create_user_from_claims(claims: dict[str, Any], db: AsyncSession) -> User:
    """
    Resolve local User by supabase_user_id (claims['sub']), or auto-provision.
    Preserves referential integrity and user ownership across scans and projects.
    """
    sub = str(claims["sub"])
    email = claims.get("email") or f"{sub}@agentguard.auth"
    email_verified = bool(claims.get("email_confirmed_at") or claims.get("user_metadata", {}).get("email_verified", False))

    # 1. Search by supabase_user_id
    stmt = select(User).where(User.supabase_user_id == sub)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is not None:
        if user.email_verified != email_verified:
            user.email_verified = email_verified
            await db.commit()
            await db.refresh(user)
        return user

    # 2. Search by email (linking account if existed locally prior to Supabase migration)
    stmt_email = select(User).where(User.email == email)
    result_email = await db.execute(stmt_email)
    user = result_email.scalar_one_or_none()

    if user is not None:
        user.supabase_user_id = sub
        user.email_verified = email_verified
        await db.commit()
        await db.refresh(user)
        return user

    # 3. Auto-provision new User
    user = User(
        supabase_user_id=sub,
        email=email,
        email_verified=email_verified,
        password_hash=None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("Auto-provisioned new User (id=%s, email=%s, sub=%s)", user.id, user.email, sub)
    return user

