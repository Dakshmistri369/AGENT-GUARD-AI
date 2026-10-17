"""
Repository ORM model for GitHub repositories.
Stores validated repository identity, default branch, pinned commit SHA, and metadata.
"""
from __future__ import annotations

import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    owner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(128), nullable=False, default="main")
    pinned_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # relationships
    owner: Mapped["User"] = relationship("User", back_populates="repositories")  # noqa: F821
    scans: Mapped[list["Scan"]] = relationship(
        "Scan", back_populates="repository", cascade="all, delete-orphan"
    )  # noqa: F821

    def __repr__(self) -> str:
        return f"<Repository id={self.id} full_name={self.full_name!r}>"
