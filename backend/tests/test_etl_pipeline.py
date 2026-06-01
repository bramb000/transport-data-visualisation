"""Tests for ETL od_pairs loading."""

from pathlib import Path

from etl.run_pipeline import _pair_to_profile, load_od_pairs


def test_load_od_pairs_from_yaml() -> None:
    config_path = Path(__file__).resolve().parent.parent / "etl" / "od_pairs.yaml"
    pairs = load_od_pairs(config_path)
    assert len(pairs) >= 1
    assert pairs[0]["id"] == "campsie-central"


def test_pair_to_profile() -> None:
    pair = {
        "origin": {"lat": -33.9116, "lon": 151.1032, "label": "Campsie"},
        "destination": {"lat": -33.8836, "lon": 151.2057, "label": "Central"},
        "vehicle_profile_id": "suv",
    }
    profile = _pair_to_profile(pair)
    assert profile.vehicle_profile_id == "suv"
    assert profile.origin.label == "Campsie"
