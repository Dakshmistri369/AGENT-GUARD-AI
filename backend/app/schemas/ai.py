"""AgentGuard AI — Schemas for AI Threat Analysis, Test Planning, and Finding Explanations."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class ThreatItem(BaseModel):
    id: str = Field(..., description="Unique threat identifier e.g. T-01")
    title: str = Field(..., description="Concise threat title")
    category: str = Field(..., description="Threat classification, e.g. STRIDE or OWASP category")
    severity: Literal["critical", "high", "medium", "low", "info"] = Field(..., description="Threat severity")
    attack_vector: str = Field(..., description="Vector or entry point exploited")
    description: str = Field(..., description="In-depth explanation of the threat scenario")
    mitigation: str = Field(..., description="Recommended defensive control or mitigation")


class ThreatAnalysisRequest(BaseModel):
    context: str = Field(..., min_length=5, description="High-level description, architecture, or specification")
    source_code: str | None = Field(None, description="Optional snippet or source code to analyze")
    language: str | None = Field("python", description="Programming language (e.g. python, javascript, go)")
    framework: str | None = Field(None, description="Framework (e.g. fastapi, flask, react, express)")


class ThreatAnalysisResponse(BaseModel):
    summary: str = Field(..., description="Executive summary of threat landscape")
    threats: list[ThreatItem] = Field(default_factory=list, description="List of identified threats")
    model_used: str = Field(..., description="Nemotron or mock model identifier")


class SecurityTestCase(BaseModel):
    id: str = Field(..., description="Test case ID e.g. TC-01")
    title: str = Field(..., description="Name of test case")
    test_type: str = Field(..., description="DAST / SAST / Fuzz / Unit / Integration")
    precondition: str = Field(..., description="System state or setup required")
    attack_payload: str = Field(..., description="Exploit or malformed input payload")
    expected_secure_behavior: str = Field(..., description="Expected safe system response")
    test_code: str | None = Field(None, description="Automated test script snippet (e.g. pytest, curl, bash)")


class TestPlanningRequest(BaseModel):
    __test__ = False
    threat_context: str = Field(..., min_length=5, description="Threat description or finding context")
    target_code: str | None = Field(None, description="Relevant code or API signature under test")
    test_type: str | None = Field("automated", description="Type of test plan (automated, dynamic, static)")


class TestPlanningResponse(BaseModel):
    __test__ = False
    overview: str = Field(..., description="Test strategy and scope overview")
    test_cases: list[SecurityTestCase] = Field(default_factory=list, description="Generated security test cases")
    execution_guidelines: str = Field(..., description="Guidelines for executing tests in sandboxed environment")
    model_used: str = Field(..., description="Model identifier used to produce test plan")


class ExplainFindingRequest(BaseModel):
    title: str = Field(..., min_length=3, description="Finding title")
    severity: Literal["critical", "high", "medium", "low", "info"] = Field("medium", description="Finding severity")
    scanner: str = Field("semgrep", description="Scanner that detected the finding")
    rule_id: str | None = Field(None, description="Scanner rule identifier")
    file_path: str | None = Field(None, description="Target file path")
    line_number: int | None = Field(None, description="Line number in source file")
    sanitized_evidence: str | None = Field(None, description="Sanitized source snippet or log line")


class FindingExplanationResponse(BaseModel):
    summary: str = Field(..., description="Plain-language explanation of what went wrong")
    root_cause: str = Field(..., description="Root cause technical breakdown")
    impact: str = Field(..., description="Potential real-world impact if exploited")
    remediation: str = Field(..., description="Step-by-step remediation instructions")
    fix_example: str | None = Field(None, description="Before/after code fix example")
    verification_steps: str = Field(..., description="How to confirm the vulnerability is resolved")
    model_used: str = Field(..., description="Model identifier used")


class AIStatusResponse(BaseModel):
    provider: str
    model: str
    configured: bool
    healthy: bool
    latency_ms: float | None = None
    detail: str | None = None


class MultiAgentAuditRequest(BaseModel):
    repo_metadata: dict = Field(default_factory=dict, description="Inspected repository metadata")
    scanner_findings: list[dict] = Field(default_factory=list, description="Actual security scanner findings")


class MultiAgentAuditResponse(BaseModel):
    status: str
    message: str
    model_used: str | None = None
    threat_model: dict | None = None
    test_strategy: dict | None = None
    evidence_analysis: dict | None = None
    remediation_plan: dict | None = None
    executive_summary: str | None = None
    audit_trace: list[dict] = Field(default_factory=list)
    is_fallback: bool = False
