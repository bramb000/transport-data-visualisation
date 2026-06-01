"""Tests for SQLite commute cache."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.db.database import fetch_cached_response, get_database_path, store_cached_response
from app.db.session import db_session
from app.models.commute import (
    CommuteMetricsResponse,
    CoordinatePoint,
    DrivingMetrics,
    PublicTransportMetrics,
    UserProfileSchema,
)
from app.services.travel_service import _commute_cache_hash, calculate_commute_metrics

SAMPLE_PROFILE = UserProfileSchema(
    origin={"lat": -33.9116, "lon": 151.1032},
    destination={"lat": -33.8836, "lon": 151.2057},
    vehicle_profile_id="medium_car",
    fuel_consumption_l_per_100km=10.0,
)

SAMPLE_RESPONSE = CommuteMetricsResponse(
    origin=CoordinatePoint(lat=-33.9116, lon=151.1032),
    destination=CoordinatePoint(lat=-33.8836, lon=151.2057),
    public_transport=PublicTransportMetrics(duration_min=40.0, distance_km=12.0, cost_aud=5.77, error=None),
    public_transport_options=[
        PublicTransportMetrics(duration_min=40.0, distance_km=12.0, cost_aud=5.77, option_rank=1, error=None),
    ],
    driving=DrivingMetrics(duration_min=28.0, distance_km=12.4, cost_aud=2.19, error=None),
    errors=[],
    fetched_at=datetime.now().isoformat(timespec="seconds"),
)


@pytest.fixture
def temp_db(isolated_sqlite_db):
    return isolated_sqlite_db


@pytest.mark.asyncio
@patch("app.services.travel_service.fetch_commute_data", new_callable=AsyncMock)
async def test_cache_miss_then_hit(mock_fetch, temp_db) -> None:
    mock_fetch.return_value = SAMPLE_RESPONSE.model_dump()

    first = await calculate_commute_metrics(SAMPLE_PROFILE)
    second = await calculate_commute_metrics(SAMPLE_PROFILE)

    assert first.public_transport.cost_aud == 5.77
    assert second.public_transport.cost_aud == 5.77
    mock_fetch.assert_awaited_once()
    assert temp_db.exists()


def test_cache_hash_stable_for_same_coordinates() -> None:
    hash_a = _commute_cache_hash(SAMPLE_PROFILE)
    hash_b = _commute_cache_hash(SAMPLE_PROFILE)
    assert hash_a == hash_b


def test_store_and_fetch_cached_response(temp_db) -> None:
    cache_hash = "testhash123"
    payload = SAMPLE_RESPONSE.model_dump_json()

    with db_session() as connection:
        store_cached_response(connection, cache_hash, payload)
        stored = fetch_cached_response(connection, cache_hash)

    assert stored == payload
    assert get_database_path() == temp_db
