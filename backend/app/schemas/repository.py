"""
Pydantic schemas for GitHub repository endpoints.
"""
from __future__ import annotations

import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class RepositoryValidateRequest(BaseModel):
    url: str = Field(..., description="GitHub repository HTTPS URL")


class RepositoryValidateResponse(BaseModel):
    valid: bool
    owner: str | None = None
    name: str | None = None
    normalized_url: str | None = None
    error: str | None = None


class RepositoryCreate(BaseModel):
    url: str = Field(..., description="GitHub repository HTTPS URL")


class RepositoryMetadata(BaseModel):
    owner: str
    name: str
    default_branch: str
    pinned_sha: str | None = None
    file_count: int = 0
    directory_count: int = 0
    languages: list[str] = Field(default_factory=list)
    extensions: list[str] = Field(default_factory=list)
    manifests: list[str] = Field(default_factory=list)
    test_directories: list[str] = Field(default_factory=list)
    config_files: list[str] = Field(default_factory=list)
    workflow_files: list[str] = Field(default_factory=list)
    size_kb: int = 0
    is_incomplete: bool = False


class RepositoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    owner_name: str
    full_name: str
    url: str
    default_branch: str
    pinned_sha: str | None = None
    is_private: bool = False
    metadata_json: dict[str, Any] | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class RepositoryListResponse(BaseModel):
    items: list[RepositoryResponse]
    total: int
    page: int = 1
    page_size: int = 50
    pages: int = 1
