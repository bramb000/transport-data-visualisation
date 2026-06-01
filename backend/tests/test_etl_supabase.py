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
            "distance_km": 12.0,
            "cost_aud": 5.77,
            "weekly_cost_aud": 50.0,
            "error": None,
        },
        "driving": {
            "duration_min": 27.7,
            "distance_km": 18.5,
            "cost_aud": 12.19,
            "weekly_cost_aud": 81.90,
            "fuel_cost_aud": 3.89,
            "toll_cost_aud": 80.0,
            "net_toll_cost_aud": 60.0,
            "toll_subsidy_aud": 20.0,
            "fuel_price_per_litre": 2.0,
            "error": None,
        },
    }
    rows = transform_commute_data(
        "campsie-central: Campsie → Central",
        "Canterbury",
        "Sydney Inner City",
        "Q1 2024",
        "2024-01",
        data,
    )
    assert len(rows) == 2
    assert rows[0]["reporting_quarter"] == "Q1 2024"
    assert rows[0]["snapshot_month"] == "2024-01"
    assert rows[0]["mode"] == HTS_MODE_PUBLIC_TRANSPORT
    assert rows[0]["origin_sa3"] == "Canterbury"
    assert rows[0]["destination_sa3"] == "Sydney Inner City"
    assert rows[0]["time_minutes"] == 40
    assert rows[0]["single_trip_cost_aud"] == 5.77
    assert rows[0]["weekly_cost_aud"] == 50.0
    assert rows[1]["mode"] == HTS_MODE_VEHICLE_DRIVER
    assert rows[1]["time_minutes"] == 28
    assert rows[1]["toll_subsidy_aud"] == 20.0


def test_transform_skips_failed_modes() -> None:
    data = {
        "fetched_at": "2026-06-01T10:00:00",
        "public_transport": {
            "duration_min": 12.0,
            "cost_aud": 3.3,
            "weekly_cost_aud": 33.0,
            "error": None,
        },
        "driving": {"duration_min": None, "cost_aud": None, "error": "ORS failed"},
    }
    rows = transform_commute_data(
        "campsie-burwood: Campsie → Burwood",
        "Canterbury",
        "Strathfield - Burwood - Ashfield",
        "Q4 2023",
        "2023-10",
        data,
    )
    assert len(rows) == 1
    assert rows[0]["mode"] == HTS_MODE_PUBLIC_TRANSPORT
