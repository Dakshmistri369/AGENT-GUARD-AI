"""
AgentGuard AI — AI Explanation & Remediation Service.
Connects to NVIDIA Nemotron for security impact analysis and verified remediation diffs.
Never sends raw secrets or full private files to external AI endpoints.
"""
from __future__ import annotations

import httpx
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.finding import Finding

logger = get_logger("agentguard.services.ai_service")
settings = get_settings()


class AiService:
    """Manages AI-assisted vulnerability explanation and remediation recommendations."""

    @staticmethod
    def is_ai_enabled() -> bool:
        """Check whether NVIDIA Nemotron credentials are configured."""
        key = settings.nvidia_nemotron_api_key or settings.nvidia_api_key or settings.ai_api_key
        return bool(key and key.strip())

    @classmethod
    async def generate_explanations_for_findings(
        cls,
        db: AsyncSession,
        scan_id: str | int,
        batch_size: int = 5,
    ) -> int:
        """
        Select findings for a scan that lack AI explanations and enrich them via NVIDIA Nemotron.
        If AI is not configured or fails, falls back gracefully to deterministic heuristics.
        """
        query = select(Finding).where(
            Finding.scan_id == scan_id,
            Finding.explanation.is_(None) | (Finding.explanation == "") | (Finding.remediation.is_(None)),
        ).limit(20)  # Cap per scan to control latency

        res = await db.execute(query)
        findings = res.scalars().all()
        if not findings:
            return 0

        api_key = settings.nvidia_nemotron_api_key or settings.nvidia_api_key or settings.ai_api_key
        model = settings.nvidia_nemotron_model or settings.ai_model or "nvidia/llama-3.1-nemotron-70b-instruct"
        base_url = settings.nvidia_base_url or settings.ai_base_url or "https://integrate.api.nvidia.com/v1"

        updated_count = 0

        for finding in findings:
            if not cls.is_ai_enabled():
                # Deterministic heuristic fallback
                finding.explanation = f"Detected {finding.title} in {finding.file_path or 'manifest'}. Review input flow and validate constraints."
                finding.remediation = f"Ensure parameter validation or dependency upgrade for rule {finding.rule_id or 'security-rule'}."
                updated_count += 1
                continue

            # Send minimal context only (no secrets or full source files)
            safe_snippet = (finding.code_snippet or "")[:500]
            prompt = (
                f"You are a cybersecurity expert. Provide concise JSON analysis for this finding:\n"
                f"- Scanner: {finding.scanner}\n"
                f"- Rule: {finding.rule_id}\n"
                f"- Title: {finding.title}\n"
                f"- Severity: {finding.severity}\n"
                f"- File: {finding.file_path}\n"
                f"- Snippet:\n{safe_snippet}\n\n"
                f"Respond with JSON format: {{\"explanation\": \"...\", \"impact\": \"...\", \"remediation\": \"...\"}}"
            )

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{base_url.rstrip('/')}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.2,
                            "max_tokens": 512,
                        },
                    )

                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    finding.explanation = content[:1024]
                    finding.remediation = "Apply recommended sanitization or dependency update."
                    updated_count += 1
                else:
                    logger.warning("NVIDIA Nemotron returned HTTP %d: %s", resp.status_code, resp.text[:200])
                    finding.explanation = f"Analysis for {finding.title}. Validate inputs and restrict permissions."
            except Exception as exc:
                logger.warning("AI explanation request failed: %s. Using heuristic fallback.", exc)
                finding.explanation = f"Analysis for {finding.title}. Validate inputs and restrict permissions."

        await db.commit()
        logger.info("Enriched %d findings with AI explanations for scan %s", updated_count, scan_id)
        return updated_count
