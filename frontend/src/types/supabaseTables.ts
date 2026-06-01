/** Supabase row shapes for commute affordability report tables. */

export const HTS_MODE_PUBLIC_TRANSPORT = 'Public transport' as const
export const HTS_MODE_VEHICLE_DRIVER = 'Vehicle driver' as const

export type CommuteMode =
  | typeof HTS_MODE_PUBLIC_TRANSPORT
  | typeof HTS_MODE_VEHICLE_DRIVER

/** ``historical_commute_snapshots`` row. */
export interface HistoricalCommuteSnapshotRow {
  id: string
  reporting_quarter: string
  snapshot_month: string
  origin_sa3: string
  destination_sa3: string
  route_name: string
  mode: CommuteMode | string
  time_minutes: number
  distance_km: number | null
  single_trip_cost_aud: number
  weekly_cost_aud: number
  fuel_cost_aud: number | null
  toll_cost_aud: number | null
  net_toll_cost_aud: number | null
  toll_subsidy_aud: number | null
  fuel_price_per_litre: number | null
  fetched_at: string
}

/** ``report_summaries_cache`` row. */
export interface ReportSummaryCacheRow {
  id: string
  reporting_quarter: string
  origin_sa3: string
  destination_sa3: string
  summary_key: 'corridor_summary' | 'mode_breakdown' | string
  payload: CorridorSummaryPayload | ModeBreakdownPayload | Record<string, unknown>
  computed_at: string
}

/** JSON payload for ``summary_key = corridor_summary``. */
export interface CorridorSummaryPayload {
  reporting_quarter: string
  origin_sa3: string
  destination_sa3: string
  commuter_volume: number
  pt_minutes: number | null
  driving_minutes: number | null
  pt_weekly_cost_aud: number | null
  car_weekly_cost_aud: number | null
  weekly_cost_delta_aud: number | null
  time_delta_min: number | null
  toll_subsidy_aud: number
}

/** JSON payload for ``summary_key = mode_breakdown``. */
export interface ModeBreakdownPayload {
  modes: ModeBreakdownEntry[]
}

export interface ModeBreakdownEntry {
  mode: string
  time_minutes: number | null
  single_trip_cost_aud: number | null
  weekly_cost_aud: number | null
  toll_subsidy_aud?: number | null
}
