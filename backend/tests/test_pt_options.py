"""Tests for multi-journey public transport parsing."""

from services.travel_engine import (
    _build_route_label,
    _dedupe_journey_options,
    _journey_route_signature,
    _parse_tfnsw_journey,
)


def _sample_journey(route_number: str) -> dict:
    return {
        "interchanges": 0,
        "legs": [
            {
                "duration": 120,
                "distance": 200,
                "origin": {"name": "A", "coord": [151.1, -33.91]},
                "destination": {"name": "B", "coord": [151.11, -33.92]},
                "transportation": {
                    "number": route_number,
                    "product": {"name": "Sydney Buses Network", "class": 5},
                },
            }
        ],
    }


def test_journey_route_signature_uses_route_number() -> None:
    journey = _sample_journey("492")
    assert _journey_route_signature(journey) == ("route:492",)


def test_dedupe_journey_options_removes_duplicate_routes() -> None:
    journeys = [_sample_journey("492"), _sample_journey("492"), _sample_journey("410")]
    unique = _dedupe_journey_options(journeys)
    assert len(unique) == 2


def test_parse_tfnsw_journey_includes_route_label() -> None:
    parsed = _parse_tfnsw_journey(_sample_journey("490"), option_rank=1)
    assert parsed["route_numbers"] == ["490"]
    assert parsed["route_label"] == "Route 490"


def test_build_route_label_for_multiple_routes() -> None:
    assert _build_route_label(["492", "410"], []) == "Route 492 → 410"
