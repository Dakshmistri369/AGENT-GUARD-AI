"""
Pydantic schemas for repository security scans and reports.
"""
from __future__ import annotations

import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.finding import FindingResponse


class ScanCreate(BaseModel):
    repository_id: str | int = Field(..., description="Target repository ID")
    branch: str | None = Field(default=None, description="Optional branch name to scan")
    scan_type: str | None = Field(default="full", description="Scan type: full or metadata_only")


class ScanTriggerRequest(BaseModel):
    metadata_only: bool = Field(
        default=False,
        description="If True, only perform metadata & tree inspection without cloning or static code analysis."
    )
    branch: str | None = Field(
        default=None,
        description="Optional branch name. If omitted, the default repository branch is analyzed."
    )


class ScanSummaryResponse(BaseModel):
    total_findings: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    scanner_breakdown: dict[str, int] = Field(default_factory=dict)


class ScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str | int
    repository_id: str | int | None = None
    user_id: str | int | None = None
    project_id: str | int | None = None
    status: str  # queued | running | completed | failed | cancelled | timed_out_partial
    stage: str | None = None
    branch: str | None = None
    commit_sha: str | None = None
    scan_type: str | None = "full"
    duration_seconds: float | None = None
    error_message: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    summary: dict[str, Any] | None = None
    scanner_versions: dict[str, Any] | None = None
    configuration: dict[str, Any] | None = None
    files_discovered: int = 0
    files_scanned: int = 0
    files_skipped: int = 0
    skip_manifest: dict[str, Any] | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime | None = None

    @classmethod
    def from_orm_safe(cls, scan: Any) -> "ScanResponse":
        """
        Safely construct a ScanResponse from an ORM Scan instance without risking
        SQLAlchemy MissingGreenlet exceptions from unloaded or deferred attributes.
        """
        from sqlalchemy import inspect as sa_inspect
        try:
            state = sa_inspect(scan)
            unloaded = state.unloaded if state is not None else set()
        except Exception:
            unloaded = set()

        data = {}
        for field_name in cls.model_fields:
            if field_name not in unloaded:
                data[field_name] = getattr(scan, field_name, None)

        return cls.model_validate(data)


class ScanListResponse(BaseModel):
    items: list[ScanResponse]
    total: int
    page: int = 1
    page_size: int = 20
    pages: int = 1


class ScanStatusResponse(BaseModel):
    scan_id: str | int
    status: str
    error_message: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    duration_seconds: float | None = None
    summary: dict[str, Any] | None = None


class ScanReportResponse(BaseModel):
    scan_id: int
    repository_id: int | None = None
    repository_url: str | None = None
    repository_full_name: str | None = None
    commit_sha: str | None = None
    default_branch: str | None = None
    status: str
    stage: str | None = None
    error_message: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    duration_seconds: float | None = None
    metadata: dict[str, Any] | None = None
    files_discovered: int = 0
    files_scanned: int = 0
    files_skipped: int = 0
    skip_manifest: dict[str, Any] | None = None
    summary: ScanSummaryResponse
    findings: list[FindingResponse] = Field(default_factory=list)
    ai_analysis: dict[str, Any] | None = None
    scanners_run: list[dict[str, Any]] = Field(default_factory=list)
    coverage_summary: dict[str, Any] | None = None
    scanner_matrix: dict[str, Any] | None = None
    generated_at: datetime.datetime


class ActiveScanItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repository_id: int | None = None
    repository_name: str
    repository_full_name: str
    status: str
    stage: str | None = None
    commit_sha: str | None = None
    started_at: datetime.datetime | None = None
    created_at: datetime.datetime
    elapsed_seconds: int = 0


class ActiveScansResponse(BaseModel):
    active_count: int
    scans: list[ActiveScanItem]
