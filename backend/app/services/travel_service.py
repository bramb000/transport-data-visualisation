"""Service layer bridging API schemas and the travel_engine data module."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

from app.config import VehicleProfileDefaults, settings
from app.db.database import (
    fetch_cached_response,
    is_cache_entry_fresh,
    store_cached_response,
)
from app.db.session import db_session
from app.models.commute import CommuteMetricsResponse, UserProfileSchema
from services.travel_engine import TravelEngineError, fetch_commute_data

logger = logging.getLogger(__name__)


class CommuteCalculationError(Exception):
    """Raised when neither public transport nor driving data could be retrieved."""


def _resolve_fuel_consumption(profile: UserProfileSchema) -> float:
    if profile.fuel_consumption_l_per_100km is not None:
        return profile.fuel_consumption_l_per_100km
    defaults = VehicleProfileDefaults.as_dict()
    return defaults.get(profile.vehicle_profile_id, VehicleProfileDefaults.MEDIUM_CAR)


def _commute_cache_hash(profile: UserProfileSchema) -> str:
    """Stable hash from origin/destination coordinates (plus vehicle inputs for driving cost)."""
    origin_str = f"{profile.origin.lat:.6f},{profile.origin.lon:.6f}"
    destination_str = f"{profile.destination.lat:.6f},{profile.destination.lon:.6f}"
    consumption = _resolve_fuel_consumption(profile)
    key_material = "|".join(
        [
            origin_str,
            destination_str,
            profile.vehicle_profile_id,
            str(consumption),
            profile.fuel_suburb,
        ]
    )
    return hashlib.sha256(key_material.encode("utf-8")).hexdigest()


def _load_cached_metrics(cache_hash: str) -> Optional[CommuteMetricsResponse]:
    """Return cached commute metrics when fresh, otherwise None."""
    with db_session() as connection:
        cached_json = fetch_cached_response(connection, cache_hash)
        if cached_json is None:
            return None
        if not is_cache_entry_fresh(cached_json, settings.cache_ttl_hours):
            logger.info("Cache stale for hash %s — refreshing", cache_hash[:12])
            return None
        logger.info("Cache hit for hash %s", cache_hash[:12])
        return CommuteMetricsResponse.model_validate(json.loads(cached_json))


def _save_cached_metrics(cache_hash: str, response: CommuteMetricsResponse) -> None:
    with db_session() as connection:
        store_cached_response(connection, cache_hash, response.model_dump_json())


async def calculate_commute_metrics(profile: UserProfileSchema) -> CommuteMetricsResponse:
    """Run the travel engine for a user profile and return normalized commute metrics."""
    cache_hash = _commute_cache_hash(profile)
    cached = _load_cached_metrics(cache_hash)
    if cached is not None:
        return cached

    origin = (profile.origin.lat, profile.origin.lon)
    destination = (profile.destination.lat, profile.destination.lon)
    consumption = _resolve_fuel_consumption(profile)

    try:
        raw = await fetch_commute_data(
            origin,
            destination,
            fuel_suburb=profile.fuel_suburb,
            fuel_consumption_l_per_100km=consumption,
        )
    except TravelEngineError as exc:
        logger.error("Travel engine error: %s", exc)
        raise CommuteCalculationError(str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected travel engine failure")
        raise CommuteCalculationError("Commute calculation failed due to an unexpected error.") from exc

    response = CommuteMetricsResponse.model_validate(raw)

    pt_failed = response.public_transport.error is not None
    driving_failed = response.driving.error is not None

    if pt_failed and driving_failed:
        detail = "; ".join(response.errors) if response.errors else "All commute modes failed."
        logger.error("All commute modes failed for %s -> %s: %s", origin, destination, detail)
        raise CommuteCalculationError(detail)

    if response.errors:
        logger.warning(
            "Partial commute result for %s -> %s: %s",
            origin,
            destination,
            response.errors,
        )

    _save_cached_metrics(cache_hash, response)
    return response
