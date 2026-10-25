"""
AgentGuard AI — Evidence-Based Secret Classification Engine.
Evaluates potential secret findings after detection to distinguish between:
  - 'confirmed_secret': High-confidence real leaked credential
  - 'likely_placeholder': Strong contextual evidence of documentation/tutorial sample
  - 'needs_review': Ambiguous finding requiring human verification

SAFETY INVARIANTS:
  1. Never classifies based on filename or file extension alone.
  2. Never classifies based on a single keyword alone.
  3. Never globally excludes README or Markdown files from scanning.
  4. Real structured tokens (AWS, GitHub, OpenAI, Private Keys) are NEVER downgraded
     to 'likely_placeholder', regardless of nearby context or allowlist entries.
  5. Raw secret values are NEVER stored or returned; only redacted previews are produced.
"""
from __future__ import annotations

import functools
import logging
import os
import re
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("agentguard.scanners.classifier")

CONFIG_PATH = Path(__file__).resolve().parent / "placeholder_allowlist.yaml"

# High-confidence structured credential signatures (real provider tokens)
STRUCTURED_KEY_PATTERNS = [
    (re.compile(r"\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b"), "AWS Access Key ID"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{30,80}\b"), "GitHub Token"),
    (re.compile(r"\bglpat-[A-Za-z0-9_-]{20,80}\b"), "GitLab Personal Access Token"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,80}\b"), "OpenAI Secret Key"),
    (re.compile(r"\bsk_live_[A-Za-z0-9]{24,60}\b"), "Stripe Live Secret Key"),
    (re.compile(r"\bnvapi-[a-zA-Z0-9_-]{64,}\b"), "NVIDIA API Key"),
    (re.compile(r"\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,34}\b"), "Slack Token"),
    (re.compile(r"-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----"), "Private Key"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"), "JSON Web Token"),
]


def is_structured_real_token(secret: str) -> bool:
    """Check if string matches any known high-confidence structured provider key pattern."""
    if not secret:
        return False
    return any(pattern.search(secret) is not None for pattern, _ in STRUCTURED_KEY_PATTERNS)


# Fallback defaults if configuration YAML cannot be read
DEFAULT_PLACEHOLDER_VALUES = [
    "password@123", "password123", "Password@123", "Password123", "P@ssw0rd123",
    "changeme", "ChangeMe", "CHANGEME", "admin123", "Admin@123",
    "your-api-key-here", "your_api_key_here", "YOUR_API_KEY_HERE",
    "insert-api-key-here", "replace-with-your-key", "replace_with_your_key",
    "your-secret-key", "your_secret_key", "YOUR_SECRET_KEY", "your-token-here",
    "my-secret-key", "supersecretpassword", "dummy_secret_key", "fake-api-key",
    "xxx-xxx-xxx", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
]

DEFAULT_CONTEXT_KEYWORDS = [
    "example", "sample", "placeholder", "tutorial", "demo",
    "replace this", "replace with", "replace after", "do not use in production",
    "dummy", "fake", "mock", "for illustration", "change this", "signup example",
]


def load_allowlist_config() -> tuple[set[str], list[str]]:
    """Load placeholder values and context keywords from YAML config."""
    try:
        if CONFIG_PATH.exists():
            data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                p_vals = {str(v).strip().lower() for v in data.get("placeholder_values", []) if v}
                c_kws = [str(k).strip().lower() for k in data.get("context_keywords", []) if k]
                return p_vals, c_kws
    except Exception as exc:
        logger.warning("Failed loading placeholder allowlist YAML: %s; using defaults", exc)

    return {v.lower() for v in DEFAULT_PLACEHOLDER_VALUES}, [k.lower() for k in DEFAULT_CONTEXT_KEYWORDS]


def mask_secret_preview(secret: str | None) -> str | None:
    """
    Produce a safe, redacted preview of a detected secret string.
    Never stores or returns raw values.
    Examples:
      'password@123' (12 chars) -> 'pa********23'
      'short1' (6 chars)       -> 's****1'
      'abc' (<4 chars)         -> '****'
    """
    if not secret:
        return None

    clean = secret.strip().strip("'\"`")
    n = len(clean)
    if n <= 3:
        return "****"
    if n <= 7:
        return f"{clean[0]}{'*' * (n - 2)}{clean[-1]}"
    return f"{clean[:2]}{'*' * (n - 4)}{clean[-2:]}"


def is_secret_finding(finding: dict[str, Any]) -> bool:
    """Determine whether a finding represents a credential/secret finding."""
    scanner = (finding.get("scanner") or "").lower()
    rule_id = (finding.get("rule_id") or "").upper()
    title = (finding.get("title") or "").lower()

    if "detect_secrets" in scanner or "detect-secrets" in scanner:
        return True
    if "bandit" in scanner and any(b in rule_id for b in ["B105", "B106", "B107"]):
        return True
    if any(k in rule_id for k in ["SECRET", "PASSWORD", "API-KEY", "API_KEY", "TOKEN", "CREDENTIAL", "PRIVATE-KEY"]):
        return True
    if any(k in title for k in ["secret", "password", "api key", "credential", "private key", "access token"]):
        return True

    return False


def extract_candidate_secret(finding: dict[str, Any]) -> str | None:
    """Extract candidate secret string from finding evidence or snippet."""
    # 1. Inspect sanitized_evidence
    ev = finding.get("sanitized_evidence") or ""
    # Look for quoted strings in evidence or title
    m = re.search(r"['\"]([^'\"]{4,120})['\"]", ev)
    if m:
        return m.group(1).strip()

    # Look for key-value assignments
    m = re.search(r"(?i)(?:password|secret|key|token)\s*[:=]\s*['\"]?([^\s'\"]{4,120})['\"]?", ev)
    if m:
        return m.group(1).strip()

    # 2. Inspect code snippet
    snip = finding.get("code_snippet") or ""
    m = re.search(r"['\"]([^'\"]{4,120})['\"]", snip)
    if m:
        return m.group(1).strip()

    # 3. Inspect title (e.g. Bandit 'Possible hardcoded password: ...')
    title = finding.get("title") or ""
    m = re.search(r"['\"]([^'\"]{4,120})['\"]", title)
    if m:
        return m.group(1).strip()

    return None


@functools.lru_cache(maxsize=256)
def _read_cached_file_lines(path_str: str) -> tuple[str, ...]:
    """Cache file lines in memory during classification to avoid repeated disk reads."""
    try:
        p = Path(path_str)
        if not p.exists() or not p.is_file():
            return ()
        return tuple(p.read_text(encoding="utf-8", errors="replace").splitlines())
    except Exception:
        return ()


def get_surrounding_context(workspace_path: Path | None, file_path: str | None, line_number: int | None) -> str:
    """Read target file at file_path within workspace and return lines ±3 around line_number."""
    if not workspace_path or not file_path:
        return ""

    try:
        target = workspace_path / file_path
        lines = _read_cached_file_lines(str(target))
        if not lines:
            return ""

        curr = line_number or 1
        start_idx = max(0, curr - 4)  # 3 lines before
        end_idx = min(len(lines), curr + 3)  # 3 lines after
        return " ".join(lines[start_idx:end_idx]).lower()
    except Exception as exc:
        logger.debug("Failed extracting surrounding context for %s:%s: %s", file_path, line_number, exc)
        return ""
        logger.debug("Failed extracting surrounding context for %s:%s: %s", file_path, line_number, exc)
        return ""


def classify_secret_finding(
    finding: dict[str, Any],
    workspace_path: Path | None = None,
) -> tuple[str, str, str | None]:
    """
    Evidence-based classification of a potential secret finding.
    Returns:
      (classification, classification_reason, secret_redacted_preview)
    Where classification is one of:
      - 'confirmed_secret'
      - 'likely_placeholder'
      - 'needs_review'
    """
    # 1. Non-secret findings (e.g. SQLi, CVEs, insecure config)
    if not is_secret_finding(finding):
        return "confirmed_secret", "Standard static security finding.", None

    allowlist_values, context_keywords = load_allowlist_config()

    evidence_text = (finding.get("sanitized_evidence") or "") + " " + (finding.get("code_snippet") or "")
    candidate = extract_candidate_secret(finding)
    file_path = finding.get("file_path") or ""
    line_no = finding.get("line_number")

    # Read surrounding ±3 lines of text
    surrounding_text = get_surrounding_context(workspace_path, file_path, line_no)
    if not surrounding_text:
        surrounding_text = (finding.get("explanation") or "") + " " + evidence_text
    surrounding_text_lower = surrounding_text.lower()

    # Create redacted preview
    preview = mask_secret_preview(candidate or evidence_text[:30])

    # 2. Check for Structured Real Token Signatures (INVARIANT: NEVER downgrade to likely_placeholder)
    for pattern, name in STRUCTURED_KEY_PATTERNS:
        if pattern.search(evidence_text) or (candidate and pattern.search(candidate)):
            matched_kws = [kw for kw in context_keywords if kw in surrounding_text_lower]
            if matched_kws:
                return (
                    "needs_review",
                    f"Signature matches structured provider key ({name}). "
                    f"Surrounding text mentions example terms ({', '.join(matched_kws[:2])}), "
                    "but structured tokens are never automatically marked as placeholders.",
                    preview,
                )
            return (
                "confirmed_secret",
                f"Signature matches real structured provider key ({name}). High confidence credential leak.",
                preview,
            )

    # 3. Check Match Against Narrow Placeholder Allowlist
    has_allowlist_match = False
    matched_value = None

    if candidate and candidate.lower() in allowlist_values:
        has_allowlist_match = True
        matched_value = candidate
    else:
        # Check if any allowlist entry is present as an exact token in evidence
        for pv in allowlist_values:
            if pv in evidence_text.lower():
                has_allowlist_match = True
                matched_value = pv
                break

    # 4. Check for Nearby Context Keywords
    matched_kws = [kw for kw in context_keywords if kw in surrounding_text_lower]
    has_context_keywords = len(matched_kws) > 0

    # 5. Weak Supporting Signal: Documentation file type
    is_doc = any(file_path.lower().endswith(ext) for ext in [".md", ".markdown", ".txt", ".rst"]) or "docs/" in file_path.lower()
    doc_note = f" in documentation '{Path(file_path).name}'" if is_doc else ""

    # 6. Multi-Signal Decision Logic
    if has_allowlist_match and has_context_keywords:
        return (
            "likely_placeholder",
            f"Matched placeholder allowlist entry '{matched_value}' with supporting nearby context "
            f"('{', '.join(matched_kws[:2])}'){doc_note}.",
            preview,
        )

    if has_allowlist_match and not has_context_keywords:
        return (
            "needs_review",
            f"Matched common placeholder string '{matched_value}', but lacks explicit tutorial or example context markers nearby. Verification recommended.",
            preview,
        )

    if has_context_keywords and not has_allowlist_match:
        return (
            "needs_review",
            f"Nearby context contains tutorial/example indicators ('{', '.join(matched_kws[:2])}'), but the credential value does not match known placeholder allowlist.",
            preview,
        )

    # 7. Unambiguous real credential detection
    return (
        "confirmed_secret",
        "Hardcoded credential detected without placeholder allowlist match or tutorial context markers.",
        preview,
    )


def enrich_finding_with_classification(finding: dict[str, Any], workspace_path: Path | None = None) -> dict[str, Any]:
    """Enrich a finding dictionary in-place with classification, reason, and masked preview."""
    classification, reason, preview = classify_secret_finding(finding, workspace_path=workspace_path)
    finding["classification"] = classification
    finding["classification_reason"] = reason
    finding["secret_redacted_preview"] = preview

    # Invariant: Ensure raw_secret is never present in serialized finding
    finding.pop("raw_secret", None)
    return finding
