"""
AgentGuard AI — AI Endpoints (NVIDIA Nemotron).
Provides REST endpoints for threat analysis, test planning, and explaining findings.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.ai.langgraph_orchestrator import LangGraphSecurityOrchestrator
from app.ai.service import AIService, get_ai_service
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AIStatusResponse,
    ExplainFindingRequest,
    FindingExplanationResponse,
    MultiAgentAuditRequest,
    MultiAgentAuditResponse,
    TestPlanningRequest,
    TestPlanningResponse,
    ThreatAnalysisRequest,
    ThreatAnalysisResponse,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status(
    ai_service: AIService = Depends(get_ai_service),
    current_user: User = Depends(get_current_user),
) -> AIStatusResponse:
    """Return status, active model, and connectivity of the configured AI provider."""
    return await ai_service.get_status()


@router.post("/threat-analysis", response_model=ThreatAnalysisResponse)
async def perform_threat_analysis(
    payload: ThreatAnalysisRequest,
    ai_service: AIService = Depends(get_ai_service),
    current_user: User = Depends(get_current_user),
) -> ThreatAnalysisResponse:
    """
    Perform threat analysis using NVIDIA Nemotron.
    Analyzes application requirements, context, and code snippets for threat categories (STRIDE / OWASP).
    """
    try:
        return await ai_service.analyze_threats(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Nemotron threat analysis failed: {exc}",
        ) from exc


@router.post("/test-plan", response_model=TestPlanningResponse)
async def generate_test_plan(
    payload: TestPlanningRequest,
    ai_service: AIService = Depends(get_ai_service),
    current_user: User = Depends(get_current_user),
) -> TestPlanningResponse:
    """
    Generate an automated security test plan using NVIDIA Nemotron.
    Generates test cases with exploit/boundary payloads and automated test code.
    """
    try:
        return await ai_service.generate_test_plan(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Nemotron test planning failed: {exc}",
        ) from exc


@router.post("/explain-finding", response_model=FindingExplanationResponse)
async def explain_finding(
    payload: ExplainFindingRequest,
    ai_service: AIService = Depends(get_ai_service),
    current_user: User = Depends(get_current_user),
) -> FindingExplanationResponse:
    """
    Explain a security finding in depth using NVIDIA Nemotron.
    Provides plain-language breakdown, root cause, impact, code fix example, and verification steps.
    """
    try:
        return await ai_service.explain_finding(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Nemotron finding explanation failed: {exc}",
        ) from exc


@router.post("/audit", response_model=MultiAgentAuditResponse)
async def perform_multi_agent_audit(
    payload: MultiAgentAuditRequest,
    current_user: User = Depends(get_current_user),
) -> MultiAgentAuditResponse:
    """
    Execute full LangGraph multi-agent security audit orchestrating:
    1. Threat Modeler: Identifies architectural threats & STRIDE categories.
    2. Test Strategist: Formulates verification test cases & boundary vectors.
    3. Evidence Analyst: Evaluates actual scanner results against code evidence.
    4. Remediation Verifier: Generates safe remediations & mandatory verification criteria.
    """
    orchestrator = LangGraphSecurityOrchestrator()
    try:
        res = await orchestrator.run_security_audit(
            repo_metadata=payload.repo_metadata,
            scanner_findings=payload.scanner_findings,
        )
        return MultiAgentAuditResponse(**res)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LangGraph multi-agent audit failed: {exc}",
        ) from exc
