import type { AggregationMode, HistoricalTrendPoint } from '../types/commuteData'
import type { HistoricalCommuteSnapshotRow } from '../types/supabaseTables'
import { CITY_WIDE_ORIGIN_SA3 } from '../types/commuteData'
import { weeklyToDailyCost } from './tollCap'

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

/** Resolve calendar month key ``YYYY-MM`` for a snapshot row. */
export function snapshotMonthKey(row: HistoricalCommuteSnapshotRow): string {
  if (row.snapshot_month?.trim()) return row.snapshot_month.trim()
  const fromFetch = monthKeyFromIso(row.fetched_at)
  if (fromFetch) return fromFetch
  return row.reporting_quarter
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
 * One point per calendar month from ``snapshot_month`` (true monthly grain).
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

    const monthKey = snapshotMonthKey(row)
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

export function countTrendMonths(
  rows: HistoricalCommuteSnapshotRow[],
  maxDistanceKm: number,
): number {
  const months = new Set<string>()
  for (const row of rows) {
    if (row.origin_sa3 === CITY_WIDE_ORIGIN_SA3) continue
    if (!matchesTrendDistance(row.distance_km, maxDistanceKm)) continue
    months.add(snapshotMonthKey(row))
  }
  return months.size
}
