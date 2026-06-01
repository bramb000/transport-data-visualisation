"""Unit tests for cost_engine business rules."""

from services.cost_engine import (
    OPAL_WEEKLY_CAP_AUD,
    NSW_WEEKLY_TOLL_CAP_AUD,
    calculate_car_trip_cost,
    calculate_opal_fare,
    calculate_weekly_opal_cost,
    is_toll_cap_active,
)


def test_opal_fare_band_0_3km() -> None:
    result = calculate_opal_fare(2.5)
    assert result["fare_band"] == "0_3km"
    assert result["fare_aud"] == 3.30


def test_opal_fare_band_3_8km() -> None:
    result = calculate_opal_fare(5.0)
    assert result["fare_band"] == "3_8km"
    assert result["fare_aud"] == 4.49


def test_opal_fare_band_over_8km() -> None:
    result = calculate_opal_fare(12.0)
    assert result["fare_band"] == "over_8km"
    assert result["fare_aud"] == 5.77


def test_opal_weekly_cap_on_double_commute() -> None:
    weekly = calculate_weekly_opal_cost(5.77)
    assert weekly["uncapped_weekly_aud"] == 57.70
    assert weekly["weekly_cost_aud"] == OPAL_WEEKLY_CAP_AUD
    assert weekly["opal_cap_saving_aud"] == 7.70


def test_toll_cap_active_from_q1_2024() -> None:
    assert is_toll_cap_active("Q4 2023") is False
    assert is_toll_cap_active("Q1 2024") is True
    assert is_toll_cap_active("Q4 2026") is True


def test_car_cost_includes_fuel_and_tolls_with_cap() -> None:
    result = calculate_car_trip_cost(
        distance_km=40.0,
        fuel_price_per_litre=2.0,
        corridor_toll_per_trip_aud=8.0,
        reporting_quarter="Q1 2024",
    )
    assert result["fuel_cost_aud"] == 8.40  # 40 / 100 * 10.5 * 2
    assert result["toll_cost_aud"] == 80.0  # 8 * 10 trips
    assert result["net_toll_cost_aud"] == NSW_WEEKLY_TOLL_CAP_AUD
    assert result["toll_subsidy_aud"] == 20.0
    assert result["single_trip_cost_aud"] == 16.40
