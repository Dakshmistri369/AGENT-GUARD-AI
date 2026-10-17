"""
AgentGuard AI — AI Service layer.
NVIDIA Nemotron is the primary LLM for:
1. Threat analysis (STRIDE, OWASP, attack surface mapping)
2. Test planning (dynamic exploit payloads, fuzz tests, test harnesses)
3. Explaining findings (root cause, developer remediation, fix examples)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.ai.client import BaseAIClient, clean_json_response, get_ai_client
from app.config import Settings, get_settings
from app.schemas.ai import (
    AIStatusResponse,
    ExplainFindingRequest,
    FindingExplanationResponse,
    SecurityTestCase,
    TestPlanningRequest,
    TestPlanningResponse,
    ThreatAnalysisRequest,
    ThreatAnalysisResponse,
    ThreatItem,
)

logger = logging.getLogger("agentguard.ai.service")


class AIService:
    """Core AI service coordinating Nemotron calls for security analysis."""

    def __init__(self, client: BaseAIClient | None = None, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = client or get_ai_client(self._settings)

    @property
    def client(self) -> BaseAIClient:
        return self._client

    async def analyze_threats(self, request: ThreatAnalysisRequest) -> ThreatAnalysisResponse:
        """
        Perform threat analysis on architectural context, requirements, or code snippets.
        Categorizes risks using STRIDE / OWASP and details entry points and mitigations.
        """
        system_prompt = (
            "You are AgentGuard AI, an elite security auditor and threat modeling specialist powered by NVIDIA Nemotron. "
            "Analyze the provided software context and source code for architectural threats, security weaknesses, and attack surfaces. "
            "You must return ONLY a valid, parseable JSON object matching this exact schema:\n"
            "{\n"
            '  "summary": "High-level summary of the threat landscape",\n'
            '  "threats": [\n'
            "    {\n"
            '      "id": "T-01",\n'
            '      "title": "Threat Title",\n'
            '      "category": "STRIDE / OWASP classification (e.g. Injection, Privilege Escalation)",\n'
            '      "severity": "critical|high|medium|low|info",\n'
            '      "attack_vector": "Entry point and exploit path",\n'
            '      "description": "Technical description of the threat",\n'
            '      "mitigation": "Concrete defensive control or mitigation"\n'
            "    }\n"
            "  ]\n"
            "}\n"
            "No commentary or text outside the JSON object. Do not include markdown formatting code fences."
        )

        user_content = f"Context/Specification:\n{request.context}\n"
        if request.source_code:
            user_content += f"\nSource Code ({request.language or 'unknown'}):\n{request.source_code}\n"
        if request.framework:
            user_content += f"\nFramework: {request.framework}\n"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1500)
        cleaned = clean_json_response(raw_output)

        try:
            data = json.loads(cleaned)
            threats_raw = data.get("threats", [])
            threats = []
            for idx, t in enumerate(threats_raw, start=1):
                threats.append(
                    ThreatItem(
                        id=t.get("id") or f"T-{idx:02d}",
                        title=t.get("title", "Identified Threat"),
                        category=t.get("category", "General Vulnerability"),
                        severity=t.get("severity", "medium").lower() if t.get("severity", "").lower() in ["critical", "high", "medium", "low", "info"] else "medium",
                        attack_vector=t.get("attack_vector", "Untrusted Input"),
                        description=t.get("description", ""),
                        mitigation=t.get("mitigation", "Implement defensive validation"),
                    )
                )

            return ThreatAnalysisResponse(
                summary=data.get("summary", "Threat analysis completed."),
                threats=threats,
                model_used=self._client.model_name,
            )
        except Exception as exc:
            logger.warning("Failed to parse Nemotron JSON response for threat analysis: %s; falling back to wrapped response", exc)
            return ThreatAnalysisResponse(
                summary=cleaned[:300],
                threats=[
                    ThreatItem(
                        id="T-01",
                        title="Potential Security Threat",
                        category="General",
                        severity="medium",
                        attack_vector="Application boundary",
                        description=cleaned,
                        mitigation="Audit code and enforce principle of least privilege.",
                    )
                ],
                model_used=self._client.model_name,
            )

    async def generate_test_plan(self, request: TestPlanningRequest) -> TestPlanningResponse:
        """
        Generate dynamic security verification and test plans for identified threats or code areas.
        Produces concrete test cases, malicious payloads, and automated test scripts.
        """
        system_prompt = (
            "You are AgentGuard AI, an expert penetration tester and automated test engineer powered by NVIDIA Nemotron. "
            "Generate an automated security test plan targeting the specified threat context or component. "
            "You must return ONLY a valid, parseable JSON object matching this exact schema:\n"
            "{\n"
            '  "overview": "Overview of test strategy, scope, and objectives",\n'
            '  "test_cases": [\n'
            "    {\n"
            '      "id": "TC-01",\n'
            '      "title": "Test case title",\n'
            '      "test_type": "DAST|SAST|Fuzz|Unit|Integration",\n'
            '      "precondition": "Environment setup or precondition",\n'
            '      "attack_payload": "Malicious payload, boundary input, or exploit string",\n'
            '      "expected_secure_behavior": "How the system should safely handle the attack",\n'
            '      "test_code": "Automated test snippet (pytest, curl, bash, or python)"\n'
            "    }\n"
            "  ],\n"
            '  "execution_guidelines": "Instructions for safe execution in sandbox environment"\n'
            "}\n"
            "No conversational commentary outside the JSON object. Do not include markdown formatting code fences."
        )

        user_content = f"Threat Context:\n{request.threat_context}\n"
        if request.target_code:
            user_content += f"\nTarget Code Under Test:\n{request.target_code}\n"
        if request.test_type:
            user_content += f"\nRequested Test Focus: {request.test_type}\n"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1500)
        cleaned = clean_json_response(raw_output)

        try:
            data = json.loads(cleaned)
            test_cases_raw = data.get("test_cases", [])
            test_cases = []
            for idx, tc in enumerate(test_cases_raw, start=1):
                test_cases.append(
                    SecurityTestCase(
                        id=tc.get("id") or f"TC-{idx:02d}",
                        title=tc.get("title", f"Security Test Case {idx}"),
                        test_type=tc.get("test_type", "DAST"),
                        precondition=tc.get("precondition", "Standard test environment"),
                        attack_payload=tc.get("attack_payload", ""),
                        expected_secure_behavior=tc.get("expected_secure_behavior", "Error handled securely"),
                        test_code=tc.get("test_code"),
                    )
                )

            return TestPlanningResponse(
                overview=data.get("overview", "Automated security test plan generated."),
                test_cases=test_cases,
                execution_guidelines=data.get(
                    "execution_guidelines",
                    "Execute tests inside an isolated sandbox container with zero external network access."
                ),
                model_used=self._client.model_name,
            )
        except Exception as exc:
            logger.warning("Failed to parse Nemotron JSON response for test planning: %s", exc)
            return TestPlanningResponse(
                overview=cleaned[:300],
                test_cases=[
                    SecurityTestCase(
                        id="TC-01",
                        title="Boundary Payload Verification",
                        test_type="DAST",
                        precondition="Isolated test container",
                        attack_payload="<script>alert(1)</script>",
                        expected_secure_behavior="Input rejected with HTTP 400 or properly encoded",
                        test_code="# Automated test case\ndef test_boundary(): pass",
                    )
                ],
                execution_guidelines="Run with network disabled in isolated environment.",
                model_used=self._client.model_name,
            )

    async def explain_finding(self, request: ExplainFindingRequest) -> FindingExplanationResponse:
        """
        Provide detailed, developer-friendly explanation of a security finding.
        Breaks down root cause, exploit impact, actionable code fix example, and verification steps.
        """
        system_prompt = (
            "You are AgentGuard AI, an elite application security engineer powered by NVIDIA Nemotron. "
            "Explain the following security finding clearly and actionably for a software developer. "
            "You must return ONLY a valid, parseable JSON object matching this exact schema:\n"
            "{\n"
            '  "summary": "Plain-English summary of what the issue is and why it matters",\n'
            '  "root_cause": "Technical explanation of the underlying flaw in the code or config",\n'
            '  "impact": "Real-world consequence if exploited by an attacker",\n'
            '  "remediation": "Step-by-step instructions to remediate the vulnerability",\n'
            '  "fix_example": "Concrete code snippet showing Before and After fix",\n'
            '  "verification_steps": "How the developer can verify that the vulnerability is resolved"\n'
            "}\n"
            "No conversational commentary outside the JSON object. Do not include markdown formatting code fences."
        )

        user_content = (
            f"Finding Title: {request.title}\n"
            f"Severity: {request.severity}\n"
            f"Scanner: {request.scanner}\n"
        )
        if request.rule_id:
            user_content += f"Rule ID: {request.rule_id}\n"
        if request.file_path:
            user_content += f"File: {request.file_path}\n"
        if request.line_number is not None:
            user_content += f"Line: {request.line_number}\n"
        if request.sanitized_evidence:
            user_content += f"Evidence / Code Snippet:\n{request.sanitized_evidence}\n"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        raw_output = await self._client.chat_completion(messages, temperature=0.1, max_tokens=1500)
        cleaned = clean_json_response(raw_output)

        try:
            data = json.loads(cleaned)
            return FindingExplanationResponse(
                summary=data.get("summary", "Security finding explanation."),
                root_cause=data.get("root_cause", "Insecure handling of external input or configuration."),
                impact=data.get("impact", "Potential compromise of system confidentiality, integrity, or availability."),
                remediation=data.get("remediation", "Apply defensive validation, sanitization, and principle of least privilege."),
                fix_example=data.get("fix_example"),
                verification_steps=data.get("verification_steps", "Run security unit tests to confirm the fix."),
                model_used=self._client.model_name,
            )
        except Exception as exc:
            logger.warning("Failed to parse Nemotron JSON response for finding explanation: %s", exc)
            return FindingExplanationResponse(
                summary=cleaned[:300],
                root_cause="Identified by security scanner as a vulnerability pattern.",
                impact="Potential unauthorized access or compromise depending on deployment context.",
                remediation=cleaned,
                fix_example=None,
                verification_steps="Re-run static scanner to verify finding is resolved.",
                model_used=self._client.model_name,
            )

    async def get_status(self) -> AIStatusResponse:
        """Check AI provider configuration and live health."""
        configured = self._settings.ai_provider == "nemotron" and bool(self._settings.ai_api_key)
        healthy, latency_ms, detail = await self._client.health_check()
        return AIStatusResponse(
            provider=self._settings.ai_provider,
            model=self._client.model_name,
            configured=configured,
            healthy=healthy,
            latency_ms=latency_ms,
            detail=detail,
        )


_service_instance: AIService | None = None


def get_ai_service() -> AIService:
    """Singleton getter for AIService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = AIService(settings=get_settings())
    return _service_instance
