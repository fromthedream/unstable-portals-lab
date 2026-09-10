from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Portal(Base):
    __tablename__ = "portals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True, index=True)

    name: Mapped[str] = mapped_column(String(100))
    destination_world: Mapped[str] = mapped_column(String(100))

    energy: Mapped[int] = mapped_column(Integer)
    stability: Mapped[int] = mapped_column(Integer)
    creatures_inside: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    collapse_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True)
)


class CreatureBank(Base):
    __tablename__ = "creature_bank"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    free_creatures: Mapped[int] = mapped_column(Integer, default=20)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    portal_id: Mapped[int] = mapped_column(Integer)
    portal_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    action: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )