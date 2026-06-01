"""Tests for POST /api/v1/commute/calculate."""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.commute import CommuteMetricsResponse, CoordinatePoint, DrivingMetrics, PublicTransportMetrics

client = TestClient(app)

SAMPLE_PAYLOAD = {
    "origin": {"lat": -33.9116, "lon": 151.1032, "label": "Campsie Station"},
    "destination": {"lat": -33.8836, "lon": 151.2057, "label": "Central Station"},
    "vehicle_profile_id": "medium_car",
    "fuel_consumption_l_per_100km": 10.0,
}

SAMPLE_RESPONSE = CommuteMetricsResponse(
    origin=CoordinatePoint(lat=-33.9116, lon=151.1032),
    destination=CoordinatePoint(lat=-33.8836, lon=151.2057),
    public_transport=PublicTransportMetrics(
        duration_min=40.3,
        distance_km=12.169,
        cost_aud=5.77,
        modes=["Sydney Buses Network", "Sydney Metro Network"],
        route_numbers=["400"],
        route_label="Route 400",
        option_rank=1,
        legs=[],
        interchanges=1,
        error=None,
    ),
    public_transport_options=[
        PublicTransportMetrics(
            duration_min=40.3,
            distance_km=12.169,
            cost_aud=5.77,
            modes=["Sydney Buses Network", "Sydney Metro Network"],
            route_numbers=["400"],
            route_label="Route 400",
            option_rank=1,
            legs=[],
            interchanges=1,
            error=None,
        )
    ],
    driving=DrivingMetrics(
        duration_min=27.7,
        distance_km=12.404,
        cost_aud=2.19,
        fuel_price_per_litre=1.768,
        fuel_price_source="fuelcheck_api",
        consumption_l_per_100km=10.0,
        litres_used=1.24,
        error=None,
    ),
    errors=[],
    fetched_at="2026-06-01T09:38:25",
)


@patch(
    "app.services.travel_service.fetch_commute_data",
    new_callable=AsyncMock,
    return_value=SAMPLE_RESPONSE.model_dump(),
)
def test_calculate_commute_success(mock_fetch) -> None:
    response = client.post("/api/v1/commute/calculate", json=SAMPLE_PAYLOAD)
    assert response.status_code == 200
    body = response.json()
    assert body["public_transport"]["cost_aud"] == 5.77
    assert body["driving"]["cost_aud"] == 2.19
    assert len(body["public_transport_options"]) >= 1
    assert body["public_transport_options"][0]["route_label"] == "Route 400"
    mock_fetch.assert_awaited_once()


def test_calculate_commute_validation_same_origin_destination() -> None:
    payload = {
        "origin": {"lat": -33.9116, "lon": 151.1032},
        "destination": {"lat": -33.9116, "lon": 151.1032},
    }
    response = client.post("/api/v1/commute/calculate", json=payload)
    assert response.status_code == 422


@patch(
    "app.services.travel_service.fetch_commute_data",
    new_callable=AsyncMock,
    side_effect=RuntimeError("upstream failure"),
)
def test_calculate_commute_all_modes_failed(mock_fetch) -> None:
    response = client.post("/api/v1/commute/calculate", json=SAMPLE_PAYLOAD)
    assert response.status_code == 503
    assert "unexpected error" in response.json()["detail"].lower()
