"""
AgentGuard AI — GitHub Repositories API Router.
Handles repository URL validation, connection, metadata inspection, and listing.
"""
from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_dashboard_cache
from app.dependencies import get_current_user, get_db
from app.models.repository import Repository
from app.models.user import User
from app.schemas.repository import (
    RepositoryCreate,
    RepositoryListResponse,
    RepositoryResponse,
    RepositoryValidateRequest,
    RepositoryValidateResponse,
)
from app.security.url_validation import URLValidationError, validate_and_normalize_github_url
from app.services.github_service import GitHubAPIError, GitHubService
from app.services.repository_analyzer import RepositoryAnalyzer

logger = logging.getLogger("agentguard.api.repositories")
router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.post("/validate", response_model=RepositoryValidateResponse)
async def validate_repository_url(payload: RepositoryValidateRequest) -> RepositoryValidateResponse:
    """Validate GitHub repository HTTPS URL syntax and parameters without external network calls."""
    try:
        owner, repo, normalized = validate_and_normalize_github_url(payload.url)
        return RepositoryValidateResponse(
            valid=True,
            owner=owner,
            name=repo,
            normalized_url=normalized,
        )
    except URLValidationError as exc:
        return RepositoryValidateResponse(
            valid=False,
            error=str(exc),
        )


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def connect_repository(
    payload: RepositoryCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryResponse:
    """
    Connect a GitHub repository:
    1. Validates HTTPS URL.
    2. Fetches metadata via GitHub REST API (public repos work with no token).
    3. Pins the latest commit SHA.
    4. Performs initial metadata-only tree inspection.
    5. Saves or updates the repository record.
    """
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    try:
        owner, repo_name, normalized_url = validate_and_normalize_github_url(payload.url)
    except URLValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    github_svc = GitHubService()

    # Fetch repository info
    try:
        repo_info = await github_svc.get_repository_info(owner, repo_name)
    except GitHubAPIError as exc:
        status_code = exc.status_code if exc.status_code in [401, 403, 404] else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=status_code, detail=str(exc))

    default_branch = repo_info.get("default_branch", "main")

    # Pin latest commit SHA
    try:
        pinned_sha = await github_svc.get_commit_sha(owner, repo_name, default_branch)
    except GitHubAPIError as exc:
        logger.warning("Could not resolve commit SHA: %s", exc)
        pinned_sha = None

    # Fetch languages
    detected_languages = []
    try:
        lang_dict = await github_svc.get_languages(owner, repo_name)
        detected_languages = sorted(list(lang_dict.keys()))
    except Exception as exc:
        logger.debug("Could not resolve repository languages for %s/%s: %s", owner, repo_name, exc)

    # Fetch git tree for metadata inspection (no file content downloaded)
    tree_items: list[dict[str, Any]] = []
    is_truncated = False
    if pinned_sha:
        try:
            tree_items, is_truncated = await github_svc.get_git_tree(owner, repo_name, pinned_sha)
        except Exception as exc:
            logger.warning("Could not fetch git tree: %s", exc)

    meta = RepositoryAnalyzer.analyze_tree(
        tree_items=tree_items,
        owner=owner,
        name=repo_name,
        default_branch=default_branch,
        pinned_sha=pinned_sha,
        is_truncated=is_truncated,
    )
    # Merge any languages detected from API
    if detected_languages:
        merged_langs = sorted(list(set(meta.languages + detected_languages)))
        meta.languages = merged_langs

    meta_dict = meta.model_dump()
    if repo_info.get("description"):
        meta_dict["description"] = repo_info["description"]

    # Check if repository already exists for this user
    stmt = select(Repository).where(
        Repository.owner_id == current_user.id,
        Repository.full_name == repo_info["full_name"],
    )
    result = await db.execute(stmt)
    existing_repo = result.scalar_one_or_none()

    if existing_repo:
        existing_repo.name = repo_info["name"]
        existing_repo.owner_name = repo_info["owner"]
        existing_repo.url = normalized_url
        existing_repo.default_branch = default_branch
        existing_repo.pinned_sha = pinned_sha
        existing_repo.is_private = repo_info["is_private"]
        existing_repo.metadata_json = meta_dict
        await db.commit()
        await db.refresh(existing_repo)
        return RepositoryResponse.model_validate(existing_repo)

    new_repo = Repository(
        owner_id=current_user.id,
        name=repo_info["name"],
        owner_name=repo_info["owner"],
        full_name=repo_info["full_name"],
        url=normalized_url,
        default_branch=default_branch,
        pinned_sha=pinned_sha,
        is_private=repo_info["is_private"],
        metadata_json=meta_dict,
    )
    db.add(new_repo)
    await db.commit()
    await db.refresh(new_repo)
    await invalidate_dashboard_cache(current_user.id)
    return RepositoryResponse.model_validate(new_repo)


@router.get("", response_model=RepositoryListResponse)
async def list_repositories(
    response: Response,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryListResponse:
    """List connected GitHub repositories owned by current user with pagination."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    import math

    # Fast SQL count
    count_stmt = select(func.count(Repository.id)).where(Repository.owner_id == current_user.id)
    total = (await db.execute(count_stmt)).scalar() or 0

    offset = (page - 1) * page_size
    stmt = (
        select(Repository)
        .where(Repository.owner_id == current_user.id)
        .order_by(Repository.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    repos = result.scalars().all()
    pages = math.ceil(total / page_size) if total > 0 else 1

    return RepositoryListResponse(
        items=[RepositoryResponse.model_validate(r) for r in repos],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository(
    repository_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RepositoryResponse:
    """Get single repository by ID. Returns 404 if not found or unauthorized."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Repository).where(Repository.id == repository_id, Repository.owner_id == current_user.id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    return RepositoryResponse.model_validate(repo)


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    repository_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete connected repository and its scans."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    stmt = select(Repository).where(Repository.id == repository_id, Repository.owner_id == current_user.id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
    await db.delete(repo)
    await db.commit()
    await invalidate_dashboard_cache(current_user.id)
