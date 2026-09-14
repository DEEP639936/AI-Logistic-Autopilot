"""SQLAlchemy engine/session wiring for the shared Prisma-created SQLite DB.

Compatibility notes
-------------------
* The database file is the EXISTING `db/custom.db` created by Prisma. Tables
  use camelCase quoted identifiers and Prisma stores `DateTime` columns as
  **INTEGER milliseconds since epoch** (verified empirically via
  `typeof(plannedDeparture) == 'integer'`). Therefore every datetime column
  below is a `BigInteger` and conversions go through `to_ms` / `from_ms`.
* `check_same_thread=False` lets FastAPI worker threads share the engine;
  WAL journal mode + a 5s busy_timeout keep concurrent reads/writes happy.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_PATH

connect_args = {"check_same_thread": False}
engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args=connect_args,
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _record) -> None:  # noqa: ANN001
    """WAL + busy timeout: safe concurrent access alongside the Next.js API."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


class Base(DeclarativeBase):
    """Declarative base; models mirror the Prisma schema table-for-table."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a short-lived session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# DateTime <-> INTEGER-ms helpers (the #1 storage-format compatibility rule)
# ---------------------------------------------------------------------------
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def to_ms(value: datetime) -> int:
    """Convert a (naive-UTC or aware) datetime to epoch milliseconds."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def from_ms(value: int | None) -> datetime | None:
    """Convert epoch milliseconds (Prisma storage format) to an aware UTC datetime."""
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def iso_utc(value: int | None) -> str | None:
    """Format epoch-ms exactly like JS `Date.toISOString()`: 2026-02-14T09:30:00.123Z."""
    if value is None:
        return None
    dt = from_ms(value)
    assert dt is not None
    return f"{dt.strftime('%Y-%m-%dT%H:%M:%S.')}{dt.microsecond // 1000:03d}Z"
