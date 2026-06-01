"""Tests for HTS SA3 commuter baseline cleaning."""

import pandas as pd
import pytest

from etl.hts_extractor import clean_hts_commuters, _normalize_mode


def test_normalize_mode_strips_footnotes() -> None:
    assert _normalize_mode("Public transport*") == "Public transport"
    assert _normalize_mode("Vehicle driver") == "Vehicle driver"


def test_clean_hts_commuters_apportions_commute_by_mode() -> None:
    mode_df = pd.DataFrame(
        {
            "financial_year": ["2024/25", "2024/25", "2024/25", "2024/25"],
            "hh_sa3_id": [12501, 12501, 11901, 11901],
            "hh_sa3_name": ["Auburn", "Auburn", "Bankstown", "Bankstown"],
            "travel_mode": ["Vehicle driver", "Public transport*", "Vehicle driver", "Walk only*"],
            "trips_by_mode": [100_000, 50_000, 80_000, 20_000],
        }
    )
    purpose_df = pd.DataFrame(
        {
            "financial_year": ["2024/25", "2024/25"],
            "hh_sa3_id": [12501, 11901],
            "hh_sa3_name": ["Auburn", "Bankstown"],
            "travel_purpose": ["Commute", "Commute"],
            "journeys_by_mode": [60_000, 40_000],
        }
    )

    cleaned = clean_hts_commuters(mode_df, purpose_df, financial_year="2024/25")

    auburn_driver = cleaned[
        (cleaned["origin_sa3"] == "Auburn") & (cleaned["mode"] == "Vehicle driver")
    ]
    assert len(auburn_driver) == 1
    assert auburn_driver.iloc[0]["total_trips"] == 40_000
    assert auburn_driver.iloc[0]["destination_sa3"] == "Unspecified"

    bankstown_walk = cleaned[
        (cleaned["origin_sa3"] == "Bankstown") & (cleaned["mode"] == "Walk")
    ]
    assert bankstown_walk.iloc[0]["total_trips"] == 8_000


def test_clean_hts_commuters_requires_commute_rows() -> None:
    mode_df = pd.DataFrame(
        {
            "financial_year": ["2024/25"],
            "hh_sa3_id": [12501],
            "hh_sa3_name": ["Auburn"],
            "travel_mode": ["Vehicle driver"],
            "trips_by_mode": [1000],
        }
    )
    purpose_df = pd.DataFrame(
        {
            "financial_year": ["2024/25"],
            "hh_sa3_id": [12501],
            "hh_sa3_name": ["Auburn"],
            "travel_purpose": ["Shopping"],
            "journeys_by_mode": [500],
        }
    )
    with pytest.raises(ValueError, match="Commute"):
        clean_hts_commuters(mode_df, purpose_df, financial_year="2024/25")
