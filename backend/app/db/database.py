"""SQLite schema and cache helpers for commute responses."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

CREATE_CACHED_COMMUTES_TABLE = """
CREATE TABLE IF NOT EXISTS cached_commutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin_destination_hash TEXT NOT NULL UNIQUE,
    response_json TEXT NOT NULL
);
"""

CREATE_HASH_INDEX = """
CREATE INDEX IF NOT EXISTS idx_cached_commutes_hash
ON cached_commutes (origin_destination_hash);
"""


def get_database_path() -> Path:
    """Resolve SQLite file path from settings.database_url."""
    url = settings.database_url
    if not url.startswith("sqlite:///"):
        raise ValueError(f"Unsupported database_url (expected sqlite:///): {url}")
    relative = url.removeprefix("sqlite:///")
    path = Path(relative)
    if not path.is_absolute():
        # Relative to backend/ working directory (where uvicorn/pytest run)
        path = Path.cwd() / path
    return path


def init_schema(connection) -> None:
    """Create tables and indexes if they do not exist."""
    connection.execute(CREATE_CACHED_COMMUTES_TABLE)
    connection.execute(CREATE_HASH_INDEX)


def fetch_cached_response(connection, origin_destination_hash: str) -> Optional[str]:
    """Return cached JSON string for a hash, or None on miss."""
    row = connection.execute(
        "SELECT response_json FROM cached_commutes WHERE origin_destination_hash = ?",
        (origin_destination_hash,),
    ).fetchone()
    if row is None:
        return None
    return row[0]


def store_cached_response(connection, origin_destination_hash: str, response_json: str) -> None:
    """Insert or replace a cached commute response."""
    connection.execute(
        """
        INSERT INTO cached_commutes (origin_destination_hash, response_json)
        VALUES (?, ?)
        ON CONFLICT(origin_destination_hash) DO UPDATE SET
            response_json = excluded.response_json
        """,
        (origin_destination_hash, response_json),
    )
    logger.debug("Cached commute response for hash %s", origin_destination_hash[:12])


def is_cache_entry_fresh(response_json: str, ttl_hours: int) -> bool:
    """Return True if the cached payload is within the configured TTL."""
    try:
        payload = json.loads(response_json)
        fetched_at = payload.get("fetched_at")
        if not fetched_at:
            return False
        fetched_time = datetime.fromisoformat(fetched_at)
        expiry = fetched_time + timedelta(hours=ttl_hours)
        return datetime.now() <= expiry
    except (json.JSONDecodeError, TypeError, ValueError):
        return False
