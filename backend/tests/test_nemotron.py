"""
AgentGuard AI — Tests for NVIDIA Nemotron AI Integration.
Covers:
- BaseAIClient & MockAIClient execution
- NemotronClient initialization and clean JSON parsing
- AIService threat analysis (STRIDE/OWASP mapping)
- AIService test planning (exploit payloads & test harnesses)
- AIService finding explanation (root cause & remediation)
- /api/ai/ endpoints (threat-analysis, test-plan, explain-finding, status)
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.ai.client import MockAIClient, NemotronClient, clean_json_response, get_ai_client
from app.ai.service import AIService
from app.schemas.ai import (
    ExplainFindingRequest,
    TestPlanningRequest,
    ThreatAnalysisRequest,
)

pytestmark = pytest.mark.asyncio


# ── JSON Cleaner Tests ────────────────────────────────────────────────────────

async def test_clean_json_response_fenced() -> None:
    raw = "```json\n{\"summary\": \"Test summary\", \"threats\": []}\n```"
    cleaned = clean_json_response(raw)
    assert cleaned == "{\"summary\": \"Test summary\", \"threats\": []}"


async def test_clean_json_response_with_preamble() -> None:
    raw = "Here is the threat analysis output:\n{\"summary\": \"Test\", \"threats\": []}\nHope this helps!"
    cleaned = clean_json_response(raw)
    assert cleaned == "{\"summary\": \"Test\", \"threats\": []}"


async def test_clean_json_response_plain() -> None:
    raw = "{\"key\": \"value\"}"
    cleaned = clean_json_response(raw)
    assert cleaned == raw


# ── Mock Client & Service Unit Tests ──────────────────────────────────────────

async def test_mock_client_threat_analysis() -> None:
    mock_client = MockAIClient(model="mock-nemotron-v1")
    service = AIService(client=mock_client)

    req = ThreatAnalysisRequest(
        context="A public REST API accepting user-supplied parameters to fetch user profiles",
        source_code="def get_user(id): return db.execute(f'SELECT * FROM users WHERE id = {id}')",
        language="python",
        framework="fastapi",
    )
    res = await service.analyze_threats(req)

    assert res.summary is not None
    assert len(res.threats) > 0
    assert res.model_used == "mock-nemotron-v1"
    first = res.threats[0]
    assert first.id is not None
    assert first.title is not None
    assert first.severity in ["critical", "high", "medium", "low", "info"]
    assert first.attack_vector is not None
    assert first.mitigation is not None


async def test_mock_client_test_planning() -> None:
    mock_client = MockAIClient(model="mock-nemotron-v1")
    service = AIService(client=mock_client)

    req = TestPlanningRequest(
        threat_context="SQL injection in /api/users endpoint via id parameter",
        target_code="select * from users where id = :id",
        test_type="automated",
    )
    res = await service.generate_test_plan(req)

    assert res.overview is not None
    assert len(res.test_cases) > 0
    assert res.execution_guidelines is not None
    assert res.model_used == "mock-nemotron-v1"
    tc = res.test_cases[0]
    assert tc.id is not None
    assert tc.attack_payload is not None
    assert tc.expected_secure_behavior is not None


async def test_mock_client_explain_finding() -> None:
    mock_client = MockAIClient(model="mock-nemotron-v1")
    service = AIService(client=mock_client)

    req = ExplainFindingRequest(
        title="Hardcoded API Key Detected",
        severity="high",
        scanner="semgrep",
        rule_id="generic.secrets.security.detected-api-key",
        file_path="app/config.py",
        line_number=42,
        sanitized_evidence="API_KEY = 'AKIAIOSFODNN7EXAMPLE'",
    )
    res = await service.explain_finding(req)

    assert res.summary is not None
    assert res.root_cause is not None
    assert res.impact is not None
    assert res.remediation is not None
    assert res.verification_steps is not None
    assert res.model_used == "mock-nemotron-v1"


# ── NemotronClient Init & Configuration Tests ─────────────────────────────────

async def test_nemotron_client_initialization() -> None:
    client = NemotronClient(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-test-key",
        model="nvidia/nemotron-3-ultra-550b-a55b",
        timeout_seconds=45,
        max_retries=3,
    )
    assert client.model_name == "nvidia/nemotron-3-ultra-550b-a55b"
    assert client._timeout_seconds == 45
    assert client._max_retries == 3
    assert client._base_url == "https://integrate.api.nvidia.com/v1"


# ── API Route Integration Tests ───────────────────────────────────────────────

async def test_ai_status_endpoint(client: AsyncClient) -> None:
    r = await client.get("/api/ai/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "provider" in body
    assert "model" in body
    assert "configured" in body
    assert "healthy" in body


async def test_api_threat_analysis_endpoint(client: AsyncClient) -> None:
    payload = {
        "context": "Microservice authentication gateway handling JWT tokens and user roles",
        "source_code": "def verify(token): return jwt.decode(token, verify=False)",
        "language": "python",
        "framework": "fastapi",
    }
    r = await client.post("/api/ai/threat-analysis", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "summary" in body
    assert "threats" in body
    assert isinstance(body["threats"], list)
    assert "model_used" in body


async def test_api_test_plan_endpoint(client: AsyncClient) -> None:
    payload = {
        "threat_context": "Unauthenticated access to internal admin dashboard endpoint",
        "target_code": "@app.get('/admin')\ndef admin(): return {'admin': True}",
        "test_type": "automated",
    }
    r = await client.post("/api/ai/test-plan", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "overview" in body
    assert "test_cases" in body
    assert len(body["test_cases"]) > 0
    assert "execution_guidelines" in body


async def test_api_explain_finding_endpoint(client: AsyncClient) -> None:
    payload = {
        "title": "SQL Injection in User Profile Lookup",
        "severity": "critical",
        "scanner": "semgrep",
        "rule_id": "python.lang.security.audit.sqli",
        "file_path": "backend/app/api/users.py",
        "line_number": 15,
        "sanitized_evidence": "db.execute(f'SELECT * FROM users WHERE id = {user_id}')",
    }
    r = await client.post("/api/ai/explain-finding", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "summary" in body
    assert "root_cause" in body
    assert "impact" in body
    assert "remediation" in body
    assert "verification_steps" in body
