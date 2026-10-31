"""
AgentGuard AI — Core Structured Logging & Secret Redaction.
Provides structured logging while preventing sensitive credentials, tokens,
and source-code secrets from leaking into application logs.
"""
from __future__ import annotations

import logging
import re
import sys
from typing import Any

# Sensitive patterns to redact in log messages
_REDACTION_PATTERNS = [
    (re.compile(r"(Bearer\s+)[a-zA-Z0-9_\-\.]+", re.IGNORECASE), r"\1[REDACTED_JWT]"),
    (re.compile(r"(api[_-]?key[\"']?\s*[:=]\s*[\"']?)[a-zA-Z0-9_\-]+", re.IGNORECASE), r"\1[REDACTED_KEY]"),
    (re.compile(r"(password[\"']?\s*[:=]\s*[\"']?)[^\"'\s]+", re.IGNORECASE), r"\1[REDACTED_PASSWORD]"),
    (re.compile(r"(postgres(?:ql)?(?:\+asyncpg)?://[^:]+:)[^@]+(@)", re.IGNORECASE), r"\1[REDACTED_DB_PWD]\2"),
    (re.compile(r"(rediss?://:[^@]+@)", re.IGNORECASE), "redis://:[REDACTED_REDIS_PWD]@"),
    (re.compile(r"(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{82})"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"(nvapi-[a-zA-Z0-9\-_]{32,})"), "[REDACTED_NVIDIA_KEY]"),
]


class SecretSanitizingFilter(logging.Filter):
    """Logging filter that scrubs tokens, passwords, and keys from all log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, replacement in _REDACTION_PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)
        if record.args:
            sanitized_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    for pattern, replacement in _REDACTION_PATTERNS:
                        arg = pattern.sub(replacement, arg)
                sanitized_args.append(arg)
            record.args = tuple(sanitized_args)
        return True


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root and application loggers with the redaction filter."""
    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    handler.addFilter(SecretSanitizingFilter())

    # Avoid duplicate handlers on re-runs
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Retrieve a child logger with automatic secret redaction attached."""
    logger = logging.getLogger(name)
    logger.addFilter(SecretSanitizingFilter())
    return logger
