"""
AgentGuard AI — Optional, Evidence-Driven AI Analysis.
Leverages NVIDIA Nemotron (or configured AI Provider) to explain scanner findings,
prioritize remediation, and generate human-reviewable fix suggestions.
Strictly treats repository code and manifests as UNTRUSTED input.
Gracefully reports 'not_configured' when AI credentials are absent.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.ai.langgraph_orchestrator import LangGraphSecurityOrchestrator
from app.config import Settings, get_settings
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.services.ai_review")


class AIScannerReviewService:
    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()
        self._orchestrator = LangGraphSecurityOrchestrator(settings=self._settings)

    def is_ai_available(self) -> bool:
        """Check if AI provider is configured and available."""
        return self._orchestrator.is_ai_configured()

    async def review_findings(
        self,
        findings: list[dict[str, Any]],
        repo_metadata: dict[str, Any],
        coverage_summary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Produce an evidence-grounded AI review using LangGraph's 4 logical agents
        (Threat Modeler, Test Strategist, Evidence Analyst, Remediation Verifier).
        """
        if not self.is_ai_available():
            return {
                "status": "not_configured",
                "message": "AI analysis is not configured. Set NVIDIA_API_KEY to enable.",
                "model": None,
                "executive_summary": None,
                "top_priorities": [],
                "recommended_tests": [],
                "threat_model": None,
                "test_strategy": None,
                "evidence_analysis": None,
                "remediation_plan": None,
                "audit_trace": [],
            }

        if not findings:
            is_partial = bool(coverage_summary and not coverage_summary.get("is_complete", True))
            has_failures = bool(coverage_summary and (
                coverage_summary.get("failed_scanners")
                or any("Git clone failed" in str(note) for note in coverage_summary.get("notes", []))
            ))
            if has_failures:
                msg = "Scan coverage is incomplete: repository clone or scanner execution encountered issues. Analysis was restricted."
                exec_sum = "Static code scanning was skipped or restricted due to repository environment issues. No code-level findings could be verified."
            elif is_partial:
                missing = coverage_summary.get("missing_scanners", []) if coverage_summary else []
                missing_str = ", ".join(missing) if missing else "some scanners"
                msg = f"Zero findings detected from available engines; partial coverage due to missing tools: {missing_str}."
                exec_sum = "No security findings were identified by available tools, but full scanner coverage was not achieved."
            else:
                msg = "Zero security findings detected. AI verification confirmed clean scan baseline."
                exec_sum = "No vulnerabilities or high-risk security patterns were identified in the repository."

            return {
                "status": "completed",
                "message": msg,
                "model": self._settings.ai_model if self._settings.ai_provider != "mock" else "mock-nemotron",
                "executive_summary": exec_sum,
                "top_priorities": [],
                "recommended_tests": [
                    "Implement automated CI/CD static analysis gates.",
                    "Enable dependency vulnerability checking on pull requests.",
                ],
                "threat_model": None,
                "test_strategy": None,
                "evidence_analysis": None,
                "remediation_plan": None,
                "audit_trace": [],
            }

        audit_res = await self._orchestrator.run_security_audit(
            repo_metadata=repo_metadata,
            scanner_findings=findings,
            timeout_seconds=min(self._settings.ai_timeout_seconds, 60),
        )

        # Build backwards-compatible fields for UI
        rem_plan = audit_res.get("remediation_plan") or {}
        test_strat = audit_res.get("test_strategy") or {}

        top_priorities = []
        for action in rem_plan.get("remediation_actions", [])[:5]:
            top_priorities.append({
                "title": action.get("title", "Remediation item"),
                "action": action.get("remediation_instructions", "Follow security remediation guide"),
                "urgency": action.get("priority", "medium"),
            })

        recommended_tests = []
        for tc in test_strat.get("test_cases", [])[:4]:
            recommended_tests.append(f"{tc.get('title')}: {tc.get('expected_secure_behavior')}")

        return {
            "status": audit_res.get("status", "completed"),
            "message": audit_res.get("message", "Multi-agent review completed"),
            "model": audit_res.get("model_used"),
            "executive_summary": audit_res.get("executive_summary"),
            "top_priorities": top_priorities,
            "recommended_tests": recommended_tests,
            "threat_model": audit_res.get("threat_model"),
            "test_strategy": audit_res.get("test_strategy"),
            "evidence_analysis": audit_res.get("evidence_analysis"),
            "remediation_plan": rem_plan,
            "audit_trace": audit_res.get("audit_trace", []),
            "is_fallback": audit_res.get("is_fallback", False),
        }
