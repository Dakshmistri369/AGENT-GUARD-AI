"""
Projects API router — CRUD with demo-user ownership enforcement.

Ownership: all queries filter by current_user.id.
404 is returned (not 403) when a resource belongs to another user,
to avoid leaking the existence of other users' projects.
"""
from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])

MAX_PAGE_SIZE = 100


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    """Create a new project owned by the current user."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    project = Project(
        owner_id=current_user.id,
        name=payload.name,
        description=payload.description,
        language=payload.language,
        framework=payload.framework,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    response: Response,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, description="Items per page (max 100)"),
    schedule_enabled: Optional[bool] = Query(None, description="Filter for scheduled automation"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectListResponse:
    """List projects owned by the current user (paginated, max 100/page)."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"

    # Count
    count_result = await db.execute(
        select(func.count()).select_from(Project).where(Project.owner_id == current_user.id)
    )
    total = count_result.scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    projects = result.scalars().all()
    pages = math.ceil(total / page_size) if total > 0 else 1

    return ProjectListResponse(
        items=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    """Get a single project. Returns 404 if not found OR owned by another user."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    project = await _get_owned_project(project_id, current_user.id, db)
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    """Partially update a project."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    project = await _get_owned_project(project_id, current_user.id, db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a project. Returns 404 if not found OR owned by another user."""
    response.headers["X-Auth-Mode"] = "DEMO - no real authentication active"
    project = await _get_owned_project(project_id, current_user.id, db)
    await db.delete(project)
    await db.commit()


# ── helpers ──────────────────────────────────────────────────────────────────

async def _get_owned_project(
    project_id: int, owner_id: int, db: AsyncSession
) -> Project:
    """
    Return the project if it exists AND is owned by owner_id.
    Return 404 in both not-found and wrong-owner cases to avoid
    leaking resource existence to unauthorized callers.
    """
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
