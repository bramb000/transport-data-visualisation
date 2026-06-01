"""Batch ETL pipeline — warm the SQLite commute cache from etl/od_pairs.yaml.

Usage:
    cd backend
    python -m etl.run_pipeline
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

from app.models.commute import CoordinatesSchema, UserProfileSchema
from app.services.travel_service import CommuteCalculationError, calculate_commute_metrics

logger = logging.getLogger(__name__)

OD_PAIRS_PATH = Path(__file__).resolve().parent / "od_pairs.yaml"


def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        import os

        os.environ.setdefault(key.strip(), value.strip())


def load_od_pairs(config_path: Path = OD_PAIRS_PATH) -> List[Dict[str, Any]]:
    """Load OD pair definitions from YAML."""
    if not config_path.exists():
        raise FileNotFoundError(f"OD pairs config not found: {config_path}")

    with config_path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    pairs = data.get("pairs") or []
    if not isinstance(pairs, list):
        raise ValueError("'pairs' must be a list in od_pairs.yaml")
    return pairs


def _pair_to_profile(pair: Dict[str, Any]) -> UserProfileSchema:
    """Convert a YAML pair entry to a UserProfileSchema."""
    origin_data = pair.get("origin") or {}
    destination_data = pair.get("destination") or {}

    return UserProfileSchema(
        origin=CoordinatesSchema(**origin_data),
        destination=CoordinatesSchema(**destination_data),
        vehicle_profile_id=pair.get("vehicle_profile_id", "medium_car"),
        fuel_consumption_l_per_100km=pair.get("fuel_consumption_l_per_100km"),
        fuel_suburb=pair.get("fuel_suburb", "Sydney"),
    )


async def run_pipeline(config_path: Path = OD_PAIRS_PATH) -> int:
    """Process all OD pairs and populate the commute cache."""
    pairs = load_od_pairs(config_path)
    if not pairs:
        logger.warning("No pairs defined in %s — nothing to process.", config_path)
        return 0

    success_count = 0
    failure_count = 0

    for index, pair in enumerate(pairs, start=1):
        pair_id = pair.get("id", f"pair-{index}")
        try:
            profile = _pair_to_profile(pair)
            result = await calculate_commute_metrics(profile)
            success_count += 1
            logger.info(
                "[%s] cached PT $%.2f / %.1f min | driving $%.2f / %.1f min",
                pair_id,
                result.public_transport.cost_aud or 0,
                result.public_transport.duration_min or 0,
                result.driving.cost_aud or 0,
                result.driving.duration_min or 0,
            )
        except CommuteCalculationError as exc:
            failure_count += 1
            logger.error("[%s] failed: %s", pair_id, exc)
        except Exception as exc:
            failure_count += 1
            logger.exception("[%s] unexpected error: %s", pair_id, exc)

    logger.info(
        "Pipeline complete — %d succeeded, %d failed, %d total",
        success_count,
        failure_count,
        len(pairs),
    )
    return 1 if failure_count else 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    _load_dotenv()
    exit_code = asyncio.run(run_pipeline())
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
