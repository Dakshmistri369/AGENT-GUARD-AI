"""Finding ORM model (stub for Phase 2)."""
from __future__ import annotations

import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Finding(Base):
    __tablename__ = "findings"

    __table_args__ = (
        Index("ix_findings_scan_severity", "scan_id", "severity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    scan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # critical|high|medium|low|info
    confidence: Mapped[str] = mapped_column(String(16), nullable=False)  # high|medium|low
    scanner: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scanner_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    line_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    code_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # 'file_level' | 'manifest' | None
    column_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sanitized_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="unverified", index=True
    )  # unverified|confirmed|resolved|false_positive
    classification: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default="confirmed_secret", index=True
    )  # confirmed_secret | likely_placeholder | needs_review
    classification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_redacted_preview: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # relationships
    scan: Mapped["Scan"] = relationship("Scan", back_populates="findings")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Finding id={self.id} severity={self.severity!r} title={self.title!r}>"
