"""
AgentGuard AI — Common Pydantic Schemas.
Shared pagination, filter, and error response schemas.
"""
from __future__ import annotations

from typing import Generic, TypeVar, Optional, Any
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")


class PaginatedResponse(BaseModel, Generic[T]):
    total: int
    page: int
    page_size: int
    pages: int
    items: list[T]


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class StatusResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict[str, Any]] = None
