"""Supabase ETL — fetch commute metrics and bulk insert into PostgreSQL.

Usage:
    cd backend
    python -m etl.etl_pipeline

Requires backend/.env with travel API keys plus:
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_KEY=<service_role_or_anon_key>
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

from etl.run_pipeline import load_od_pairs
from services.travel_engine import TravelEngineError, _load_dotenv, fetch_commute_data

logger = logging.getLogger(__name__)

OD_PAIRS_PATH = Path(__file__).resolve().parent / "od_pairs.yaml"
DEFAULT_FUEL_CONSUMPTION_L_PER_100KM = 8.0

# HTS-aligned primary mode labels used in commute_metrics and hts_commuter_baselines.
HTS_MODE_PUBLIC_TRANSPORT = "Public transport"
HTS_MODE_VEHICLE_DRIVER = "Vehicle driver"


def _require_env(name: str) -> str:
    import os

    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set. Add it to backend/.env")
    return value


def create_supabase_client() -> Client:
    """Initialize the Supabase client from environment variables."""
    url = _require_env("SUPABASE_URL")
    key = _require_env("SUPABASE_KEY")
    return create_client(url, key)


def _route_label(pair: Dict[str, Any]) -> str:
    origin = (pair.get("origin") or {}).get("label") or "Origin"
    destination = (pair.get("destination") or {}).get("label") or "Destination"
    pair_id = pair.get("id")
    base = f"{origin} → {destination}"
    return f"{pair_id}: {base}" if pair_id else base


def _resolve_sa3(point: Dict[str, Any], role: str, pair_id: str) -> str:
    """Return the HTS SA3 name for an origin or destination point."""
    sa3 = (point.get("sa3") or "").strip()
    if not sa3:
        raise ValueError(
            f"[{pair_id}] Missing {role} SA3 name. "
            f"Add an `sa3` field matching TfNSW HTS SA3 labels in od_pairs.yaml."
        )
    return sa3


def _parse_fetched_at(value: Optional[str]) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    return value


def _mode_row(
    *,
    route_name: str,
    origin_sa3: str,
    destination_sa3: str,
    mode: str,
    duration_min: Optional[float],
    cost_aud: Optional[float],
    fetched_at: str,
) -> Optional[Dict[str, Any]]:
    if duration_min is None or cost_aud is None:
        return None
    return {
        "date": fetched_at,
        "route_name": route_name,
        "origin_sa3": origin_sa3,
        "destination_sa3": destination_sa3,
        "mode": mode,
        "time_minutes": int(round(duration_min)),
        "cost_dollars": round(float(cost_aud), 2),
    }


def transform_commute_data(
    route_name: str,
    origin_sa3: str,
    destination_sa3: str,
    data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Map travel_engine output to commute_metrics insert rows."""
    fetched_at = _parse_fetched_at(data.get("fetched_at"))
    rows: List[Dict[str, Any]] = []

    pt = data.get("public_transport") or {}
    if not pt.get("error"):
        pt_row = _mode_row(
            route_name=route_name,
            origin_sa3=origin_sa3,
            destination_sa3=destination_sa3,
            mode=HTS_MODE_PUBLIC_TRANSPORT,
            duration_min=pt.get("duration_min"),
            cost_aud=pt.get("cost_aud"),
            fetched_at=fetched_at,
        )
        if pt_row:
            rows.append(pt_row)

    driving = data.get("driving") or {}
    if not driving.get("error"):
        car_row = _mode_row(
            route_name=route_name,
            origin_sa3=origin_sa3,
            destination_sa3=destination_sa3,
            mode=HTS_MODE_VEHICLE_DRIVER,
            duration_min=driving.get("duration_min"),
            cost_aud=driving.get("cost_aud"),
            fetched_at=fetched_at,
        )
        if car_row:
            rows.append(car_row)

    return rows


async def fetch_all_pairs(pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fetch TfNSW + ORS data for every OD pair and return insert-ready rows."""
    all_rows: List[Dict[str, Any]] = []

    for index, pair in enumerate(pairs, start=1):
        pair_id = pair.get("id", f"pair-{index}")
        route_name = _route_label(pair)
        origin_data = pair.get("origin") or {}
        destination_data = pair.get("destination") or {}

        try:
            origin_sa3 = _resolve_sa3(origin_data, "origin", pair_id)
            destination_sa3 = _resolve_sa3(destination_data, "destination", pair_id)
        except ValueError as exc:
            logger.error("%s", exc)
            continue

        origin = (float(origin_data["lat"]), float(origin_data["lon"]))
        destination = (float(destination_data["lat"]), float(destination_data["lon"]))
        fuel_suburb = pair.get("fuel_suburb", "Sydney")
        consumption = float(
            pair.get("fuel_consumption_l_per_100km", DEFAULT_FUEL_CONSUMPTION_L_PER_100KM)
        )

        try:
            data = await fetch_commute_data(
                origin,
                destination,
                fuel_suburb=fuel_suburb,
                fuel_consumption_l_per_100km=consumption,
            )
        except TravelEngineError as exc:
            logger.error("[%s] travel engine failed: %s", pair_id, exc)
            continue
        except Exception as exc:
            logger.exception("[%s] unexpected fetch error: %s", pair_id, exc)
            continue

        if data.get("errors"):
            logger.warning("[%s] partial errors: %s", pair_id, "; ".join(data["errors"]))

        rows = transform_commute_data(route_name, origin_sa3, destination_sa3, data)
        if not rows:
            logger.error("[%s] no valid PT or Car rows produced", pair_id)
            continue

        all_rows.extend(rows)
        logger.info(
            "[%s] prepared %d row(s) for Supabase (%s → %s)",
            pair_id,
            len(rows),
            origin_sa3,
            destination_sa3,
        )

    return all_rows


def bulk_insert_metrics(supabase: Client, rows: List[Dict[str, Any]]) -> int:
    """Bulk insert commute metric rows via Supabase REST API."""
    if not rows:
        logger.warning("No rows to insert.")
        return 0

    preview = pd.DataFrame(rows)
    logger.info("Inserting %d row(s):\n%s", len(rows), preview.to_string(index=False))

    response = supabase.table("commute_metrics").insert(rows).execute()
    inserted = len(response.data or [])
    logger.info("Supabase insert complete — %d row(s) written.", inserted)
    return inserted


async def run_etl(config_path: Path = OD_PAIRS_PATH) -> int:
    pairs = load_od_pairs(config_path)
    if not pairs:
        logger.warning("No OD pairs in %s", config_path)
        return 0

    rows = await fetch_all_pairs(pairs)
    if not rows:
        logger.error("ETL produced no rows — aborting insert.")
        return 1

    supabase = create_supabase_client()
    bulk_insert_metrics(supabase, rows)
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    _load_dotenv()
    exit_code = asyncio.run(run_etl())
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
