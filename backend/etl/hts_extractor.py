"""TfNSW HTS SA3 commuter baseline extractor for Supabase.

Downloads the public Household Travel Survey SA3 workbook (2020/21–2024/25)
from the TfNSW Open Data Hub, derives Journey-to-Work trip estimates by
primary mode, and bulk-inserts into ``hts_commuter_baselines``.

Note: The public SA3 release reports trips by *home* SA3 only — it does not
include an origin–destination SA3 matrix. ``origin_sa3`` is the household
SA3; ``destination_sa3`` is set to ``"Unspecified"`` until bespoke OD tables
are supplied by TfNSW.

Usage:
    cd backend
    python hts_extractor.py
    # or: python -m etl.hts_extractor
"""

from __future__ import annotations

import logging
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

logger = logging.getLogger(__name__)

HTS_PACKAGE_ID = "c0f9a300-38e5-4086-90fb-c7a1f0b0fe31"
HTS_SA3_RESOURCE_ID = "e95e31d5-64ed-44f1-b845-250498849758"
HTS_SA3_DOWNLOAD_URL = (
    "https://opendata.transport.nsw.gov.au/data/dataset/"
    f"{HTS_PACKAGE_ID}/resource/{HTS_SA3_RESOURCE_ID}/download/"
    "data-by-sa3-2020_21-to-2024_25.xlsx"
)

MODE_SHEET = "SA3 by Mode"
PURPOSE_SHEET = "SA3 by Purpose"
COMMUTE_PURPOSE_PATTERN = re.compile(r"^commute", re.IGNORECASE)
INSERT_BATCH_SIZE = 500
UNSPECIFIED_DESTINATION = "Unspecified"


def download_hts_sa3(url: str = HTS_SA3_DOWNLOAD_URL, timeout: float = 120.0) -> bytes:
    """Download the HTS SA3 workbook from the TfNSW Open Data Hub."""
    logger.info("Downloading HTS SA3 dataset from TfNSW Open Data Hub…")
    response = httpx.get(url, timeout=timeout, follow_redirects=True)
    response.raise_for_status()
    logger.info("Downloaded %d bytes (format: XLSX)", len(response.content))
    return response.content


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = df.copy()
    renamed.columns = [
        str(col).strip().lower().replace(" ", "_") for col in renamed.columns
    ]
    return renamed


def _clean_label(value: Any) -> str:
    text = str(value).strip()
    return re.sub(r"\*+$", "", text).strip()


def _normalize_mode(raw_mode: str) -> str:
    """Map HTS mode labels to concise primary-mode names."""
    mode = _clean_label(raw_mode)
    lowered = mode.lower()
    if "public transport" in lowered:
        return "Public transport"
    if lowered == "vehicle driver":
        return "Vehicle driver"
    if "vehicle passenger" in lowered:
        return "Vehicle passenger"
    if lowered.startswith("walk"):
        return "Walk"
    if lowered.startswith("other"):
        return "Other"
    return mode


def _is_commute_purpose(value: Any) -> bool:
    return bool(COMMUTE_PURPOSE_PATTERN.match(_clean_label(value)))


def load_hts_sa3_workbook(content: bytes) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Load mode and purpose sheets from the HTS SA3 workbook."""
    buffer = BytesIO(content)
    mode_df = _normalize_columns(pd.read_excel(buffer, sheet_name=MODE_SHEET))
    buffer.seek(0)
    purpose_df = _normalize_columns(pd.read_excel(buffer, sheet_name=PURPOSE_SHEET))
    return mode_df, purpose_df


def clean_hts_commuters(
    mode_df: pd.DataFrame,
    purpose_df: pd.DataFrame,
    *,
    financial_year: Optional[str] = None,
) -> pd.DataFrame:
    """Filter Journey-to-Work trips and apportion commute volume by primary mode.

    The public HTS SA3 tables do not publish destination SA3. Commute journeys
    (purpose sheet) are allocated across modes using each SA3's all-purpose
    mode trip shares (mode sheet).
    """
    mode = mode_df.copy()
    purpose = purpose_df.copy()

    if financial_year:
        mode = mode[mode["financial_year"] == financial_year]
        purpose = purpose[purpose["financial_year"] == financial_year]
    else:
        latest_year = sorted(purpose["financial_year"].dropna().unique())[-1]
        logger.info("No financial_year filter — using latest release: %s", latest_year)
        mode = mode[mode["financial_year"] == latest_year]
        purpose = purpose[purpose["financial_year"] == latest_year]

    commute = purpose[purpose["travel_purpose"].map(_is_commute_purpose)].copy()
    if commute.empty:
        raise ValueError("No Journey-to-Work (Commute) rows found in HTS purpose sheet.")

    commute = commute.rename(
        columns={
            "hh_sa3_name": "origin_sa3",
            "journeys_by_mode": "commute_journeys",
        }
    )
    commute = commute[["financial_year", "hh_sa3_id", "origin_sa3", "commute_journeys"]]

    mode = mode.rename(columns={"hh_sa3_name": "origin_sa3_check", "trips_by_mode": "trips_by_mode"})
    mode["mode"] = mode["travel_mode"].map(_normalize_mode)

    mode_totals = (
        mode.groupby(["financial_year", "hh_sa3_id"], as_index=False)["trips_by_mode"]
        .sum()
        .rename(columns={"trips_by_mode": "total_trips_sa3"})
    )

    merged = mode.merge(mode_totals, on=["financial_year", "hh_sa3_id"], how="left")
    merged = merged.merge(
        commute,
        on=["financial_year", "hh_sa3_id"],
        how="inner",
        suffixes=("_mode", "_commute"),
    )

    merged["commute_share"] = merged["trips_by_mode"] / merged["total_trips_sa3"]
    merged["total_trips"] = (
        merged["commute_journeys"] * merged["commute_share"]
    ).round().astype(int)

    cleaned = merged[merged["total_trips"] > 0][
        ["origin_sa3", "mode", "total_trips"]
    ].copy()
    cleaned["destination_sa3"] = UNSPECIFIED_DESTINATION

    cleaned = (
        cleaned.groupby(["origin_sa3", "destination_sa3", "mode"], as_index=False)["total_trips"]
        .sum()
        .sort_values(["origin_sa3", "mode"])
        .reset_index(drop=True)
    )

    logger.info(
        "Cleaned %d commuter baseline rows across %d origin SA3 areas.",
        len(cleaned),
        cleaned["origin_sa3"].nunique(),
    )
    return cleaned


def transform_hts_dataset(
    content: bytes,
    *,
    financial_year: Optional[str] = None,
) -> pd.DataFrame:
    """Download bytes → load sheets → return Supabase-ready commuter baseline."""
    mode_df, purpose_df = load_hts_sa3_workbook(content)
    return clean_hts_commuters(mode_df, purpose_df, financial_year=financial_year)


def _require_env(name: str) -> str:
    import os

    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set. Add it to backend/.env")
    return value


def create_supabase_client() -> Client:
    url = _require_env("SUPABASE_URL")
    key = _require_env("SUPABASE_KEY")
    return create_client(url, key)


def dataframe_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    return [
        {
            "origin_sa3": row.origin_sa3,
            "destination_sa3": row.destination_sa3,
            "mode": row.mode,
            "total_trips": int(row.total_trips),
        }
        for row in df.itertuples(index=False)
    ]


def bulk_insert_baselines(supabase: Client, df: pd.DataFrame) -> int:
    """Bulk insert cleaned HTS rows into Supabase."""
    records = dataframe_to_records(df)
    if not records:
        logger.warning("No HTS baseline rows to insert.")
        return 0

    inserted = 0
    for start in range(0, len(records), INSERT_BATCH_SIZE):
        batch = records[start : start + INSERT_BATCH_SIZE]
        response = supabase.table("hts_commuter_baselines").insert(batch).execute()
        inserted += len(response.data or [])
        logger.info("Inserted batch %d–%d (%d rows)", start + 1, start + len(batch), len(batch))

    logger.info("Supabase insert complete — %d row(s) written.", inserted)
    return inserted


def run_hts_extractor(
    *,
    financial_year: Optional[str] = None,
    download_url: str = HTS_SA3_DOWNLOAD_URL,
) -> int:
    content = download_hts_sa3(download_url)
    cleaned = transform_hts_dataset(content, financial_year=financial_year)

    preview = cleaned.head(10)
    logger.info("Sample rows:\n%s", preview.to_string(index=False))

    supabase = create_supabase_client()
    bulk_insert_baselines(supabase, cleaned)
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    sys.exit(run_hts_extractor())


if __name__ == "__main__":
    main()
