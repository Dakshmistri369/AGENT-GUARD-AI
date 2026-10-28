"""
Pydantic schemas for repository security scans and reports.
"""
from __future__ import annotations

import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.finding import FindingResponse


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
    model_config = ConfigDict(from_attributes=True)

    id: int
    repository_id: int | None = None
    project_id: int | None = None
    status: str  # pending | running | completed | failed | cancelled
    stage: str | None = None  # validating | fetching_metadata | inspecting_file_tree | running_scanners | reviewing_evidence | generating_report | completed
    commit_sha: str | None = None
    error_message: str | None = None
    started_at: datetime.datetime | None = None
    completed_at: datetime.datetime | None = None
    summary: dict[str, Any] | None = None
    configuration: dict[str, Any] | None = None
    files_discovered: int = 0
    files_scanned: int = 0
    files_skipped: int = 0
    skip_manifest: dict[str, Any] | None = None
    created_at: datetime.datetime


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
