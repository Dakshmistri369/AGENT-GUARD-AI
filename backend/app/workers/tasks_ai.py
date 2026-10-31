"""
AgentGuard AI — Arq Worker AI Explanation Task.
"""
from __future__ import annotations

from app.core.logging import get_logger
from app.database.session import AsyncSessionLocal
from app.services.ai_service import AiService

logger = get_logger("agentguard.workers.tasks_ai")


async def generate_ai_explanations(ctx: dict, scan_id: str | int) -> dict:
    """Async task to generate NVIDIA Nemotron explanations for a completed scan."""
    logger.info("Starting AI explanation task for scan %s", scan_id)
    async with AsyncSessionLocal() as db:
        try:
            count = await AiService.generate_explanations_for_findings(db, scan_id)
            return {"status": "success", "scan_id": scan_id, "findings_updated": count}
        except Exception as exc:
            logger.error("AI explanation task failed for scan %s: %s", scan_id, exc)
            return {"status": "error", "scan_id": scan_id, "error": str(exc)}
