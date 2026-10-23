"""
Automation & n8n Audit Logging Models.
Provides persistent audit trail and PR check history for autonomous workflows.
"""
from __future__ import annotations

import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class AutomationAuditLog(Base):
    __tablename__ = "automation_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workflow_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    execution_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    scan_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="success")
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relationships
    user: Mapped["User"] = relationship("User")  # noqa: F821
    scan: Mapped["Scan | None"] = relationship("Scan")  # noqa: F821

    def __repr__(self) -> str:
        return f"<AutomationAuditLog id={self.id} event={self.event_type!r} status={self.status!r}>"


class AutomationPRCheck(Base):
    __tablename__ = "automation_pr_checks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    repository_full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    pr_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    scan_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scans.id", ondelete="SET NULL"), nullable=True, index=True
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False, default="ALLOW")
    critical_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    high_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deterministic_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_estimated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relationships
    user: Mapped["User"] = relationship("User")  # noqa: F821
    scan: Mapped["Scan | None"] = relationship("Scan")  # noqa: F821

    def __repr__(self) -> str:
        return f"<AutomationPRCheck id={self.id} repo={self.repository_full_name!r} pr={self.pr_number} decision={self.decision!r}>"
