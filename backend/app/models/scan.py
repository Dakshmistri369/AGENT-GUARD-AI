"""Scan ORM model (stub for Phase 2 — referenced by Project.scans relationship)."""
from __future__ import annotations

import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    repository_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )  # pending | running | completed | failed | cancelled
    stage: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )  # validating | fetching_metadata | inspecting_file_tree | running_scanners | reviewing_evidence | generating_report | completed
    source_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    configuration: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relationships
    project: Mapped["Project | None"] = relationship("Project", back_populates="scans")  # noqa: F821
    repository: Mapped["Repository | None"] = relationship("Repository", back_populates="scans")  # noqa: F821
    findings: Mapped[list["Finding"]] = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Scan id={self.id} status={self.status!r}>"
