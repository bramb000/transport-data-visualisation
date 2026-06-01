"""Shared pytest fixtures."""

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def isolated_sqlite_db(monkeypatch, tmp_path):
    """Use a fresh SQLite file per test to avoid cache cross-talk."""
    db_file = tmp_path / "commute_test.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{db_file}")
    yield db_file
