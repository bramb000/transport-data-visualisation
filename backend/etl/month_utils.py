"""Calendar month helpers for monthly historical snapshots."""

from __future__ import annotations

import re
from datetime import datetime

MONTH_KEY_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


def month_to_reporting_quarter(snapshot_month: str) -> str:
    """Map ``2024-04`` → ``Q2 2024`` for fare/toll rules tied to reporting quarter."""
    match = MONTH_KEY_PATTERN.match(snapshot_month.strip())
    if not match:
        raise ValueError(f"Invalid snapshot_month '{snapshot_month}'. Expected YYYY-MM.")
    year = int(match.group(1))
    month = int(match.group(2))
    if month < 1 or month > 12:
        raise ValueError(f"Invalid month in snapshot_month '{snapshot_month}'.")
    quarter = (month - 1) // 3 + 1
    return f"Q{quarter} {year}"


def current_snapshot_month() -> str:
    """UTC calendar month for default ETL runs."""
    now = datetime.utcnow()
    return f"{now.year}-{now.month:02d}"


def iter_snapshot_months(start_month: str, end_month: str) -> list[str]:
    """Inclusive list of ``YYYY-MM`` keys from start through end."""
    start = _parse_month(start_month)
    end = _parse_month(end_month)
    if start > end:
        raise ValueError(f"Start month {start_month} is after end month {end_month}")

    months: list[str] = []
    year, month = start
    while (year, month) <= end:
        months.append(f"{year}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def _parse_month(value: str) -> tuple[int, int]:
    match = MONTH_KEY_PATTERN.match(value.strip())
    if not match:
        raise ValueError(f"Invalid month '{value}'. Expected YYYY-MM.")
    return int(match.group(1)), int(match.group(2))
