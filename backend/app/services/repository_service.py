"""
AgentGuard AI — Repository Service.
CRUD and authorization enforcement for connected GitHub repositories.
"""
from __future__ import annotations

import uuid
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.security import validate_repository_url_for_ssrf
from app.models.repository import Repository
from app.schemas.repository import RepositoryCreate, RepositoryUpdate, RepositoryResponse, RepositoryListResponse

logger = get_logger("agentguard.services.repository_service")


class RepositoryService:
    """Manages repository records with strict user isolation and SSRF protection."""

    @staticmethod
    async def create_repository(
        db: AsyncSession,
        user_id: str | int,
        payload: RepositoryCreate,
    ) -> RepositoryResponse:
        """Validate, connect, and persist a new repository."""
        raw_url = payload.get_url()
        normalized_url = validate_repository_url_for_ssrf(raw_url)

        # Extract name from URL if not explicitly provided
        parts = normalized_url.rstrip("/").split("/")
        owner_name = parts[-2]
        repo_name = payload.name or parts[-1]
        full_name = f"{owner_name}/{repo_name}"

        # Check existing
        result = await db.execute(
            select(Repository).where(
                Repository.owner_id == user_id,
                Repository.url == normalized_url,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Update active status if needed and return
            existing.is_active = True
            await db.commit()
            await db.refresh(existing)
            return RepositoryResponse.model_validate(existing)

        new_repo = Repository(
            owner_id=user_id,
            name=repo_name,
            owner_name=owner_name,
            full_name=full_name,
            url=normalized_url,
            default_branch=payload.default_branch or "main",
            is_private=False,
            metadata_json={"description": payload.description or ""},
        )
        db.add(new_repo)
        await db.commit()
        await db.refresh(new_repo)
        logger.info("User %s connected repository %s", user_id, full_name)
        return RepositoryResponse.model_validate(new_repo)

    @staticmethod
    async def list_repositories(
        db: AsyncSession,
        user_id: str | int,
        page: int = 1,
        page_size: int = 20,
    ) -> RepositoryListResponse:
        """List repositories owned strictly by the authenticated user."""
        offset = (page - 1) * page_size

        count_query = select(func.count(Repository.id)).where(Repository.owner_id == user_id)
        total_res = await db.execute(count_query)
        total = total_res.scalar_one()

        query = (
            select(Repository)
            .where(Repository.owner_id == user_id)
            .order_by(Repository.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(query)
        repos = result.scalars().all()

        pages = max(1, (total + page_size - 1) // page_size)
        return RepositoryListResponse(
            items=[RepositoryResponse.model_validate(r) for r in repos],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    @staticmethod
    async def get_repository(
        db: AsyncSession,
        user_id: str | int,
        repository_id: str | int,
    ) -> RepositoryResponse:
        """Fetch a single repository, verifying ownership."""
        query = select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == user_id,
        )
        result = await db.execute(query)
        repo = result.scalar_one_or_none()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repository_id} not found or access denied.",
            )
        return RepositoryResponse.model_validate(repo)

    @staticmethod
    async def update_repository(
        db: AsyncSession,
        user_id: str | int,
        repository_id: str | int,
        payload: RepositoryUpdate,
    ) -> RepositoryResponse:
        """Update repository details."""
        query = select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == user_id,
        )
        result = await db.execute(query)
        repo = result.scalar_one_or_none()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repository_id} not found or access denied.",
            )

        if payload.name is not None:
            repo.name = payload.name
        if payload.default_branch is not None:
            repo.default_branch = payload.default_branch
        if payload.is_active is not None:
            repo.is_active = payload.is_active
        if payload.description is not None:
            meta = dict(repo.metadata_json or {})
            meta["description"] = payload.description
            repo.metadata_json = meta

        await db.commit()
        await db.refresh(repo)
        return RepositoryResponse.model_validate(repo)

    @staticmethod
    async def delete_repository(
        db: AsyncSession,
        user_id: str | int,
        repository_id: str | int,
    ) -> dict[str, Any]:
        """Safely delete a repository and cascade delete its scans and findings."""
        query = select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == user_id,
        )
        result = await db.execute(query)
        repo = result.scalar_one_or_none()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repository_id} not found or access denied.",
            )

        await db.delete(repo)
        await db.commit()
        logger.info("User %s deleted repository %s", user_id, repository_id)
        return {"status": "success", "message": f"Repository {repository_id} deleted."}
