"""
AgentGuard AI — LangGraph Multi-Agent Security Audit Orchestrator.
Orchestrates four logical agents:
1. Threat Modeler: Identifies architectural threat landscape and STRIDE categories.
2. Test Strategist: Formulates verification test cases, boundary payloads, and reproduction steps.
3. Evidence Analyst: Evaluates actual scanner findings, filters false positives, and verifies evidence.
4. Remediation Verifier: Generates safe remediation guidance and defines mandatory verification criteria.

Strict Security Constraints:
- Treats repository context as untrusted data using delimiter tags.
- Prohibits shell execution and arbitrary command running.
- Strictly grounds verification: No vulnerability or fix can be declared verified without evidence.
- Size-limits and redacts all context and scanner findings.
- Gracefully falls back when API key is unconfigured or calls fail/timeout.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.ai.client import BaseAIClient, clean_json_response, get_ai_client
from app.ai.prompts import (
    EVIDENCE_ANALYST_SYSTEM_PROMPT,
    REMEDIATION_VERIFIER_SYSTEM_PROMPT,
    TEST_STRATEGIST_SYSTEM_PROMPT,
    THREAT_MODELER_SYSTEM_PROMPT,
)
from app.config import Settings, get_settings
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.ai.langgraph")

# Maximum characters allowed for untrusted repository context
MAX_UNTRUSTED_CONTEXT_CHARS = 10000
# Maximum findings passed to LLM reasoning nodes
MAX_FINDINGS_IN_PROMPT = 8


class SecurityAnalysisState(TypedDict):
    """LangGraph shared state across the four logical agents."""
    repo_metadata: dict[str, Any]
    scanner_findings: list[dict[str, Any]]
    untrusted_context: str

    # Logical Agent Outputs
    threat_model: dict[str, Any] | None
    test_strategy: dict[str, Any] | None
    evidence_analysis: dict[str, Any] | None
    remediation_plan: dict[str, Any] | None

    # Audit & Status
    executive_summary: str | None
    audit_trace: list[dict[str, Any]]
    errors: list[str]
    status: str
    model_used: str | None
    is_fallback: bool


def prepare_sanitized_context(repo_metadata: dict[str, Any], max_chars: int = MAX_UNTRUSTED_CONTEXT_CHARS) -> str:
    """
    Format relevant, size-limited, and redacted repository context.
    Treats input strictly as third-party untrusted data.
    """
    lines = [
        f"Repository: {repo_metadata.get('owner', 'unknown')}/{repo_metadata.get('name', 'unknown')}",
        f"Default Branch: {repo_metadata.get('default_branch', 'main')}",
        f"Total Files Analyzed: {repo_metadata.get('total_files', 0)}",
        f"Primary Languages: {', '.join(repo_metadata.get('languages', []))}",
        f"File Extensions: {', '.join(repo_metadata.get('extensions', []))}",
        f"Detected Manifests: {', '.join(repo_metadata.get('manifests', []))}",
        f"Detected Configs: {', '.join(repo_metadata.get('config_files', []))}",
        f"Test Directories: {', '.join(repo_metadata.get('test_directories', []))}",
    ]
    raw_context = "\n".join(lines)
    sanitized = redact_sensitive_text(raw_context)
    return sanitized[:max_chars]


def prepare_sanitized_findings(
    findings: list[dict[str, Any]],
    max_findings: int = MAX_FINDINGS_IN_PROMPT,
) -> list[dict[str, Any]]:
    """
    Sort findings by severity and sanitize evidence snippets before LLM ingestion.
    """
    sorted_findings = sorted(
        findings,
        key=lambda x: {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(
            x.get("severity", "info"), 5
        ),
    )[:max_findings]

    sanitized = []
    for f in sorted_findings:
        evidence = redact_sensitive_text(f.get("sanitized_evidence", "") or "")
        sanitized.append({
            "finding_id": f.get("fingerprint") or f.get("rule_id", "F-00"),
            "scanner": f.get("scanner", "unknown"),
            "rule_id": f.get("rule_id", "N/A"),
            "title": f.get("title", "Unnamed finding"),
            "severity": f.get("severity", "medium"),
            "confidence": f.get("confidence", "medium"),
            "file_path": f.get("file_path", "unknown"),
            "line_number": f.get("line_number"),
            "evidence_snippet": evidence[:250],
            "explanation": f.get("explanation", "")[:200],
        })
    return sanitized


class LangGraphSecurityOrchestrator:
    """
    Coordinates four logical agents (Threat Modeler, Test Strategist,
    Evidence Analyst, Remediation Verifier) using LangGraph StateGraph.
    """

    def __init__(self, client: BaseAIClient | None = None, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = client or get_ai_client(self._settings)
        self._graph = self._build_graph()

    def is_ai_configured(self) -> bool:
        """Check if real Nemotron or mock AI provider is configured."""
        if self._settings.ai_provider == "mock":
            return True
        if self._settings.ai_provider == "nemotron":
            return bool(self._settings.ai_api_key and self._settings.ai_base_url)
        return False

    def _build_graph(self) -> Any:
        """Construct the compiled LangGraph workflow connecting the 4 agents."""
        workflow = StateGraph(SecurityAnalysisState)

        workflow.add_node("threat_modeler", self._threat_modeler_node)
        workflow.add_node("test_strategist", self._test_strategist_node)
        workflow.add_node("evidence_analyst", self._evidence_analyst_node)
        workflow.add_node("remediation_verifier", self._remediation_verifier_node)

        workflow.add_edge(START, "threat_modeler")
        workflow.add_edge("threat_modeler", "test_strategist")
        workflow.add_edge("test_strategist", "evidence_analyst")
        workflow.add_edge("evidence_analyst", "remediation_verifier")
        workflow.add_edge("remediation_verifier", END)

        return workflow.compile()

    # ── Agent 1: Threat Modeler ─────────────────────────────────────────────
    async def _threat_modeler_node(self, state: SecurityAnalysisState) -> dict[str, Any]:
        start = time.time()
        logger.info("LangGraph Agent 1/4: Threat Modeler executing...")
        audit_trace = list(state.get("audit_trace", []))
        errors = list(state.get("errors", []))

        user_content = (
            "Analyze the following repository architecture and manifests for STRIDE threat modeling:\n"
            f"<untrusted_repo_context>\n{state['untrusted_context']}\n</untrusted_repo_context>\n"
        )
        messages = [
            {"role": "system", "content": THREAT_MODELER_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        threat_model = None
        try:
            raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1200)
            cleaned = clean_json_response(raw_output)
            threat_model = json.loads(cleaned)
        except Exception as exc:
            logger.warning("Threat Modeler agent failed or output was invalid: %s", exc)
            errors.append(f"Threat Modeler error: {exc}")
            threat_model = self._deterministic_threat_model(state)

        duration = round(time.time() - start, 2)
        audit_trace.append({
            "agent": "Threat Modeler",
            "status": "completed",
            "duration_seconds": duration,
            "threat_scenarios_count": len(threat_model.get("threat_scenarios", [])) if threat_model else 0,
        })
        return {
            "threat_model": threat_model,
            "audit_trace": audit_trace,
            "errors": errors,
        }

    # ── Agent 2: Test Strategist ─────────────────────────────────────────────
    async def _test_strategist_node(self, state: SecurityAnalysisState) -> dict[str, Any]:
        start = time.time()
        logger.info("LangGraph Agent 2/4: Test Strategist executing...")
        audit_trace = list(state.get("audit_trace", []))
        errors = list(state.get("errors", []))

        tm_json = json.dumps(state.get("threat_model", {}), indent=2)
        user_content = (
            "Formulate an automated security verification test plan for this Threat Model:\n"
            f"<threat_model>\n{tm_json}\n</threat_model>\n"
            f"<untrusted_repo_context>\n{state['untrusted_context']}\n</untrusted_repo_context>\n"
        )
        messages = [
            {"role": "system", "content": TEST_STRATEGIST_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        test_strategy = None
        try:
            raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1200)
            cleaned = clean_json_response(raw_output)
            test_strategy = json.loads(cleaned)
        except Exception as exc:
            logger.warning("Test Strategist agent failed or output was invalid: %s", exc)
            errors.append(f"Test Strategist error: {exc}")
            test_strategy = self._deterministic_test_strategy(state)

        duration = round(time.time() - start, 2)
        audit_trace.append({
            "agent": "Test Strategist",
            "status": "completed",
            "duration_seconds": duration,
            "test_cases_count": len(test_strategy.get("test_cases", [])) if test_strategy else 0,
        })
        return {
            "test_strategy": test_strategy,
            "audit_trace": audit_trace,
            "errors": errors,
        }

    # ── Agent 3: Evidence Analyst ───────────────────────────────────────────
    async def _evidence_analyst_node(self, state: SecurityAnalysisState) -> dict[str, Any]:
        start = time.time()
        logger.info("LangGraph Agent 3/4: Evidence Analyst executing...")
        audit_trace = list(state.get("audit_trace", []))
        errors = list(state.get("errors", []))

        sanitized_findings = prepare_sanitized_findings(state.get("scanner_findings", []))
        findings_json = json.dumps(sanitized_findings, indent=2)

        user_content = (
            "Evaluate these actual scanner findings against code evidence and the threat model:\n"
            f"<actual_scanner_findings>\n{findings_json}\n</actual_scanner_findings>\n"
            f"<untrusted_repo_context>\n{state['untrusted_context']}\n</untrusted_repo_context>\n"
        )
        messages = [
            {"role": "system", "content": EVIDENCE_ANALYST_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        evidence_analysis = None
        try:
            raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1400)
            cleaned = clean_json_response(raw_output)
            evidence_analysis = json.loads(cleaned)
        except Exception as exc:
            logger.warning("Evidence Analyst agent failed or output was invalid: %s", exc)
            errors.append(f"Evidence Analyst error: {exc}")
            evidence_analysis = self._deterministic_evidence_analysis(state, sanitized_findings)

        # Enforce Grounding Constraint:
        # Guarantee no finding is marked 'verified' unless evidence is non-empty
        eval_findings = evidence_analysis.get("evaluated_findings", [])
        verified_c = 0
        unverified_c = 0
        for ef in eval_findings:
            v_status = ef.get("verification_status", "unverified")
            if v_status == "verified" and not ef.get("verified_evidence"):
                # Missing concrete evidence -> revert to unverified
                ef["verification_status"] = "unverified"
                ef["evidence_assessment"] = "Reverted to unverified: insufficient direct proof in scanner trace."
            if ef.get("verification_status") == "verified":
                verified_c += 1
            else:
                unverified_c += 1

        evidence_analysis["verified_findings_count"] = verified_c
        evidence_analysis["unverified_findings_count"] = unverified_c

        duration = round(time.time() - start, 2)
        audit_trace.append({
            "agent": "Evidence Analyst",
            "status": "completed",
            "duration_seconds": duration,
            "evaluated_findings_count": len(eval_findings),
            "verified_count": verified_c,
            "unverified_count": unverified_c,
        })
        return {
            "evidence_analysis": evidence_analysis,
            "audit_trace": audit_trace,
            "errors": errors,
        }

    # ── Agent 4: Remediation Verifier ───────────────────────────────────────
    async def _remediation_verifier_node(self, state: SecurityAnalysisState) -> dict[str, Any]:
        start = time.time()
        logger.info("LangGraph Agent 4/4: Remediation Verifier executing...")
        audit_trace = list(state.get("audit_trace", []))
        errors = list(state.get("errors", []))

        analyst_out = json.dumps(state.get("evidence_analysis", {}), indent=2)
        test_out = json.dumps(state.get("test_strategy", {}), indent=2)

        user_content = (
            "Synthesize actionable remediations and mandatory verification criteria based on:\n"
            f"<evidence_analysis>\n{analyst_out}\n</evidence_analysis>\n"
            f"<test_strategy>\n{test_out}\n</test_strategy>\n"
        )
        messages = [
            {"role": "system", "content": REMEDIATION_VERIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        remediation_plan = None
        try:
            raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1400)
            cleaned = clean_json_response(raw_output)
            remediation_plan = json.loads(cleaned)
        except Exception as exc:
            logger.warning("Remediation Verifier agent failed or output was invalid: %s", exc)
            errors.append(f"Remediation Verifier error: {exc}")
            remediation_plan = self._deterministic_remediation_plan(state)

        # Enforce Fix Verification Constraint:
        # All proposed remediations MUST be marked 'unverified' pending actual execution
        for action in remediation_plan.get("remediation_actions", []):
            action["verification_status"] = "unverified"

        exec_summary = remediation_plan.get(
            "executive_remediation_summary",
            "Multi-agent security audit completed. All findings grounded on evidence."
        )

        duration = round(time.time() - start, 2)
        audit_trace.append({
            "agent": "Remediation Verifier",
            "status": "completed",
            "duration_seconds": duration,
            "remediation_actions_count": len(remediation_plan.get("remediation_actions", [])),
        })
        return {
            "remediation_plan": remediation_plan,
            "executive_summary": exec_summary,
            "audit_trace": audit_trace,
            "errors": errors,
        }

    # ── Main Entrypoint ─────────────────────────────────────────────────────
    async def run_security_audit(
        self,
        repo_metadata: dict[str, Any],
        scanner_findings: list[dict[str, Any]],
        timeout_seconds: int = 120,
    ) -> dict[str, Any]:
        """
        Execute the 4-agent LangGraph workflow.
        Returns unified audit report matching AgentGuard AI schemas.
        """
        if not self.is_ai_configured():
            return {
                "status": "not_configured",
                "message": "AI multi-agent audit is not configured. Set NVIDIA_API_KEY to enable.",
                "model_used": None,
                "threat_model": None,
                "test_strategy": None,
                "evidence_analysis": None,
                "remediation_plan": None,
                "executive_summary": None,
                "audit_trace": [],
                "is_fallback": True,
            }

        untrusted_ctx = prepare_sanitized_context(repo_metadata)
        initial_state: SecurityAnalysisState = {
            "repo_metadata": repo_metadata,
            "scanner_findings": scanner_findings,
            "untrusted_context": untrusted_ctx,
            "threat_model": None,
            "test_strategy": None,
            "evidence_analysis": None,
            "remediation_plan": None,
            "executive_summary": None,
            "audit_trace": [],
            "errors": [],
            "status": "in_progress",
            "model_used": self._client.model_name,
            "is_fallback": False,
        }

        try:
            final_state = await asyncio.wait_for(
                self._graph.ainvoke(initial_state),
                timeout=timeout_seconds,
            )
            is_fallback = bool(final_state.get("errors"))
            return {
                "status": "completed" if not is_fallback else "completed_with_fallback",
                "message": "Multi-agent security audit completed successfully.",
                "model_used": self._client.model_name,
                "threat_model": final_state.get("threat_model"),
                "test_strategy": final_state.get("test_strategy"),
                "evidence_analysis": final_state.get("evidence_analysis"),
                "remediation_plan": final_state.get("remediation_plan"),
                "executive_summary": final_state.get("executive_summary"),
                "audit_trace": final_state.get("audit_trace", []),
                "errors": final_state.get("errors", []),
                "is_fallback": is_fallback,
            }
        except asyncio.TimeoutError:
            logger.error("LangGraph multi-agent security audit timed out after %ds", timeout_seconds)
            fallback_tm = self._deterministic_threat_model(initial_state)
            fallback_ts = self._deterministic_test_strategy(initial_state)
            fallback_ea = self._deterministic_evidence_analysis(initial_state, prepare_sanitized_findings(scanner_findings))
            fallback_rp = self._deterministic_remediation_plan(initial_state)
            return {
                "status": "completed_with_fallback",
                "message": f"Multi-agent audit timed out after {timeout_seconds}s; fallback results returned.",
                "model_used": self._client.model_name,
                "threat_model": fallback_tm,
                "test_strategy": fallback_ts,
                "evidence_analysis": fallback_ea,
                "remediation_plan": fallback_rp,
                "executive_summary": "Audit completed via deterministic heuristic fallback due to LLM invocation timeout.",
                "audit_trace": [{"agent": "TimeoutHandler", "status": "timed_out", "duration_seconds": timeout_seconds}],
                "errors": [f"Execution exceeded {timeout_seconds}s timeout."],
                "is_fallback": True,
            }
        except Exception as exc:
            logger.error("LangGraph execution failed: %s", exc)
            fallback_tm = self._deterministic_threat_model(initial_state)
            fallback_ts = self._deterministic_test_strategy(initial_state)
            fallback_ea = self._deterministic_evidence_analysis(initial_state, prepare_sanitized_findings(scanner_findings))
            fallback_rp = self._deterministic_remediation_plan(initial_state)
            return {
                "status": "completed_with_fallback",
                "message": f"Multi-agent audit encountered an error ({exc}); fallback results returned.",
                "model_used": self._client.model_name,
                "threat_model": fallback_tm,
                "test_strategy": fallback_ts,
                "evidence_analysis": fallback_ea,
                "remediation_plan": fallback_rp,
                "executive_summary": "Deterministic audit fallback generated following an unhandled error.",
                "audit_trace": [{"agent": "ErrorHandler", "status": "fallback", "error": str(exc)}],
                "errors": [str(exc)],
                "is_fallback": True,
            }

    # ── Deterministic Heuristics (Fallback & Mock Provider) ─────────────────
    def _deterministic_threat_model(self, state: SecurityAnalysisState) -> dict[str, Any]:
        meta = state.get("repo_metadata", {})
        langs = meta.get("languages", ["Unknown"])
        manifests = meta.get("manifests", [])

        scenarios = []
        if any("requirements" in m or "Python" in langs for m in manifests):
            scenarios.append({
                "id": "TM-01",
                "stride_category": "Tampering",
                "title": "Unsafe Dynamic Code Execution & Deserialization",
                "attack_vector": "Untrusted input reaching eval() or pickle.loads()",
                "impact": "Arbitrary remote code execution on the host server",
                "recommended_countermeasure": "Enforce ast.literal_eval and reject arbitrary code execution sinks.",
            })
        if any("package.json" in m or "JavaScript" in langs for m in manifests):
            scenarios.append({
                "id": "TM-02",
                "stride_category": "Elevation of Privilege",
                "title": "Prototype Pollution & Dependency Supply Chain Vulnerability",
                "attack_vector": "Recursive object merge with untrusted user properties",
                "impact": "Object property injection leading to authentication bypass",
                "recommended_countermeasure": "Freeze Object.prototype and audit npm lockfile vulnerabilities.",
            })
        scenarios.append({
            "id": "TM-03",
            "stride_category": "Information Disclosure",
            "title": "Hardcoded Credential & API Secret Leakage",
            "attack_vector": "Committed access keys or tokens inspected in version control",
            "impact": "Direct compromise of cloud provider resources or GitHub account",
            "recommended_countermeasure": "Employ detect-secrets pre-commit hooks and external vault management.",
        })

        return {
            "threat_model_summary": f"Threat analysis for {meta.get('owner', '')}/{meta.get('name', 'repository')} ({', '.join(langs)}).",
            "attack_surfaces": ["Public API HTTP endpoints", "Third-party dependency manifests", "Environment configurations"],
            "critical_assets": ["Database credentials", "API tokens", "User authentication session cookies"],
            "threat_scenarios": scenarios,
        }

    def _deterministic_test_strategy(self, state: SecurityAnalysisState) -> dict[str, Any]:
        return {
            "strategy_overview": "Comprehensive automated testing strategy covering boundary fuzzing, dependency verification, and secret scanning.",
            "test_cases": [
                {
                    "id": "TC-01",
                    "threat_id": "TM-01",
                    "title": "Boundary Code Injection Payload Test",
                    "test_type": "DAST",
                    "target_component": "Input parsers and execution endpoints",
                    "attack_payload": "__import__('os').system('id')",
                    "expected_secure_behavior": "Input rejected with validation error (HTTP 400/422)",
                    "automated_test_code": "def test_eval_injection():\n    r = client.post('/api/run', json={'cmd': '__import__(\"os\")'})\n    assert r.status_code in [400, 422]",
                },
                {
                    "id": "TC-02",
                    "threat_id": "TM-03",
                    "title": "Credential Pattern Negative Assertion",
                    "test_type": "SAST",
                    "target_component": "Source repository and configuration files",
                    "attack_payload": "N/A (Static Inspection)",
                    "expected_secure_behavior": "Zero raw credential strings matching standard token prefixes",
                    "automated_test_code": "def test_no_hardcoded_secrets():\n    assert not any('ghp_' in f for f in repo_files)",
                },
            ],
            "verification_gates": [
                "Zero Critical/High findings in Bandit and Semgrep SAST",
                "All dependencies free of known CVEs (CVSS >= 7.0)",
            ],
        }

    def _deterministic_evidence_analysis(
        self,
        state: SecurityAnalysisState,
        sanitized_findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        evaluated = []
        verified_count = 0
        unverified_count = 0

        for f in sanitized_findings:
            title = f.get("title", "")
            snippet = f.get("evidence_snippet", "")

            # Evidence evaluation
            has_strong_evidence = bool(snippet and len(snippet.strip()) > 5)
            # Default to unverified unless strong reproducible evidence exists
            if has_strong_evidence and any(k in title.lower() for k in ["secret", "eval", "token"]):
                status = "verified"
                verified_count += 1
                exploitability = "high"
                assessment = f"Direct line snippet confirms active pattern in {f.get('file_path')} at line {f.get('line_number')}."
            else:
                status = "unverified"
                unverified_count += 1
                exploitability = "medium"
                assessment = "Heuristic scanner match; requires runtime trigger proof or manual verification."

            evaluated.append({
                "finding_id": f.get("finding_id"),
                "scanner": f.get("scanner"),
                "title": title,
                "file_path": f.get("file_path"),
                "line_number": f.get("line_number"),
                "verification_status": status,
                "exploitability": exploitability,
                "evidence_assessment": assessment,
                "false_positive_likelihood": "low" if status == "verified" else "medium",
                "confirmed_risk_level": f.get("severity", "medium"),
            })

        return {
            "analysis_summary": f"Evaluated {len(sanitized_findings)} scanner findings against code context.",
            "evaluated_findings": evaluated,
            "verified_findings_count": verified_count,
            "unverified_findings_count": unverified_count,
        }

    def _deterministic_remediation_plan(self, state: SecurityAnalysisState) -> dict[str, Any]:
        actions = []
        ea = state.get("evidence_analysis") or {}
        findings = ea.get("evaluated_findings", [])

        for idx, f in enumerate(findings[:4], start=1):
            title = f.get("title", "Security Flaw")
            actions.append({
                "finding_id": f.get("finding_id", f"F-{idx:02d}"),
                "title": title,
                "priority": "immediate" if f.get("confirmed_risk_level") in ["critical", "high"] else "medium",
                "remediation_instructions": (
                    f"1. Audit the source in {f.get('file_path')}.\n"
                    "2. Migrate hardcoded inputs/secrets to environment variables.\n"
                    "3. Add input boundary validation."
                ),
                "safe_code_snippet": (
                    "# Before:\n# insecure_call(untrusted_input)\n\n"
                    "# After:\n# safe_validated_call(validate_schema(untrusted_input))"
                ),
                "mandatory_verification_criteria": (
                    f"Must execute test TC-01 and verify zero SAST alerts from {f.get('scanner')}."
                ),
                "required_test_case_id": "TC-01",
                "verification_status": "unverified",
            })

        if not actions:
            actions.append({
                "finding_id": "REC-01",
                "title": "Continuous Security Verification Gate",
                "priority": "medium",
                "remediation_instructions": "Ensure automated scanner checks run on all pull requests.",
                "safe_code_snippet": "# .github/workflows/security.yml\n- name: AgentGuard Audit\n  run: npm run audit",
                "mandatory_verification_criteria": "CI workflow exits with code 0 on clean codebases.",
                "required_test_case_id": "TC-02",
                "verification_status": "unverified",
            })

        return {
            "executive_remediation_summary": "Prioritized remediation actions requiring test-based verification before deployment.",
            "remediation_actions": actions,
            "pre_deployment_checklist": [
                "All hardcoded tokens rotated and stored in vault",
                "All SAST high/critical alerts resolved",
                "Regression test suite passing in CI",
            ],
        }
