import type { CorridorSummaryPayload, ModeBreakdownEntry } from './supabaseTables'

export type AggregationMode = 'daily' | 'weekly'
export type TrafficState = 'rush_hour' | 'off_peak'

export const CITY_WIDE_ORIGIN_SA3 = 'All Greater Sydney'
export const DEFAULT_DESTINATION_SA3 = 'Sydney Inner City'
export const DEFAULT_REPORTING_QUARTER = 'Q2 2026'

/** Macro scorecard figures for the whole metro area. */
export interface CityAverages {
  averageTimeMinutes: number | null
  averageCostAud: number | null
}

/** Active corridor snapshot for map explorer and notebook panel. */
export interface RouteStorySnapshot {
  origin_sa3: string
  destination_sa3: string
  reporting_quarter: string
  corridor: CorridorSummaryPayload | null
  modes: ModeBreakdownEntry[]
  computed_at: string | null
}

/** Rush vs off-peak minutes when both traffic profiles exist in cache. */
export interface TrafficComparison {
  rushMinutes: number | null
  offPeakMinutes: number | null
  penaltyMinutes: number | null
}

/** Hand-annotated rush-hour penalty row for leaderboard sections. */
export interface RushHourLeaderEntry {
  sa3Name: string
  penaltyMinutes: number
  annotation: string
}
