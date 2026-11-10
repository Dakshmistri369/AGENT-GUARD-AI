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


# ── Generative UI & Intelligence Schemas ──────────────────────────────────────────

class CveRemediationWidgetData(BaseModel):
    cve_id: str = Field(..., description="CVE or GHSA Identifier")
    title: str = Field(..., description="Vulnerability title")
    cvss_score: float = Field(..., description="CVSS base score 0.0 - 10.0")
    cvss_vector: str | None = Field(None, description="CVSS vector string")
    severity: Literal["critical", "high", "medium", "low", "info"] = Field("high", description="Severity category")
    ecosystem: str = Field("npm", description="Package ecosystem e.g. npm, PyPI, Go, Maven")
    package_name: str = Field(..., description="Vulnerable package or component name")
    vulnerable_range: str = Field(..., description="Affected version range e.g. < 1.4.2")
    fixed_version: str = Field(..., description="Fixed version or patch release e.g. >= 1.4.2")
    cwe: str | None = Field(None, description="Common Weakness Enumeration ID & Name")
    epss_score: float | None = Field(None, description="EPSS exploit prediction probability (0.0 - 1.0)")
    summary: str = Field(..., description="Concise synopsis of the advisory")
    mitigation_steps: list[str] = Field(default_factory=list, description="Remediation actions")
    references: list[str] = Field(default_factory=list, description="Advisory URLs and docs")


class PatchDiffWidgetData(BaseModel):
    file_path: str = Field(..., description="Relative file path in repository")
    language: str = Field("python", description="Language syntax for highlighter")
    diff_unified: str = Field(..., description="Unified git diff syntax")
    original_snippet: str = Field(..., description="Before code snippet")
    fixed_snippet: str = Field(..., description="After remediated code snippet")
    line_start: int = Field(1, description="Starting line number")
    explanation: str = Field(..., description="AST explanation of why this fix is safe")
    verification_cmd: str | None = Field(None, description="Command to verify fix in sandbox")


class AstTaintStep(BaseModel):
    step_number: int
    title: str
    description: str
    code_snippet: str
    node_type: str
    is_tainted: bool = True


class AstTaintFlowWidgetData(BaseModel):
    vulnerability_type: str = Field(..., description="Vulnerability category e.g. SQL Injection, RCE")
    cwe_id: str = Field(..., description="CWE identifier e.g. CWE-89")
    source_node: dict = Field(..., description="Untrusted entry point / source node")
    taint_steps: list[AstTaintStep] = Field(default_factory=list, description="Intermediate AST data flow steps")
    sink_node: dict = Field(..., description="Dangerous sink AST node")
    sanitizer_recommendation: dict = Field(..., description="Sanitization / boundary enforcement fix")


class AuditAgentStatus(BaseModel):
    name: str
    status: Literal["completed", "running", "verified", "fallback", "pending"] = "completed"
    details: str
    execution_time_ms: int = 120


class AuditHudWidgetData(BaseModel):
    repo_name: str | None = Field(None, description="Target repository name")
    active_agents: list[AuditAgentStatus] = Field(default_factory=list)
    confidence_score: int = Field(92, description="Verification confidence score 0-100")
    scanner_coverage: dict[str, str] = Field(default_factory=dict)
    threat_tally: dict[str, int] = Field(default_factory=dict)
    recommendation_count: int = 0


class GenerativeWidgetPayload(BaseModel):
    widget_type: Literal["cve_remediation", "patch_diff", "ast_taint_flow", "audit_hud", "none"] = "none"
    cve_remediation: CveRemediationWidgetData | None = None
    patch_diff: PatchDiffWidgetData | None = None
    ast_taint_flow: AstTaintFlowWidgetData | None = None
    audit_hud: AuditHudWidgetData | None = None


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User query or prompt")
    repo_id: int | None = Field(None, description="Active repository ID")
    repo_name: str | None = Field(None, description="Active repository name")
    finding_id: int | None = Field(None, description="Contextual finding ID")
    history: list[dict] = Field(default_factory=list, description="Prior conversation messages")
    enable_web_intel: bool = Field(True, description="Enable live OSV/CVE web intelligence lookups")


class AIChatResponse(BaseModel):
    reply: str = Field(..., description="AI conversational markdown response")
    widget: GenerativeWidgetPayload | None = Field(None, description="Inline generative UI widget data")
    model_used: str = Field(..., description="Active AI model")
    web_intel_sources: list[str] = Field(default_factory=list, description="Web/CVE sources consulted")
    suggested_prompts: list[str] = Field(default_factory=list, description="Contextual follow-up suggestions")


class CveLookupResponse(BaseModel):
    cve_id: str
    found: bool
    summary: str
    severity: str
    cvss_score: float | None = None
    cvss_vector: str | None = None
    details: str
    affected_packages: list[dict] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    fix_guidance: str
    remediation_widget: CveRemediationWidgetData | None = None


class AdvisorySearchRequest(BaseModel):
    package_name: str = Field(..., min_length=1)
    ecosystem: str = Field("npm", description="npm, PyPI, Go, Maven, Cargo")


class AdvisorySearchResponse(BaseModel):
    package_name: str
    ecosystem: str
    vulnerabilities: list[CveRemediationWidgetData] = Field(default_factory=list)
    total_found: int = 0

