"""Pure cost-calculation logic for Sydney commute affordability snapshots.

No HTTP calls — all inputs are distances, prices, tolls, and reporting quarters.
TfNSW Opal fare source: https://www.transportnsw.info/tickets-fares/fares/adult-opal-fares
NSW weekly toll cap (from Q1 2024): https://www.nsw.gov.au/driving-boating-and-transport/tolls
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Union

# Standard report vehicle consumption for private-car fuel cost (L/100 km).
DEFAULT_FUEL_CONSUMPTION_L_PER_100KM = 10.5

# Five-day work week, return trip each day → 10 single trips.
WEEKLY_COMMUTE_TRIPS = 10

# Adult Opal weekly travel cap (AUD).
OPAL_WEEKLY_CAP_AUD = 50.0

# NSW personal weekly toll cap rebate threshold (from Q1 2024).
NSW_WEEKLY_TOLL_CAP_AUD = 60.0

QUARTER_PATTERN = re.compile(r"^Q([1-4])\s+(\d{4})$")


def calculate_opal_fare(distance_km: float, peak: bool = True) -> Dict[str, Union[float, str]]:
    """Map track distance to Sydney adult Opal single-trip fare bands.

    Bands (km): 0–3, 3–8, 8+ (peak adult bus/train equivalent bands).
    """
    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")

    off_peak_map = {"0_3km": 2.31, "3_8km": 3.14, "over_8km": 4.03}

    if distance_km <= 3.0:
        band_label, peak_fare = "0_3km", 3.30
    elif distance_km <= 8.0:
        band_label, peak_fare = "3_8km", 4.49
    else:
        band_label, peak_fare = "over_8km", 5.77

    selected_fare = peak_fare if peak else off_peak_map[band_label]

    return {
        "distance_km": round(distance_km, 3),
        "fare_band": band_label,
        "fare_aud": round(selected_fare, 2),
        "fare_peak_aud": round(peak_fare, 2),
        "fare_off_peak_aud": round(off_peak_map[band_label], 2),
        "fare_type": "opal_adult_bus_peak" if peak else "opal_adult_bus_off_peak",
    }


def parse_reporting_quarter(reporting_quarter: str) -> tuple[int, int]:
    """Return (quarter_number, year) from labels like ``Q1 2024``."""
    match = QUARTER_PATTERN.match(reporting_quarter.strip())
    if not match:
        raise ValueError(
            f"Invalid reporting_quarter '{reporting_quarter}'. Expected format: Q1 2024"
        )
    return int(match.group(1)), int(match.group(2))


def is_toll_cap_active(reporting_quarter: str) -> bool:
    """Return True when the NSW $60 weekly toll cap applies (Q1 2024 through 2026)."""
    quarter, year = parse_reporting_quarter(reporting_quarter)
    if year < 2024:
        return False
    if year > 2026:
        return False
    if year == 2024 and quarter < 1:
        return False
    return True


def calculate_weekly_opal_cost(
    single_trip_fare_aud: float,
    *,
    trips_per_week: int = WEEKLY_COMMUTE_TRIPS,
    weekly_cap_aud: float = OPAL_WEEKLY_CAP_AUD,
) -> Dict[str, float]:
    """Apply the $50 weekly Opal cap across a 5-day double-commute interval."""
    if single_trip_fare_aud < 0:
        raise ValueError("single_trip_fare_aud must be non-negative")
    if trips_per_week < 0:
        raise ValueError("trips_per_week must be non-negative")

    uncapped = round(single_trip_fare_aud * trips_per_week, 2)
    capped = round(min(uncapped, weekly_cap_aud), 2)
    return {
        "single_trip_fare_aud": round(single_trip_fare_aud, 2),
        "trips_per_week": float(trips_per_week),
        "uncapped_weekly_aud": uncapped,
        "weekly_cost_aud": capped,
        "opal_cap_saving_aud": round(uncapped - capped, 2),
    }


def calculate_fuel_cost(
    distance_km: float,
    fuel_price_per_litre: float,
    *,
    consumption_l_per_100km: float = DEFAULT_FUEL_CONSUMPTION_L_PER_100KM,
) -> Dict[str, float]:
    """Calculate single-trip fuel cost: (distance / 100 × consumption × fuel price)."""
    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")
    if fuel_price_per_litre < 0:
        raise ValueError("fuel_price_per_litre must be non-negative")

    litres = distance_km * (consumption_l_per_100km / 100.0)
    cost_aud = litres * fuel_price_per_litre
    return {
        "distance_km": round(distance_km, 3),
        "consumption_l_per_100km": consumption_l_per_100km,
        "fuel_price_per_litre": round(fuel_price_per_litre, 3),
        "litres_used": round(litres, 3),
        "fuel_cost_aud": round(cost_aud, 2),
    }


def apply_weekly_toll_cap(
    corridor_toll_per_trip_aud: float,
    reporting_quarter: str,
    *,
    trips_per_week: int = WEEKLY_COMMUTE_TRIPS,
    weekly_cap_aud: float = NSW_WEEKLY_TOLL_CAP_AUD,
) -> Dict[str, float]:
    """Apply NSW weekly toll cap rebate when active; log variance as subsidy."""
    if corridor_toll_per_trip_aud < 0:
        raise ValueError("corridor_toll_per_trip_aud must be non-negative")

    gross_weekly_tolls = round(corridor_toll_per_trip_aud * trips_per_week, 2)

    if is_toll_cap_active(reporting_quarter) and gross_weekly_tolls > weekly_cap_aud:
        net_weekly_tolls = weekly_cap_aud
        toll_subsidy = round(gross_weekly_tolls - weekly_cap_aud, 2)
    else:
        net_weekly_tolls = gross_weekly_tolls
        toll_subsidy = 0.0

    return {
        "corridor_toll_per_trip_aud": round(corridor_toll_per_trip_aud, 2),
        "trips_per_week": float(trips_per_week),
        "toll_cost_aud": gross_weekly_tolls,
        "net_toll_cost_aud": round(net_weekly_tolls, 2),
        "toll_subsidy_aud": toll_subsidy,
    }


def calculate_car_trip_cost(
    distance_km: float,
    fuel_price_per_litre: float,
    corridor_toll_per_trip_aud: float,
    reporting_quarter: str,
    *,
    consumption_l_per_100km: float = DEFAULT_FUEL_CONSUMPTION_L_PER_100KM,
    trips_per_week: int = WEEKLY_COMMUTE_TRIPS,
) -> Dict[str, Any]:
    """Private car cost: fuel + corridor tolls with optional weekly toll cap."""
    fuel = calculate_fuel_cost(
        distance_km,
        fuel_price_per_litre,
        consumption_l_per_100km=consumption_l_per_100km,
    )
    tolls = apply_weekly_toll_cap(
        corridor_toll_per_trip_aud,
        reporting_quarter,
        trips_per_week=trips_per_week,
    )

    single_trip_total = round(fuel["fuel_cost_aud"] + corridor_toll_per_trip_aud, 2)
    weekly_fuel = round(fuel["fuel_cost_aud"] * trips_per_week, 2)
    weekly_cost = round(weekly_fuel + tolls["net_toll_cost_aud"], 2)

    return {
        "single_trip_cost_aud": single_trip_total,
        "weekly_cost_aud": weekly_cost,
        "fuel_cost_aud": fuel["fuel_cost_aud"],
        "weekly_fuel_cost_aud": weekly_fuel,
        "toll_cost_aud": tolls["toll_cost_aud"],
        "net_toll_cost_aud": tolls["net_toll_cost_aud"],
        "toll_subsidy_aud": tolls["toll_subsidy_aud"],
        "distance_km": fuel["distance_km"],
        "fuel_price_per_litre": fuel["fuel_price_per_litre"],
        "consumption_l_per_100km": fuel["consumption_l_per_100km"],
        "litres_used": fuel["litres_used"],
        "corridor_toll_per_trip_aud": tolls["corridor_toll_per_trip_aud"],
    }


def calculate_pt_trip_cost(
    distance_km: float,
    reporting_quarter: str,
    *,
    peak: bool = True,
    trips_per_week: int = WEEKLY_COMMUTE_TRIPS,
) -> Dict[str, Any]:
    """Public transport cost from track distance with weekly Opal cap."""
    _ = reporting_quarter  # Reserved for future quarter-specific fare tables.
    fare = calculate_opal_fare(distance_km, peak=peak)
    weekly = calculate_weekly_opal_cost(
        float(fare["fare_aud"]),
        trips_per_week=trips_per_week,
    )
    return {
        "single_trip_cost_aud": fare["fare_aud"],
        "weekly_cost_aud": weekly["weekly_cost_aud"],
        "fare": fare,
        "weekly": weekly,
    }


def build_snapshot_row(
    *,
    reporting_quarter: str,
    snapshot_month: str,
    origin_sa3: str,
    destination_sa3: str,
    route_name: str,
    mode: str,
    time_minutes: int,
    distance_km: Optional[float],
    single_trip_cost_aud: float,
    weekly_cost_aud: float,
    fuel_cost_aud: Optional[float] = None,
    toll_cost_aud: Optional[float] = None,
    net_toll_cost_aud: Optional[float] = None,
    toll_subsidy_aud: Optional[float] = None,
    fuel_price_per_litre: Optional[float] = None,
    fetched_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Shape a row for ``historical_commute_snapshots`` inserts."""
    row: Dict[str, Any] = {
        "reporting_quarter": reporting_quarter,
        "snapshot_month": snapshot_month,
        "origin_sa3": origin_sa3,
        "destination_sa3": destination_sa3,
        "route_name": route_name,
        "mode": mode,
        "time_minutes": time_minutes,
        "single_trip_cost_aud": round(single_trip_cost_aud, 2),
        "weekly_cost_aud": round(weekly_cost_aud, 2),
    }
    if distance_km is not None:
        row["distance_km"] = round(distance_km, 3)
    if fuel_cost_aud is not None:
        row["fuel_cost_aud"] = round(fuel_cost_aud, 2)
    if toll_cost_aud is not None:
        row["toll_cost_aud"] = round(toll_cost_aud, 2)
    if net_toll_cost_aud is not None:
        row["net_toll_cost_aud"] = round(net_toll_cost_aud, 2)
    if toll_subsidy_aud is not None:
        row["toll_subsidy_aud"] = round(toll_subsidy_aud, 2)
    if fuel_price_per_litre is not None:
        row["fuel_price_per_litre"] = round(fuel_price_per_litre, 3)
    if fetched_at is not None:
        row["fetched_at"] = fetched_at
    return row
