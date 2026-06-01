-- Monthly grain for historical_commute_snapshots (applied via Supabase migration).

ALTER TABLE historical_commute_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_month text;

UPDATE historical_commute_snapshots
SET snapshot_month = to_char(fetched_at AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE snapshot_month IS NULL;

ALTER TABLE historical_commute_snapshots
  ALTER COLUMN snapshot_month SET NOT NULL;

ALTER TABLE historical_commute_snapshots
  DROP CONSTRAINT IF EXISTS historical_commute_snapshots_reporting_quarter_origin_sa3_d_key;

ALTER TABLE historical_commute_snapshots
  ADD CONSTRAINT historical_commute_snapshots_month_origin_dest_mode_key
  UNIQUE (snapshot_month, origin_sa3, destination_sa3, mode);

CREATE INDEX IF NOT EXISTS idx_historical_commute_snapshots_snapshot_month
  ON historical_commute_snapshots (snapshot_month ASC);
