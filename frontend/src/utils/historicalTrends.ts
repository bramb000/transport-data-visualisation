import type { AggregationMode, HistoricalTrendPoint } from '../types/commuteData'
import type { HistoricalCommuteSnapshotRow } from '../types/supabaseTables'
import { CITY_WIDE_ORIGIN_SA3 } from '../types/commuteData'
import { weeklyToDailyCost } from './tollCap'

const REPORTING_QUARTER_PATTERN = /^Q([1-4])\s+(\d{4})$/

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

/** Parse ISO timestamp to ``YYYY-MM`` (UTC). */
export function monthKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

/** First calendar month of a reporting quarter label (``Q2 2024`` → ``2024-04``). */
export function monthKeyFromReportingQuarter(reportingQuarter: string): string | null {
  const match = REPORTING_QUARTER_PATTERN.exec(reportingQuarter.trim())
  if (!match) return null
  const quarter = Number(match[1])
  const year = Number(match[2])
  const month = (quarter - 1) * 3 + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthKeyFromSnapshot(row: HistoricalCommuteSnapshotRow): string {
  return monthKeyFromIso(row.fetched_at) ?? monthKeyFromReportingQuarter(row.reporting_quarter) ?? row.reporting_quarter
}

export function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) return monthKey
  const year = Number(match[1])
  const month = Number(match[2])
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function monthKeySortKey(monthKey: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) return 0
  return Number(match[1]) * 100 + Number(match[2])
}

export function matchesTrendDistance(
  distanceKm: number | null | undefined,
  maxDistanceKm: number,
): boolean {
  if (distanceKm === null || distanceKm === undefined) return false
  return distanceKm <= maxDistanceKm
}

/**
 * Monthly average commute time and cost from snapshot rows.
 * Buckets by ``fetched_at`` month when present, else the quarter's start month.
 */
export function buildMonthlyHistoricalTrends(
  rows: HistoricalCommuteSnapshotRow[],
  aggregationMode: AggregationMode,
  maxDistanceKm: number,
): HistoricalTrendPoint[] {
  const byMonth = new Map<string, HistoricalCommuteSnapshotRow[]>()

  for (const row of rows) {
    if (row.origin_sa3 === CITY_WIDE_ORIGIN_SA3) continue
    if (!matchesTrendDistance(row.distance_km, maxDistanceKm)) continue

    const monthKey = monthKeyFromSnapshot(row)
    const bucket = byMonth.get(monthKey) ?? []
    bucket.push(row)
    byMonth.set(monthKey, bucket)
  }

  return [...byMonth.entries()]
    .sort(([left], [right]) => monthKeySortKey(left) - monthKeySortKey(right))
    .map(([monthKey, monthRows]) => {
      const times = monthRows.map((row) => row.time_minutes)
      const costs = monthRows.map((row) =>
        aggregationMode === 'weekly' ? row.weekly_cost_aud : weeklyToDailyCost(row.weekly_cost_aud),
      )

      return {
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        averageTimeMinutes: mean(times),
        averageCostAud: mean(costs),
      }
    })
}
