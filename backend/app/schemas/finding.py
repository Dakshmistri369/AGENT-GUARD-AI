"""
Pydantic schemas for normalized security scanner findings.
"""
from __future__ import annotations

import datetime
from pydantic import BaseModel, ConfigDict, Field


class FindingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scan_id: int
    scanner: str
    scanner_version: str | None = None
    rule_id: str | None = None
    title: str
    severity: str  # critical | high | medium | low | info
    confidence: str  # high | medium | low
    file_path: str | None = None
    line_number: int | None = None
    column_number: int | None = None
    sanitized_evidence: str | None = None
    explanation: str | None = None
    remediation: str | None = None
    verification_status: str = "unverified"  # unverified | confirmed | resolved | false_positive
    commit_sha: str | None = None
    fingerprint: str | None = None
    created_at: datetime.datetime


class FindingExplanation(BaseModel):
    finding_id: int
    summary: str
    root_cause: str
    remediation_steps: list[str]
    suggested_patch: str | None = None
    uncertainty_notes: str | None = None
