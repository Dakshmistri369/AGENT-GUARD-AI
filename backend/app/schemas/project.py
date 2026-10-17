"""Pydantic schemas for Project endpoints."""
from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, max_length=2000)
    language: Optional[str] = Field(None, max_length=64)
    framework: Optional[str] = Field(None, max_length=64)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Project name cannot be blank")
        return v.strip()


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    language: Optional[str] = Field(None, max_length=64)
    framework: Optional[str] = Field(None, max_length=64)


class ProjectResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: Optional[str]
    language: Optional[str]
    framework: Optional[str]
    source_hash: Optional[str]
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int
    pages: int
