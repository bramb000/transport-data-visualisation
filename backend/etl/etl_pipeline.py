"""Supabase ETL — fetch commute metrics and bulk insert into PostgreSQL warehouse tables.

Usage:
    cd backend
    python -m etl.etl_pipeline
    python -m etl.etl_pipeline --reporting-quarter "Q1 2024"

Requires backend/.env with travel API keys plus:
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_KEY=<service_role_or_anon_key>
    REPORTING_QUARTER=Q4 2024   # optional default quarter
"""

from __future__ import annotations

import argparse
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
from services.cost_engine import build_snapshot_row
from services.report_aggregator import build_report_summary_rows
from services.travel_engine import TravelEngineError, _load_dotenv, fetch_commute_data

logger = logging.getLogger(__name__)

OD_PAIRS_PATH = Path(__file__).resolve().parent / "od_pairs.yaml"
DEFAULT_REPORTING_QUARTER = "Q4 2024"
INSERT_BATCH_SIZE = 100

HTS_MODE_PUBLIC_TRANSPORT = "Public transport"
HTS_MODE_VEHICLE_DRIVER = "Vehicle driver"

AGGREGATE_ORIGIN_SA3 = "All Greater Sydney"


def _require_env(name: str) -> str:
    import os

    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set. Add it to backend/.env")
    return value


def resolve_reporting_quarter(cli_value: Optional[str] = None) -> str:
    """Resolve reporting quarter from CLI flag, env var, or default."""
    import os

    if cli_value:
        return cli_value.strip()
    return os.environ.get("REPORTING_QUARTER", DEFAULT_REPORTING_QUARTER).strip()


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


def _mean(values: List[float]) -> float:
    return float(sum(values) / len(values)) if values else 0.0


def build_aggregate_origin_rows(
    rows: List[Dict[str, Any]],
    *,
    aggregate_origin_sa3: str = AGGREGATE_ORIGIN_SA3,
) -> List[Dict[str, Any]]:
    """Create rollup snapshot rows for a synthetic aggregate origin.

    The report defaults to an umbrella origin label (e.g. "All Greater Sydney") for storytelling.
    This helper computes simple means across all origin SA3s for each (quarter, destination, mode).
    """
    if not rows:
        return []

    grouped: Dict[tuple[str, str, str], List[Dict[str, Any]]] = {}
    for row in rows:
        quarter = str(row.get("reporting_quarter") or "").strip()
        destination = str(row.get("destination_sa3") or "").strip()
        mode = str(row.get("mode") or "").strip()
        origin = str(row.get("origin_sa3") or "").strip()
        if not quarter or not destination or not mode:
            continue
        if origin == aggregate_origin_sa3:
            continue
        grouped.setdefault((quarter, destination, mode), []).append(row)

    aggregate_rows: List[Dict[str, Any]] = []
    for (quarter, destination, mode), bucket in grouped.items():
        time_minutes = int(round(_mean([float(r.get("time_minutes") or 0) for r in bucket])))
        single_trip = _mean([float(r.get("single_trip_cost_aud") or 0) for r in bucket])
        weekly = _mean([float(r.get("weekly_cost_aud") or 0) for r in bucket])
        distance_km = _mean([float(r.get("distance_km") or 0) for r in bucket]) if any(
            r.get("distance_km") is not None for r in bucket
        ) else None

        fuel_cost = (
            _mean([float(r.get("fuel_cost_aud") or 0) for r in bucket])
            if any(r.get("fuel_cost_aud") is not None for r in bucket)
            else None
        )
        toll_cost = (
            _mean([float(r.get("toll_cost_aud") or 0) for r in bucket])
            if any(r.get("toll_cost_aud") is not None for r in bucket)
            else None
        )
        net_toll_cost = (
            _mean([float(r.get("net_toll_cost_aud") or 0) for r in bucket])
            if any(r.get("net_toll_cost_aud") is not None for r in bucket)
            else None
        )
        toll_subsidy = (
            _mean([float(r.get("toll_subsidy_aud") or 0) for r in bucket])
            if any(r.get("toll_subsidy_aud") is not None for r in bucket)
            else None
        )
        fuel_price = (
            _mean([float(r.get("fuel_price_per_litre") or 0) for r in bucket])
            if any(r.get("fuel_price_per_litre") is not None for r in bucket)
            else None
        )

        fetched_at = max(str(r.get("fetched_at") or "") for r in bucket) or datetime.now(
            timezone.utc
        ).isoformat()

        aggregate_rows.append(
            build_snapshot_row(
                reporting_quarter=quarter,
                origin_sa3=aggregate_origin_sa3,
                destination_sa3=destination,
                route_name=f"aggregate:{aggregate_origin_sa3} → {destination}",
                mode=mode,
                time_minutes=time_minutes,
                distance_km=distance_km,
                single_trip_cost_aud=float(single_trip),
                weekly_cost_aud=float(weekly),
                fuel_cost_aud=fuel_cost,
                toll_cost_aud=toll_cost,
                net_toll_cost_aud=net_toll_cost,
                toll_subsidy_aud=toll_subsidy,
                fuel_price_per_litre=fuel_price,
                fetched_at=fetched_at,
            )
        )

    return aggregate_rows


def transform_commute_data(
    route_name: str,
    origin_sa3: str,
    destination_sa3: str,
    reporting_quarter: str,
    data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Map travel_engine output to ``historical_commute_snapshots`` insert rows."""
    fetched_at = _parse_fetched_at(data.get("fetched_at"))
    rows: List[Dict[str, Any]] = []

    pt = data.get("public_transport") or {}
    if not pt.get("error"):
        duration_min = pt.get("duration_min")
        single_trip = pt.get("cost_aud")
        weekly = pt.get("weekly_cost_aud")
        if duration_min is not None and single_trip is not None and weekly is not None:
            rows.append(
                build_snapshot_row(
                    reporting_quarter=reporting_quarter,
                    origin_sa3=origin_sa3,
                    destination_sa3=destination_sa3,
                    route_name=route_name,
                    mode=HTS_MODE_PUBLIC_TRANSPORT,
                    time_minutes=int(round(duration_min)),
                    distance_km=pt.get("distance_km"),
                    single_trip_cost_aud=float(single_trip),
                    weekly_cost_aud=float(weekly),
                    fetched_at=fetched_at,
                )
            )

    driving = data.get("driving") or {}
    if not driving.get("error"):
        duration_min = driving.get("duration_min")
        single_trip = driving.get("cost_aud")
        weekly = driving.get("weekly_cost_aud")
        if duration_min is not None and single_trip is not None and weekly is not None:
            rows.append(
                build_snapshot_row(
                    reporting_quarter=reporting_quarter,
                    origin_sa3=origin_sa3,
                    destination_sa3=destination_sa3,
                    route_name=route_name,
                    mode=HTS_MODE_VEHICLE_DRIVER,
                    time_minutes=int(round(duration_min)),
                    distance_km=driving.get("distance_km"),
                    single_trip_cost_aud=float(single_trip),
                    weekly_cost_aud=float(weekly),
                    fuel_cost_aud=driving.get("fuel_cost_aud"),
                    toll_cost_aud=driving.get("toll_cost_aud"),
                    net_toll_cost_aud=driving.get("net_toll_cost_aud"),
                    toll_subsidy_aud=driving.get("toll_subsidy_aud"),
                    fuel_price_per_litre=driving.get("fuel_price_per_litre"),
                    fetched_at=fetched_at,
                )
            )

    return rows


async def fetch_all_pairs(
    pairs: List[Dict[str, Any]],
    reporting_quarter: str,
) -> List[Dict[str, Any]]:
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
        corridor_tolls = float(pair.get("corridor_tolls_aud", 0.0))

        try:
            data = await fetch_commute_data(
                origin,
                destination,
                fuel_suburb=fuel_suburb,
                corridor_toll_per_trip_aud=corridor_tolls,
                reporting_quarter=reporting_quarter,
            )
        except TravelEngineError as exc:
            logger.error("[%s] travel engine failed: %s", pair_id, exc)
            continue
        except Exception as exc:
            logger.exception("[%s] unexpected fetch error: %s", pair_id, exc)
            continue

        if data.get("errors"):
            logger.warning("[%s] partial errors: %s", pair_id, "; ".join(data["errors"]))

        rows = transform_commute_data(
            route_name,
            origin_sa3,
            destination_sa3,
            reporting_quarter,
            data,
        )
        if not rows:
            logger.error("[%s] no valid PT or Car rows produced", pair_id)
            continue

        all_rows.extend(rows)
        logger.info(
            "[%s] prepared %d snapshot row(s) for %s (%s → %s)",
            pair_id,
            len(rows),
            reporting_quarter,
            origin_sa3,
            destination_sa3,
        )

    return all_rows


def bulk_insert_snapshots(supabase: Client, rows: List[Dict[str, Any]]) -> int:
    """Bulk upsert historical commute snapshot rows."""
    if not rows:
        logger.warning("No snapshot rows to insert.")
        return 0

    preview = pd.DataFrame(rows)
    logger.info("Upserting %d snapshot row(s):\n%s", len(rows), preview.to_string(index=False))

    inserted = 0
    for start in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[start : start + INSERT_BATCH_SIZE]
        response = (
            supabase.table("historical_commute_snapshots")
            .upsert(batch, on_conflict="reporting_quarter,origin_sa3,destination_sa3,mode")
            .execute()
        )
        inserted += len(response.data or [])

    logger.info("historical_commute_snapshots upsert complete — %d row(s) written.", inserted)
    return inserted


def bulk_insert_report_summaries(
    supabase: Client,
    snapshot_rows: List[Dict[str, Any]],
) -> int:
    """Build and upsert pre-aggregated report summary cache rows."""
    grouped: Dict[tuple[str, str, str], List[Dict[str, Any]]] = {}
    for row in snapshot_rows:
        key = (row["reporting_quarter"], row["origin_sa3"], row["destination_sa3"])
        grouped.setdefault(key, []).append(row)

    summary_rows: List[Dict[str, Any]] = []
    for (quarter, origin_sa3, destination_sa3), snapshots in grouped.items():
        summary_rows.extend(
            build_report_summary_rows(
                reporting_quarter=quarter,
                origin_sa3=origin_sa3,
                destination_sa3=destination_sa3,
                snapshots=snapshots,
            )
        )

    if not summary_rows:
        logger.warning("No report summary rows to insert.")
        return 0

    inserted = 0
    for start in range(0, len(summary_rows), INSERT_BATCH_SIZE):
        batch = summary_rows[start : start + INSERT_BATCH_SIZE]
        response = (
            supabase.table("report_summaries_cache")
            .upsert(batch, on_conflict="reporting_quarter,origin_sa3,destination_sa3,summary_key")
            .execute()
        )
        inserted += len(response.data or [])

    logger.info("report_summaries_cache upsert complete — %d row(s) written.", inserted)
    return inserted


async def run_etl(
    config_path: Path = OD_PAIRS_PATH,
    reporting_quarter: Optional[str] = None,
) -> int:
    quarter = resolve_reporting_quarter(reporting_quarter)
    pairs = load_od_pairs(config_path)
    if not pairs:
        logger.warning("No OD pairs in %s", config_path)
        return 0

    rows = await fetch_all_pairs(pairs, quarter)
    if not rows:
        logger.error("ETL produced no rows — aborting insert.")
        return 1

    aggregate_rows = build_aggregate_origin_rows(rows)
    if aggregate_rows:
        logger.info(
            "Prepared %d aggregate origin rollup row(s) for '%s'.",
            len(aggregate_rows),
            AGGREGATE_ORIGIN_SA3,
        )
        rows.extend(aggregate_rows)

    supabase = create_supabase_client()
    bulk_insert_snapshots(supabase, rows)
    bulk_insert_report_summaries(supabase, rows)
    logger.info("ETL complete for reporting quarter %s", quarter)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Supabase commute snapshot ETL")
    parser.add_argument(
        "--reporting-quarter",
        dest="reporting_quarter",
        help=f'Reporting quarter label (default: env REPORTING_QUARTER or {DEFAULT_REPORTING_QUARTER})',
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    _load_dotenv()
    exit_code = asyncio.run(run_etl(reporting_quarter=args.reporting_quarter))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
