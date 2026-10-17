"""
AgentGuard AI — NVIDIA Nemotron Client & Provider Abstraction.
Resilient async HTTP client with retries, timeout management, and mock fallback.
No secrets or keys are ever logged.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.ai")


def clean_json_response(raw_text: str) -> str:
    """Extract and sanitize JSON from model output, stripping code fences if present."""
    text = raw_text.strip()
    # Check for markdown code fences like ```json ... ```
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    # If still has surrounding braces within some commentary
    if not text.startswith("{") and "{" in text:
        start_idx = text.find("{")
        end_idx = text.rfind("}")
        if end_idx > start_idx:
            text = text[start_idx : end_idx + 1]
    return text


class BaseAIClient(ABC):
    """Abstract interface for AI LLM providers."""

    @abstractmethod
    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> str:
        """Send chat messages and return the assistant response string."""
        pass

    @abstractmethod
    async def health_check(self) -> tuple[bool, float, str]:
        """Verify provider availability. Returns (healthy, latency_ms, detail)."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the active model name."""
        pass


class NemotronClient(BaseAIClient):
    """
    Client for NVIDIA Nemotron LLM via NVIDIA NIM API / integrate.api.nvidia.com.
    Implements OpenAI-compatible chat completions with retry backoff and error handling.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: int = 60,
        max_retries: int = 2,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries

    @property
    def model_name(self) -> str:
        return self._model

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> str:
        """Call NVIDIA NIM chat completions with retries."""
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "AgentGuard-AI/0.1.0",
        }
        payload = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                    response = await client.post(url, headers=headers, json=payload)

                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    if not choices:
                        raise ValueError("NVIDIA Nemotron returned empty choices in response")

                    message = choices[0].get("message", {})
                    content = message.get("content")
                    # Fallback to reasoning_content if content is empty (for reasoning models)
                    if not content and message.get("reasoning_content"):
                        content = message.get("reasoning_content")

                    if not content:
                        raise ValueError("NVIDIA Nemotron response contained no text content")

                    return content

                # Transient errors to retry: 429, 500, 502, 503, 504
                if response.status_code in (429, 500, 502, 503, 504) and attempt < self._max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "NVIDIA API transient error %s on attempt %d/%d; retrying in %ds",
                        response.status_code,
                        attempt + 1,
                        self._max_retries,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue

                # Non-retriable or retries exhausted
                response.raise_for_status()

            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_error = exc
                if attempt < self._max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "NVIDIA API network/timeout error on attempt %d/%d: %s; retrying in %ds",
                        attempt + 1,
                        self._max_retries,
                        type(exc).__name__,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue
                break
            except Exception as exc:
                last_error = exc
                break

        safe_err = redact_sensitive_text(str(last_error))
        err_msg = f"Failed to communicate with NVIDIA Nemotron ({type(last_error).__name__}): {safe_err}"
        logger.error(err_msg)
        raise RuntimeError(err_msg) from last_error

    async def health_check(self) -> tuple[bool, float, str]:
        """Send a lightweight ping to the NVIDIA Nemotron model to verify latency and credentials."""
        start = time.monotonic()
        try:
            url = f"{self._base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self._model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 5,
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload)

            latency_ms = round((time.monotonic() - start) * 1000, 2)
            if res.status_code == 200:
                return True, latency_ms, f"Model {self._model} active and responding"
            return False, latency_ms, f"HTTP {res.status_code}: {res.text[:100]}"
        except Exception as exc:
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            return False, latency_ms, f"Connection failed: {type(exc).__name__}"


class MockAIClient(BaseAIClient):
    """
    Mock AI client for offline testing or when running without API keys.
    Provides realistic, deterministic security responses for threat analysis,
    test planning, and finding explanation.
    """

    def __init__(self, model: str = "mock-nemotron-v1") -> None:
        self._model = model

    @property
    def model_name(self) -> str:
        return self._model

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> str:
        """Return deterministic JSON based on request prompt contents."""
        all_text = " ".join(m.get("content", "") for m in messages).lower()

        if "test_cases" in all_text or "test plan" in all_text or "penetration tester" in all_text:
            return json.dumps({
                "overview": "Automated security verification plan targeting injection and privilege boundary vulnerabilities.",
                "test_cases": [
                    {
                        "id": "TC-01",
                        "title": "Injection Payload Boundary Verification",
                        "test_type": "DAST",
                        "precondition": "Target API running in isolated sandbox container with test database.",
                        "attack_payload": "'; DROP TABLE users; --",
                        "expected_secure_behavior": "HTTP 400 Bad Request or HTTP 422 with validation error; query executed as literal parameter without database mutation.",
                        "test_code": "def test_sql_injection():\n    r = client.get('/api/users?id=1%27%20OR%201=1')\n    assert r.status_code in [400, 404, 422]",
                    },
                    {
                        "id": "TC-02",
                        "title": "Fuzzing Malformed Input Boundaries",
                        "test_type": "Fuzz",
                        "precondition": "Endpoint accepts JSON body.",
                        "attack_payload": "{'input': 'A' * 100000}",
                        "expected_secure_behavior": "HTTP 413 Payload Too Large or graceful 422 error without worker crash or memory exhaustion.",
                        "test_code": "def test_payload_limit():\n    r = client.post('/api/data', json={'data': 'A' * 200000})\n    assert r.status_code == 413",
                    },
                ],
                "execution_guidelines": "Execute inside an ephemeral, network-disabled sandbox container with CPU and memory limits strictly enforced.",
            })

        if "threat" in all_text:
            return json.dumps({
                "summary": "Mock threat analysis detected injection and insecure credential patterns in the evaluated component.",
                "threats": [
                    {
                        "id": "T-01",
                        "title": "Remote Code / Expression Injection",
                        "category": "Injection (OWASP A03 / STRIDE Tampering)",
                        "severity": "critical",
                        "attack_vector": "User-controlled input processed by dynamic execution sink",
                        "description": "User parameters are passed directly into dynamic execution sinks without strict allowlisting or lexical isolation.",
                        "mitigation": "Replace dynamic evaluation with parameterized AST parsers or safe static data structures.",
                    },
                    {
                        "id": "T-02",
                        "title": "Hardcoded Secrets Exposure",
                        "category": "Security Misconfiguration (OWASP A05)",
                        "severity": "high",
                        "attack_vector": "Source code repository and build artifact inspection",
                        "description": "Sensitive credentials or tokens stored directly in source repositories can be extracted by unauthorized parties.",
                        "mitigation": "Load all secrets from environment variables or a hardware security module / vault at runtime.",
                    },
                ],
            })

        # Finding explanation default
        return json.dumps({
            "summary": "This finding indicates insecure handling of external parameters in a critical execution context.",
            "root_cause": "The code accepts untrusted input from an external boundary and passes it to an execution sink without sufficient neutralization.",
            "impact": "Attackers can bypass authorization checks, access sensitive data, or execute unauthorized commands in the target system.",
            "remediation": "1. Implement strict input validation using schema-based validators.\n2. Use parameterized queries or safe APIs.\n3. Verify defenses with automated regression tests.",
            "fix_example": "# Before:\n# result = db.execute(f'SELECT * FROM items WHERE id = {user_id}')\n\n# After:\n# result = await db.execute(select(Item).where(Item.id == user_id))",
            "verification_steps": "Run unit and integration security tests against the patched endpoint using boundary payloads and observe HTTP 400/422 responses.",
        })

    async def health_check(self) -> tuple[bool, float, str]:
        return True, 0.5, "Mock AI client active (credentials not configured)"


def get_ai_client(settings: Settings | None = None) -> BaseAIClient:
    """Factory to instantiate the appropriate AI client based on configuration."""
    if settings is None:
        settings = get_settings()

    if settings.ai_provider == "nemotron" and settings.ai_api_key:
        return NemotronClient(
            base_url=settings.ai_base_url or "https://integrate.api.nvidia.com/v1",
            api_key=settings.ai_api_key,
            model=settings.ai_model or "nvidia/nemotron-3-ultra-550b-a55b",
            timeout_seconds=settings.ai_timeout_seconds,
            max_retries=settings.ai_max_retries,
        )

    return MockAIClient()
