/**
 * NSW $60 weekly toll cap (from Q1 2024).
 * @see https://www.nsw.gov.au/driving-boating-and-transport/tolls
 */

import { HTS_MODE_VEHICLE_DRIVER } from '../types/supabaseTables'
import type { HistoricalCommuteSnapshotRow } from '../types/supabaseTables'
import { reportingQuarterSortKey } from './quarterFormat'

export const NSW_WEEKLY_TOLL_CAP_AUD = 60
export const WEEKLY_COMMUTE_TRIPS = 10
const WORKING_DAYS_PER_WEEK = 5

const REPORTING_PATTERN = /^Q([1-4])\s+(\d{4})$/

/** True when the NSW $60 weekly toll cap applies (Q1 2024 through 2026). */
export function isTollCapActive(reportingQuarter: string): boolean {
  const match = REPORTING_PATTERN.exec(reportingQuarter.trim())
  if (!match) return false

  const quarter = Number(match[1])
  const year = Number(match[2])

  if (year < 2024) return false
  if (year > 2026) return false
  if (year === 2024 && quarter < 1) return false
  return true
}

export interface WeeklyTollCapResult {
  grossWeeklyTollsAud: number
  netWeeklyTollsAud: number
  tollSubsidyAud: number
}

/** Mirror backend ``apply_weekly_toll_cap`` for gross weekly toll totals. */
export function applyWeeklyTollCap(
  grossWeeklyTollsAud: number,
  reportingQuarter: string,
  weeklyCapAud: number = NSW_WEEKLY_TOLL_CAP_AUD,
): WeeklyTollCapResult {
  const gross = roundMoney(grossWeeklyTollsAud)

  if (isTollCapActive(reportingQuarter) && gross > weeklyCapAud) {
    return {
      grossWeeklyTollsAud: gross,
      netWeeklyTollsAud: weeklyCapAud,
      tollSubsidyAud: roundMoney(gross - weeklyCapAud),
    }
  }

  return {
    grossWeeklyTollsAud: gross,
    netWeeklyTollsAud: gross,
    tollSubsidyAud: 0,
  }
}

/**
 * Recompute vehicle-driver weekly cost with toll cap when the user selects weekly scale.
 * Pre-2024 rows and non-car modes pass through unchanged.
 */
export function applyWeeklyTollCapToSnapshot(
  row: HistoricalCommuteSnapshotRow,
  applyCap: boolean,
): HistoricalCommuteSnapshotRow {
  if (!applyCap || row.mode !== HTS_MODE_VEHICLE_DRIVER) {
    return row
  }

  const grossTolls = row.toll_cost_aud ?? 0
  const tollCap = applyWeeklyTollCap(grossTolls, row.reporting_quarter)
  const priorNetTolls = row.net_toll_cost_aud ?? grossTolls
  const weeklyFuel = roundMoney(row.weekly_cost_aud - priorNetTolls)
  const weeklyCost = roundMoney(weeklyFuel + tollCap.netWeeklyTollsAud)

  return {
    ...row,
    net_toll_cost_aud: tollCap.netWeeklyTollsAud,
    toll_subsidy_aud: tollCap.tollSubsidyAud,
    weekly_cost_aud: weeklyCost,
  }
}

/** Scale a stored weekly amount to a single work-day (5-day week, return trip). */
export function weeklyToDailyCost(weeklyAud: number): number {
  return roundMoney(weeklyAud / WORKING_DAYS_PER_WEEK)
}

export function sortSnapshotsChronologically(
  rows: HistoricalCommuteSnapshotRow[],
): HistoricalCommuteSnapshotRow[] {
  return [...rows].sort(
    (left, right) =>
      reportingQuarterSortKey(left.reporting_quarter) -
      reportingQuarterSortKey(right.reporting_quarter),
  )
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
