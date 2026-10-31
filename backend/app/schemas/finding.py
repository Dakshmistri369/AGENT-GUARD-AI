"""
Pydantic schemas for normalized security scanner findings.
"""
from __future__ import annotations

import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class FindingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str | int
    scan_id: str | int
    user_id: str | int | None = None
    scanner: str
    scanner_version: str | None = None
    rule_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    severity: str  # critical | high | medium | low | info | unknown
    confidence: str = "medium"  # high | medium | low
    file_path: str | None = None
    line_start: int | None = None
    line_number: int | None = None
    line_end: int | None = None
    column_number: int | None = None
    code_snippet: str | None = None
    location_type: str | None = None
    cwe: str | None = None
    cve: str | None = None
    package_name: str | None = None
    package_version: str | None = None
    fixed_version: str | None = None
    sanitized_evidence: str | None = None
    explanation: str | None = None
    remediation: str | None = None
    ai_explanation: str | None = None
    ai_impact: str | None = None
    ai_remediation: str | None = None
    ai_model: str | None = None
    verification_status: str = "unverified"  # unverified | confirmed | resolved | false_positive
    classification: str | None = None  # confirmed_secret | likely_placeholder | needs_review
    classification_reason: str | None = None
    secret_redacted_preview: str | None = None
    commit_sha: str | None = None
    fingerprint: str | None = None
    raw: dict | None = None
    created_at: datetime.datetime

    def model_post_init(self, __context: Any) -> None:
        if self.line_start is None and self.line_number is not None:
            self.line_start = self.line_number
        if self.line_number is None and self.line_start is not None:
            self.line_number = self.line_start
        if not self.description and self.explanation:
            self.description = self.explanation


class FindingListResponse(BaseModel):
    items: list[FindingResponse]
    total: int
    page: int = 1
    page_size: int = 50
    pages: int = 1


class FindingFilterParams(BaseModel):
    severity: str | None = None
    scanner: str | None = None
    category: str | None = None
    file_path: str | None = None
    package_name: str | None = None
    page: int = 1
    page_size: int = 50


class FindingExplanation(BaseModel):
    finding_id: int
    summary: str
    root_cause: str
    remediation_steps: list[str]
    suggested_patch: str | None = None
    uncertainty_notes: str | None = None


class UpdateFindingStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(unverified|confirmed|resolved|false_positive)$")
    notes: str | None = None

