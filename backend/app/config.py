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


_INSECURE_SENTINEL = "CHANGE_ME_BEFORE_PRODUCTION"  # nosec B105


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

    # ── Upload & Archive Limits (Large File Defense) ──────────────────────────
    max_upload_size_mb: int = 100
    max_extracted_size_mb: int = 500
    max_single_file_mb: int = 20
    max_compression_ratio: int = 100
    max_archive_files: int = 10_000

    # ── Pre-Scan Source File Filters ──────────────────────────────────────────
    max_scannable_file_bytes: int = 1 * 1024 * 1024  # 1 MB source limit

    # 🔒 Scanner Timeouts — Three independent layers:
    # Layer 1: Semgrep internal per-rule timeout (0 = no per-rule limit, Semgrep official)
    semgrep_rule_timeout_seconds: int = 0
    # Layer 2: Per-scanner process timeout (each individual scanner subprocess)
    scanner_timeout_seconds: int = 600              # 10 min per scanner subprocess
    # Layer 3: Outer job safety timeout (entire scan job across ALL scanners)
    scanner_job_max_runtime_seconds: int = 1800     # 30 min — configurable via env var
    # Legacy alias kept for backwards compat; use scanner_timeout_seconds instead

    # ── AI Snippet Extraction ─────────────────────────────────────────────────
    ai_context_lines: int = 15
    ai_max_snippet_chars: int = 4000

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
    scan_timeout_seconds: int = 600

    # ── OSV Vulnerability Service ─────────────────────────────────────────────
    # Google OSV API (https://api.osv.dev/v1) is free and public (zero API key needed).
    # osv_api_key is optional and only applied if routing through an authenticated proxy.
    osv_api_base_url: str = "https://api.osv.dev/v1"
    osv_api_key: str = ""

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_jwt_secret: str = ""
    enable_demo_auth: bool = False

    # ── Derived properties ────────────────────────────────────────────────────
    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def max_extracted_size_bytes(self) -> int:
        return self.max_extracted_size_mb * 1024 * 1024

    @property
    def max_single_file_bytes(self) -> int:
        return self.max_single_file_mb * 1024 * 1024

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            # Normalize scheme to asyncpg
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)

            # Auto-route direct Supabase host to IPv4-compatible pooler
            # Direct db.<ref>.supabase.co is IPv6-only, which fails on IPv4 networks and Render
            # Generic host replacement preserving user credentials securely without hardcoding secrets:
            import re
            v = re.sub(
                r"@db\.([a-z0-9_-]+)\.supabase\.co:5432",
                r"@aws-0-ap-northeast-2.pooler.supabase.com:5432",
                v,
            )
        return v

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
            if self.jwt_secret == _INSECURE_SENTINEL:
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
