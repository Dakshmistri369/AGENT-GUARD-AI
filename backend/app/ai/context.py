"""
AgentGuard AI — AI Context Window Extraction Service.
Extracts a windowed snippet (±15 lines, hard-capped at 4000 characters) around
the vulnerable finding line. Never sends entire files to the LLM, dramatically
reducing token cost, eliminating context window overflows, and minimizing injection surface.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import get_settings
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.ai.context")


def extract_finding_context(
    file_path: Path | str,
    line_number: int | None,
    context_lines: int | None = None,
    max_chars: int | None = None,
) -> str:
    """
    Extract a focused, windowed code snippet around line_number with line indicators.
    Enforces configurable line count boundaries (default ±15 lines) and character caps (default 4000).
    Redacts known credentials before returning.
    """
    settings = get_settings()
    c_lines = context_lines if context_lines is not None else settings.ai_context_lines
    cap_chars = max_chars if max_chars is not None else settings.ai_max_snippet_chars

    path = Path(file_path)
    if not path.exists() or not path.is_file():
        return ""

    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception as exc:
        logger.debug("Could not read file %s for context extraction: %s", path, exc)
        return ""

    if not lines:
        return ""

    target_line = line_number if (line_number and 1 <= line_number <= len(lines)) else 1
    start = max(0, target_line - 1 - c_lines)
    end = min(len(lines), target_line + c_lines)

    snippet_lines = [
        f"{'>> ' if i == target_line - 1 else '   '}{i+1}: {line}"
        for i, line in enumerate(lines[start:end], start=start)
    ]
    snippet = "\n".join(snippet_lines)
    truncated = snippet[:cap_chars]

    # Redact any credentials from context
    return redact_sensitive_text(truncated) or ""
