"""
AgentGuard AI — Scan Artifact Pydantic Schemas.
Models for reports, SARIF exports, scanner logs, and signed storage download URLs.
"""
from __future__ import annotations

import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ArtifactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str | int
    scan_id: str | int
    user_id: str | int
    artifact_type: str  # report | sarif | log | sbom | raw_output
    file_name: str
    storage_bucket: str
    storage_path: str
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    created_at: datetime.datetime


class ArtifactListResponse(BaseModel):
    items: list[ArtifactResponse]
    total: int


class SignedUrlResponse(BaseModel):
    artifact_id: str | int
    file_name: str
    signed_url: str
    expires_in_seconds: int = 600
    storage_bucket: str
    storage_path: str
