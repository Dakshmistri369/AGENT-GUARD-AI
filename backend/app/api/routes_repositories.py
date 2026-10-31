"""
AgentGuard AI — Repository Management API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.repository import RepositoryCreate, RepositoryUpdate, RepositoryResponse, RepositoryListResponse
from app.services.repository_service import RepositoryService

router = APIRouter(prefix="/repositories", tags=["Repositories"])


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def create_repository(
    payload: RepositoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Connect a new GitHub repository.
    Validates GitHub URL format, enforces HTTPS, and prevents SSRF.
    """
    return await RepositoryService.create_repository(db, current_user.id, payload)


@router.get("", response_model=RepositoryListResponse)
async def list_repositories(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List repositories owned by the authenticated user."""
    return await RepositoryService.list_repositories(db, current_user.id, page, page_size)


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository(
    repository_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve details for a single repository owned by the user."""
    return await RepositoryService.get_repository(db, current_user.id, repository_id)


@router.patch("/{repository_id}", response_model=RepositoryResponse)
async def update_repository(
    repository_id: str,
    payload: RepositoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update repository name, branch, description, or active status."""
    return await RepositoryService.update_repository(db, current_user.id, repository_id, payload)


@router.delete("/{repository_id}", status_code=status.HTTP_200_OK)
async def delete_repository(
    repository_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a repository and cascade delete related scans, findings, and artifacts."""
    return await RepositoryService.delete_repository(db, current_user.id, repository_id)
