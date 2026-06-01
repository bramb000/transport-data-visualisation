import type { CorridorSummaryPayload, ModeBreakdownEntry } from './supabaseTables'

export type AggregationMode = 'daily' | 'weekly'

export const CITY_WIDE_ORIGIN_SA3 = 'All Greater Sydney'
export const DEFAULT_DESTINATION_SA3 = 'Sydney Inner City'
export const DEFAULT_REPORTING_QUARTER = 'Q2 2026'

export const SCROLL_STEP_COUNT = 4

export interface MacroAverages {
  averageTimeMinutes: number | null
  averageCostAud: number | null
}

export interface HistoricalTrendPoint {
  reporting_quarter: string
  averageTimeMinutes: number | null
  averageCostAud: number | null
}

export interface SuburbDeviation {
  sa3Name: string
  listType: 'leave' | 'arrive'
  offPeakMinutes: number
  rushHourMinutes: number
  penaltyMinutes: number
}

export interface RouteSelection {
  origin: string | null
  destination: string | null
}

export interface RouteMetrics {
  origin_sa3: string
  destination_sa3: string
  rushMinutes: number | null
  offPeakMinutes: number | null
  penaltyMinutes: number | null
  ptCostAud: number | null
  carCostAud: number | null
  modes: ModeBreakdownEntry[]
  corridor: CorridorSummaryPayload | null
}
