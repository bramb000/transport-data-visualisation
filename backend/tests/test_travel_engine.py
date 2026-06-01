"""Unit tests for travel_engine cost calculations."""

from services.cost_engine import calculate_opal_fare


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


def test_opal_fare_off_peak() -> None:
    result = calculate_opal_fare(5.0, peak=False)
    assert result["fare_aud"] == 3.14
