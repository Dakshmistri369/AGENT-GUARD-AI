"""
AgentGuard AI — Configuration
Fail-fast environment validation with actionable errors.
No secret values are ever logged or revealed in error messages.
"""
from __future__ import annotations

import sys
from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = "AgentGuard AI"
    app_version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./agentguard.db"
    # NOTE: SQLite is default for local dev (documented). Switch to
    #       postgresql+asyncpg://... for staging/production.
    # Use DATABASE_URL env var to override.

    # ── CORS ──────────────────────────────────────────────────────────────────
    frontend_origin: str = "http://localhost:5173"

    # ── Upload ────────────────────────────────────────────────────────────────
    max_upload_size_mb: int = 50

    # ── AI Provider ───────────────────────────────────────────────────────────
    # Default: mock — the whole application works with zero API credentials.
    # Set AI_PROVIDER=nemotron and supply AI_BASE_URL / AI_API_KEY / AI_MODEL
    # for real NVIDIA Nemotron LLM execution.
    ai_provider: Literal["mock", "nemotron"] = "mock"
    ai_base_url: str = "https://integrate.api.nvidia.com/v1"
    ai_api_key: str = ""          # never logged
    ai_model: str = "nvidia/llama-3.1-nemotron-70b-instruct"
    ai_timeout_seconds: int = 60
    ai_max_retries: int = 2

    # NVIDIA alias support (from NVIDIA_API_KEY / NVIDIA_MODEL env vars)
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/llama-3.1-nemotron-70b-instruct"

    # ── Sandbox ───────────────────────────────────────────────────────────────
    sandbox_cpu_limit: str = "0.5"
    sandbox_memory_limit: str = "256m"
    sandbox_timeout_seconds: int = 60
    sandbox_network_disabled: bool = True

    # ── Auth (temporary demo mode — see docs/auth_roadmap.md) ─────────────────
    jwt_secret: str = "CHANGE_ME_BEFORE_PRODUCTION"
    demo_user_id: int = 1
    demo_user_email: str = "demo@agentguard.local"

    # ── GitHub & Repository Scanning ──────────────────────────────────────────
    github_token: str = ""        # optional server-side PAT, never logged
    scan_workspace_dir: str = "./scan_workspaces"
    max_repo_files: int = 5000
    max_file_size_bytes: int = 5 * 1024 * 1024  # 5 MB per file
    max_tree_depth: int = 20
    scan_timeout_seconds: int = 120

    # ── OSV Vulnerability Service ─────────────────────────────────────────────
    # Google OSV API (https://api.osv.dev/v1) is free and public (zero API key needed).
    # osv_api_key is optional and only applied if routing through an authenticated proxy.
    osv_api_base_url: str = "https://api.osv.dev/v1"
    osv_api_key: str = ""

    # ── Derived properties ────────────────────────────────────────────────────
    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    # ── Validators ────────────────────────────────────────────────────────────
    @field_validator("max_upload_size_mb")
    @classmethod
    def validate_upload_size(cls, v: int) -> int:
        if v <= 0 or v > 500:
            raise ValueError("MAX_UPLOAD_SIZE_MB must be between 1 and 500")
        return v

    @field_validator("ai_timeout_seconds")
    @classmethod
    def validate_ai_timeout(cls, v: int) -> int:
        if v <= 0 or v > 300:
            raise ValueError("AI_TIMEOUT_SECONDS must be between 1 and 300")
        return v

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.is_production:
            errors: list[str] = []
            if self.jwt_secret == "CHANGE_ME_BEFORE_PRODUCTION":
                errors.append("JWT_SECRET must be set to a strong random value in production")
            if self.debug:
                errors.append("DEBUG must be False in production")
            if self.ai_provider == "mock":
                # Allow mock in production only if explicitly acknowledged via env var
                import os
                if not os.getenv("AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION"):
                    errors.append(
                        "AI_PROVIDER=mock in production requires "
                        "AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION=1 to acknowledge"
                    )
            if "*" in self.frontend_origin:
                errors.append("FRONTEND_ORIGIN must not be a wildcard in production")
            if errors:
                # Fail fast with actionable message — no secret values in output
                msg = "Production startup blocked due to insecure configuration:\n"
                msg += "\n".join(f"  - {e}" for e in errors)
                print(f"[AgentGuard FATAL] {msg}", file=sys.stderr)
                sys.exit(1)
        return self

    @model_validator(mode="after")
    def validate_nemotron_config(self) -> "Settings":
        # Resolve NVIDIA_* aliases if present
        if not self.ai_api_key and self.nvidia_api_key:
            self.ai_api_key = self.nvidia_api_key
        if not self.ai_base_url and self.nvidia_base_url:
            self.ai_base_url = self.nvidia_base_url
        if (not self.ai_model or self.ai_model == "nvidia/nemotron-3-ultra-550b-a55b") and self.nvidia_model:
            self.ai_model = self.nvidia_model

        if self.ai_provider == "nemotron" and self.is_production:
            missing = []
            if not self.ai_base_url:
                missing.append("AI_BASE_URL (or NVIDIA_BASE_URL)")
            if not self.ai_api_key:
                missing.append("AI_API_KEY / NVIDIA_API_KEY (secret, do not log)")
            if not self.ai_model:
                missing.append("AI_MODEL (or NVIDIA_MODEL)")
            if missing:
                raise ValueError(
                    f"AI_PROVIDER=nemotron in production requires these env vars to be set: "
                    f"{', '.join(missing)}. "
                    f"Alternatively, set AI_PROVIDER=mock to run without credentials."
                )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings singleton — fails fast on first call if config is invalid."""
    return Settings()
