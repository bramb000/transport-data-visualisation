"""Tests for monthly snapshot helpers."""

import pytest

from etl.month_utils import iter_snapshot_months, month_to_reporting_quarter


def test_month_to_reporting_quarter() -> None:
    assert month_to_reporting_quarter("2024-01") == "Q1 2024"
    assert month_to_reporting_quarter("2024-04") == "Q2 2024"
    assert month_to_reporting_quarter("2024-12") == "Q4 2024"


def test_iter_snapshot_months() -> None:
    months = iter_snapshot_months("2024-11", "2025-02")
    assert months == ["2024-11", "2024-12", "2025-01", "2025-02"]


def test_iter_snapshot_months_rejects_inverted_range() -> None:
    with pytest.raises(ValueError):
        iter_snapshot_months("2025-01", "2024-12")
