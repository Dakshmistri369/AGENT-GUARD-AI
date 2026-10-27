"""
AgentGuard AI — Dashboard Analytics & Summary Schemas.
Provides strictly typed, validated models for the Security Command Center.
"""
from __future__ import annotations

import datetime
from pydantic import BaseModel, ConfigDict, Field


class ScansSummaryMetrics(BaseModel):
    total_scans: int = 0
    scans_last_30_days: int = 0
    pr_reviews: int = 0


class FalsePositivesMetrics(BaseModel):
    count: int = 0
    total_issues: int = 0
    percentage: float = 0.0


class PotentialIssuesMetrics(BaseModel):
    count: int = 0
    total_issues: int = 0


class PatchesGeneratedMetrics(BaseModel):
    count: int = 0
    total_issues: int = 0
    percentage: float = 0.0


class VulnerabilityTypeSlice(BaseModel):
    name: str
    short_name: str
    count: int
    percentage: float
    color: str


class SeverityDistribution(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    total: int = 0


class CriticalIssueItem(BaseModel):
    id: int
    scan_id: int
    repository_id: int | None = None
    repository_name: str | None = None
    title: str
    category: str
    cwe_or_rule: str
    severity: str
    score: int = 100
    file_path: str | None = None
    line_number: int | None = None
    scanner: str
    verification_status: str = "unverified"
    created_at: datetime.datetime


class RepositoryIssueBreakdown(BaseModel):
    repository_id: int
    repository_name: str
    default_branch: str
    total: int
    critical: int
    high: int
    medium: int
    low: int
    info: int


class ScannerHealthItem(BaseModel):
    name: str
    engine_key: str
    status: str  # healthy | operational | fallback | unavailable
    version: str | None = None
    last_run_at: datetime.datetime | None = None
    findings_count: int = 0
    description: str


class OverallMetrics(BaseModel):
    total_time_saved_hours: float = 0.0
    logic_hours: float = 0.0
    traditional_hours: float = 0.0
    total_files_scanned: int = 0
    total_repositories: int = 0


class RecentScanItem(BaseModel):
    id: int
    repository_id: int | None = None
    repository_name: str
    branch: str | None = None
    commit_sha: str | None = None
    status: str
    findings_count: int = 0
    created_at: datetime.datetime
    completed_at: datetime.datetime | None = None


class DashboardSummaryResponse(BaseModel):
    scans_and_reviews: ScansSummaryMetrics
    false_positives: FalsePositivesMetrics
    potential_issues: PotentialIssuesMetrics
    patches_generated: PatchesGeneratedMetrics
    vulnerability_types: list[VulnerabilityTypeSlice]
    severity_distribution: SeverityDistribution
    most_critical_issues: list[CriticalIssueItem]
    issues_by_repository: list[RepositoryIssueBreakdown]
    scanner_health: list[ScannerHealthItem]
    metrics: OverallMetrics
    recent_activity: list[RecentScanItem]


class DashboardMetricsResponse(BaseModel):
    """
    Compact, single-query aggregated metrics for fast dashboard rendering.
    Explicitly marks metrics as unavailable (None) if the database cannot be queried.
    """
    metrics_available: bool = Field(default=True, description="True if database metrics were measured; False if temporarily unavailable")
    error: str | None = Field(default=None, description="Error explanation if metrics are unavailable")
    total_repositories: int | None = Field(default=None, description="Total connected repositories owned by user")
    total_scans: int | None = Field(default=None, description="Total scan jobs for user repositories")
    completed_scans: int | None = Field(default=None, description="Completed scans")
    running_scans: int | None = Field(default=None, description="Currently running scans")
    failed_scans: int | None = Field(default=None, description="Failed scans")
    total_findings: int | None = Field(default=None, description="Total findings across all user repositories")
    critical_findings: int | None = Field(default=None, description="Critical severity findings")
    high_findings: int | None = Field(default=None, description="High severity findings")
    medium_findings: int | None = Field(default=None, description="Medium severity findings")
    low_findings: int | None = Field(default=None, description="Low severity findings")
    info_findings: int | None = Field(default=None, description="Info severity findings")
    false_positives: int | None = Field(default=None, description="Verified false positives")
    potential_issues: int | None = Field(default=None, description="Unverified or confirmed issues")
    patches_available: int | None = Field(default=None, description="Findings with automated fix/remediation")
    computed_at: datetime.datetime = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc))

