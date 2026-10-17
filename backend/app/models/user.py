"""User ORM model."""
from __future__ import annotations

import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # relationships
    projects: Mapped[list["Project"]] = relationship("Project", back_populates="owner")  # noqa: F821
    repositories: Mapped[list["Repository"]] = relationship("Repository", back_populates="owner")  # noqa: F821

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
