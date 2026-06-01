"""Build pre-aggregated report summary payloads for ``report_summaries_cache``."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _find_mode_row(
    snapshots: List[Dict[str, Any]],
    mode: str,
) -> Optional[Dict[str, Any]]:
    for row in snapshots:
        if row.get("mode") == mode:
            return row
    return None


def build_corridor_summary(
    *,
    reporting_quarter: str,
    origin_sa3: str,
    destination_sa3: str,
    snapshots: List[Dict[str, Any]],
    commuter_volume: int = 0,
) -> Dict[str, Any]:
    """Aggregate PT vs car snapshot metrics for a single SA3 corridor."""
    pt = _find_mode_row(snapshots, "Public transport")
    car = _find_mode_row(snapshots, "Vehicle driver")

    pt_minutes = pt.get("time_minutes") if pt else None
    car_minutes = car.get("time_minutes") if car else None
    pt_weekly = float(pt["weekly_cost_aud"]) if pt else None
    car_weekly = float(car["weekly_cost_aud"]) if car else None

    time_delta = None
    if pt_minutes is not None and car_minutes is not None:
        time_delta = pt_minutes - car_minutes

    weekly_cost_delta = None
    if pt_weekly is not None and car_weekly is not None:
        weekly_cost_delta = round(car_weekly - pt_weekly, 2)

    return {
        "reporting_quarter": reporting_quarter,
        "origin_sa3": origin_sa3,
        "destination_sa3": destination_sa3,
        "commuter_volume": commuter_volume,
        "pt_minutes": pt_minutes,
        "driving_minutes": car_minutes,
        "pt_weekly_cost_aud": pt_weekly,
        "car_weekly_cost_aud": car_weekly,
        "weekly_cost_delta_aud": weekly_cost_delta,
        "time_delta_min": time_delta,
        "toll_subsidy_aud": float(car["toll_subsidy_aud"]) if car and car.get("toll_subsidy_aud") else 0.0,
    }


def build_report_summary_rows(
    *,
    reporting_quarter: str,
    origin_sa3: str,
    destination_sa3: str,
    snapshots: List[Dict[str, Any]],
    commuter_volume: int = 0,
) -> List[Dict[str, Any]]:
    """Return insert-ready rows for ``report_summaries_cache``."""
    corridor_payload = build_corridor_summary(
        reporting_quarter=reporting_quarter,
        origin_sa3=origin_sa3,
        destination_sa3=destination_sa3,
        snapshots=snapshots,
        commuter_volume=commuter_volume,
    )

    mode_payloads = []
    for snapshot in snapshots:
        mode_payloads.append(
            {
                "mode": snapshot.get("mode"),
                "time_minutes": snapshot.get("time_minutes"),
                "single_trip_cost_aud": snapshot.get("single_trip_cost_aud"),
                "weekly_cost_aud": snapshot.get("weekly_cost_aud"),
                "toll_subsidy_aud": snapshot.get("toll_subsidy_aud"),
            }
        )

    return [
        {
            "reporting_quarter": reporting_quarter,
            "origin_sa3": origin_sa3,
            "destination_sa3": destination_sa3,
            "summary_key": "corridor_summary",
            "payload": corridor_payload,
        },
        {
            "reporting_quarter": reporting_quarter,
            "origin_sa3": origin_sa3,
            "destination_sa3": destination_sa3,
            "summary_key": "mode_breakdown",
            "payload": {"modes": mode_payloads},
        },
    ]
