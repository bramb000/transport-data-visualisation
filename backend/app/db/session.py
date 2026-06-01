"""Lightweight SQLite connection context manager."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from app.db.database import get_database_path, init_schema


@contextmanager
def db_session() -> Iterator[sqlite3.Connection]:
    """Open a SQLite connection, ensure schema exists, commit on success."""
    db_path = get_database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        init_schema(connection)
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
