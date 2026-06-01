"""Backfill ``historical_commute_snapshots`` one calendar month at a time.

Rows upsert on ``(snapshot_month, origin_sa3, destination_sa3, mode)``.

Usage:
    cd backend
    python -m etl.backfill_historical_snapshots
    python -m etl.backfill_historical_snapshots --from 2023-01 --to 2026-06
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from etl.etl_pipeline import run_etl
from etl.month_utils import current_snapshot_month, iter_snapshot_months

logger = logging.getLogger(__name__)

DEFAULT_START_MONTH = "2023-01"


async def backfill(months: list[str]) -> int:
    failures = 0
    for index, month in enumerate(months, start=1):
        logger.info("=== Monthly backfill %d/%d: %s ===", index, len(months), month)
        try:
            await run_etl(snapshot_month=month)
        except Exception:
            logger.exception("Backfill failed for %s", month)
            failures += 1
    return failures


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Backfill monthly historical commute snapshots.")
    parser.add_argument("--from", dest="from_month", metavar="YYYY-MM", help="Start month")
    parser.add_argument("--to", dest="to_month", metavar="YYYY-MM", help="End month")
    parser.add_argument(
        "--month",
        action="append",
        dest="months",
        help="Explicit month (repeatable). Overrides --from/--to.",
    )
    args = parser.parse_args()

    if args.months:
        target = args.months
    else:
        start = args.from_month or DEFAULT_START_MONTH
        end = args.to_month or current_snapshot_month()
        target = iter_snapshot_months(start, end)

    failures = asyncio.run(backfill(target))
    if failures:
        logger.error("%d month(s) failed.", failures)
        return 1
    logger.info("Monthly backfill complete for %d month(s).", len(target))
    return 0


if __name__ == "__main__":
    sys.exit(main())
