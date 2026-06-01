"""Tests for Supabase ETL transform logic."""

from etl.etl_pipeline import (
    HTS_MODE_PUBLIC_TRANSPORT,
    HTS_MODE_VEHICLE_DRIVER,
    transform_commute_data,
)


def test_transform_commute_data_pt_and_car() -> None:
    data = {
        "fetched_at": "2026-06-01T10:00:00",
        "public_transport": {
            "duration_min": 40.3,
            "cost_aud": 5.77,
            "error": None,
        },
        "driving": {
            "duration_min": 27.7,
            "cost_aud": 2.19,
            "error": None,
        },
    }
    rows = transform_commute_data(
        "campsie-central: Campsie → Central",
        "Canterbury",
        "Sydney Inner City",
        data,
    )
    assert len(rows) == 2
    assert rows[0]["mode"] == HTS_MODE_PUBLIC_TRANSPORT
    assert rows[0]["origin_sa3"] == "Canterbury"
    assert rows[0]["destination_sa3"] == "Sydney Inner City"
    assert rows[0]["time_minutes"] == 40
    assert rows[0]["cost_dollars"] == 5.77
    assert rows[1]["mode"] == HTS_MODE_VEHICLE_DRIVER
    assert rows[1]["time_minutes"] == 28
    assert rows[1]["cost_dollars"] == 2.19


def test_transform_skips_failed_modes() -> None:
    data = {
        "fetched_at": "2026-06-01T10:00:00",
        "public_transport": {"duration_min": 12.0, "cost_aud": 3.3, "error": None},
        "driving": {"duration_min": None, "cost_aud": None, "error": "ORS failed"},
    }
    rows = transform_commute_data(
        "campsie-burwood: Campsie → Burwood",
        "Canterbury",
        "Strathfield - Burwood - Ashfield",
        data,
    )
    assert len(rows) == 1
    assert rows[0]["mode"] == HTS_MODE_PUBLIC_TRANSPORT
