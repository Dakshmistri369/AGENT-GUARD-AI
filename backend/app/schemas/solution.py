"""
AgentGuard AI — Solution Schemas.
Data transfer models for automated remediation patches, dependency upgrade CLI commands,
code diffs, and repository-wide fix plans.
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


SolutionType = Literal["code_diff", "dependency_upgrade", "secret_removal", "security_config"]


class FindingSolution(BaseModel):
    """Concrete remediation solution for a single security finding."""
    finding_id: int
    title: str
    severity: str
    scanner: str
    rule_id: str | None = None
    file_path: str | None = None
    line_number: int | None = None
    solution_type: SolutionType = "code_diff"
    action_summary: str
    cli_command: str | None = None
    before_code: str | None = None
    after_code: str | None = None
    diff: str | None = None
    explanation: str
    verification_step: str
    is_automated_patch: bool = True
    model_used: str | None = None


class FileSolutionGroup(BaseModel):
    """Aggregated solutions and unified patch for a single repository file."""
    file_path: str
    findings_count: int
    solutions: list[FindingSolution]
    combined_patch: str | None = None


class RepositorySolutionPlan(BaseModel):
    """Consolidated remediation plan for all findings detected in a repository scan."""
    scan_id: int
    repository_id: int | None = None
    total_solutions: int = 0
    code_diffs_count: int = 0
    dependency_upgrades_count: int = 0
    secret_removals_count: int = 0
    quick_fix_cli_commands: list[str] = Field(default_factory=list)
    file_groups: list[FileSolutionGroup] = Field(default_factory=list)
    full_unified_patch: str | None = None
    solutions: list[FindingSolution] = Field(default_factory=list)
