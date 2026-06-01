import type {
  CorridorSummaryPayload,
  HistoricalCommuteSnapshotRow,
  ModeBreakdownEntry,
} from './supabaseTables'

export type TimeScale = 'daily' | 'weekly'

export const DEFAULT_ORIGIN_SA3 = 'All Greater Sydney'

/** Merged active summary for the current filter matrix. */
export interface CachedReportSummary {
  reporting_quarter: string
  origin_sa3: string
  destination_sa3: string | null
  time_scale: TimeScale
  corridor: CorridorSummaryPayload | null
  modes: ModeBreakdownEntry[]
  computed_at: string | null
}

export type HistoricalTrendRow = HistoricalCommuteSnapshotRow

export interface TrendQuarterPoint {
  reporting_quarter: string
  quarter_slug: string | null
  pt_weekly_cost_aud: number | null
  car_weekly_cost_aud: number | null
  weekly_cost_delta_aud: number | null
  time_delta_min: number | null
  toll_subsidy_aud: number
}
