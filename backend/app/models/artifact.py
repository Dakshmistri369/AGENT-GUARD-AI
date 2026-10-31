"""ScanArtifact ORM Model."""
from __future__ import annotations

import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ScanArtifact(Base):
    __tablename__ = "scan_artifacts"

    # Use String(64) to seamlessly accommodate both UUIDs and integers
    id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    scan_id: Mapped[int] = mapped_column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    artifact_type: Mapped[str] = mapped_column(String(32), nullable=False)  # report | sarif | log | sbom | raw_output
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_bucket: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ScanArtifact id={self.id} type={self.artifact_type} file={self.file_name}>"
