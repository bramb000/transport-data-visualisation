import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  fetchHistoricalSnapshotRows,
  fetchReportSummaryRows,
} from '../api/reportSupabase'
import { SupabaseClientError } from '../api/supabaseClient'
import type { CachedReportSummary, TimeScale, TrendQuarterPoint } from '../types/commuteReportStore'
import { DEFAULT_ORIGIN_SA3 } from '../types/commuteReportStore'
import type {
  CorridorSummaryPayload,
  HistoricalCommuteSnapshotRow,
  ModeBreakdownEntry,
  ModeBreakdownPayload,
  ReportSummaryCacheRow,
} from '../types/supabaseTables'
import {
  HTS_MODE_PUBLIC_TRANSPORT,
  HTS_MODE_VEHICLE_DRIVER,
} from '../types/supabaseTables'
import {
  REPORT_QUARTER_OPTIONS,
  quarterSlugToReportingQuarter,
  reportingQuarterToSlug,
  type ReportQuarterSlug,
} from '../utils/quarterFormat'
import {
  applyWeeklyTollCapToSnapshot,
  sortSnapshotsChronologically,
  weeklyToDailyCost,
} from '../utils/tollCap'

export { REPORT_QUARTER_OPTIONS, DEFAULT_ORIGIN_SA3 }
export type { ReportQuarterSlug, TimeScale, CachedReportSummary, TrendQuarterPoint }

function isCorridorPayload(payload: unknown): payload is CorridorSummaryPayload {
  if (!payload || typeof payload !== 'object') return false
  return 'origin_sa3' in payload && 'destination_sa3' in payload
}

function isModeBreakdownPayload(payload: unknown): payload is ModeBreakdownPayload {
  if (!payload || typeof payload !== 'object') return false
  return Array.isArray((payload as ModeBreakdownPayload).modes)
}

function scaleCorridorForTimeScale(
  corridor: CorridorSummaryPayload,
  timeScale: TimeScale,
): CorridorSummaryPayload {
  if (timeScale === 'weekly') {
    return corridor
  }

  return {
    ...corridor,
    pt_weekly_cost_aud:
      corridor.pt_weekly_cost_aud === null
        ? null
        : weeklyToDailyCost(corridor.pt_weekly_cost_aud),
    car_weekly_cost_aud:
      corridor.car_weekly_cost_aud === null
        ? null
        : weeklyToDailyCost(corridor.car_weekly_cost_aud),
    weekly_cost_delta_aud:
      corridor.weekly_cost_delta_aud === null
        ? null
        : weeklyToDailyCost(corridor.weekly_cost_delta_aud),
    toll_subsidy_aud: weeklyToDailyCost(corridor.toll_subsidy_aud),
  }
}

function scaleModeEntryForTimeScale(
  entry: ModeBreakdownEntry,
  timeScale: TimeScale,
): ModeBreakdownEntry {
  if (timeScale === 'weekly') {
    return entry
  }

  return {
    ...entry,
    single_trip_cost_aud:
      entry.single_trip_cost_aud === null
        ? null
        : Math.round(entry.single_trip_cost_aud * 2 * 100) / 100,
    weekly_cost_aud:
      entry.weekly_cost_aud === null ? null : weeklyToDailyCost(entry.weekly_cost_aud),
    toll_subsidy_aud:
      entry.toll_subsidy_aud === null || entry.toll_subsidy_aud === undefined
        ? entry.toll_subsidy_aud
        : weeklyToDailyCost(entry.toll_subsidy_aud),
  }
}

function buildCachedSummary(
  rows: ReportSummaryCacheRow[],
  reportingQuarter: string,
  originSa3: string,
  timeScale: TimeScale,
): CachedReportSummary | null {
  if (!rows.length) return null

  const preferredDestination = 'Sydney Inner City'
  const sortedRows = [...rows].sort((left, right) => {
    const leftPreferred = left.destination_sa3 === preferredDestination ? -1 : 0
    const rightPreferred = right.destination_sa3 === preferredDestination ? -1 : 0
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred
    return left.destination_sa3.localeCompare(right.destination_sa3)
  })

  const corridorRow = sortedRows.find((row) => row.summary_key === 'corridor_summary')
  const modeRow = sortedRows.find((row) => row.summary_key === 'mode_breakdown')

  const rawCorridor = corridorRow?.payload
  const corridor =
    rawCorridor && isCorridorPayload(rawCorridor)
      ? scaleCorridorForTimeScale(rawCorridor, timeScale)
      : null

  const rawModes = modeRow?.payload
  const modes =
    rawModes && isModeBreakdownPayload(rawModes)
      ? rawModes.modes.map((entry) => scaleModeEntryForTimeScale(entry, timeScale))
      : []

  const destination =
    corridor?.destination_sa3 ??
    corridorRow?.destination_sa3 ??
    modeRow?.destination_sa3 ??
    null

  const computedAt = corridorRow?.computed_at ?? modeRow?.computed_at ?? null

  return {
    reporting_quarter: reportingQuarter,
    origin_sa3: originSa3,
    destination_sa3: destination,
    time_scale: timeScale,
    corridor,
    modes,
    computed_at: computedAt,
  }
}

function transformHistoricalRows(
  rows: HistoricalCommuteSnapshotRow[],
  timeScale: TimeScale,
): HistoricalCommuteSnapshotRow[] {
  const applyTollCap = timeScale === 'weekly'
  const sorted = sortSnapshotsChronologically(rows)

  return sorted.map((row) => {
    let adjusted = applyWeeklyTollCapToSnapshot(row, applyTollCap)

    if (timeScale === 'daily') {
      adjusted = {
        ...adjusted,
        weekly_cost_aud: weeklyToDailyCost(adjusted.weekly_cost_aud),
        single_trip_cost_aud: Math.round(adjusted.single_trip_cost_aud * 2 * 100) / 100,
        toll_cost_aud:
          adjusted.toll_cost_aud === null ? null : weeklyToDailyCost(adjusted.toll_cost_aud),
        net_toll_cost_aud:
          adjusted.net_toll_cost_aud === null
            ? null
            : weeklyToDailyCost(adjusted.net_toll_cost_aud),
        toll_subsidy_aud:
          adjusted.toll_subsidy_aud === null
            ? null
            : weeklyToDailyCost(adjusted.toll_subsidy_aud),
        fuel_cost_aud:
          adjusted.fuel_cost_aud === null ? null : weeklyToDailyCost(adjusted.fuel_cost_aud),
      }
    }

    return adjusted
  })
}

function findModeCost(
  rows: HistoricalCommuteSnapshotRow[],
  quarter: string,
  mode: string,
): number | null {
  const match = rows.find(
    (row) => row.reporting_quarter === quarter && row.mode === mode,
  )
  return match?.weekly_cost_aud ?? null
}

function buildSeedHistoricalSnapshots(
  originSa3: string,
  reportingQuarter: string,
): HistoricalCommuteSnapshotRow[] {
  const destination = 'Sydney Inner City'
  const nowIso = new Date().toISOString()

  // A small narrative-ready seed series (pre-cap vs post-cap vs current).
  const base = [
    {
      reporting_quarter: 'Q4 2023',
      pt_minutes: 46,
      car_minutes: 28,
      pt_weekly: 50.0,
      car_weekly: 125.0,
      car_fuel_weekly: 48.5,
      car_gross_tolls_weekly: 76.5,
      car_net_tolls_weekly: 76.5,
      car_toll_subsidy: 0.0,
    },
    {
      reporting_quarter: 'Q1 2024',
      pt_minutes: 45,
      car_minutes: 27,
      pt_weekly: 50.0,
      car_weekly: 108.5,
      car_fuel_weekly: 48.5,
      car_gross_tolls_weekly: 76.5,
      car_net_tolls_weekly: 60.0,
      car_toll_subsidy: 16.5,
    },
    {
      reporting_quarter: 'Q2 2026',
      pt_minutes: 44,
      car_minutes: 26,
      pt_weekly: 50.0,
      car_weekly: 126.3,
      car_fuel_weekly: 56.3,
      car_gross_tolls_weekly: 70.0,
      car_net_tolls_weekly: 60.0,
      car_toll_subsidy: 10.0,
    },
  ]

  const quarters = new Set([reportingQuarter, ...base.map((row) => row.reporting_quarter)])
  const points = [...quarters]
    .map((quarter) => base.find((row) => row.reporting_quarter === quarter) ?? base[0]!)
    .map((row) => ({
      ...row,
      reporting_quarter: row.reporting_quarter,
    }))

  const rows: HistoricalCommuteSnapshotRow[] = []
  for (const point of points) {
    rows.push({
      id: `seed-pt-${originSa3}-${point.reporting_quarter}`,
      reporting_quarter: point.reporting_quarter,
      origin_sa3: originSa3,
      destination_sa3: destination,
      route_name: `seed:${originSa3}→${destination}`,
      mode: HTS_MODE_PUBLIC_TRANSPORT,
      time_minutes: point.pt_minutes,
      distance_km: null,
      single_trip_cost_aud: 5.77,
      weekly_cost_aud: point.pt_weekly,
      fuel_cost_aud: null,
      toll_cost_aud: null,
      net_toll_cost_aud: null,
      toll_subsidy_aud: null,
      fuel_price_per_litre: null,
      fetched_at: nowIso,
    })

    const corridorTollPerTrip = point.car_gross_tolls_weekly / 10
    rows.push({
      id: `seed-car-${originSa3}-${point.reporting_quarter}`,
      reporting_quarter: point.reporting_quarter,
      origin_sa3: originSa3,
      destination_sa3: destination,
      route_name: `seed:${originSa3}→${destination}`,
      mode: HTS_MODE_VEHICLE_DRIVER,
      time_minutes: point.car_minutes,
      distance_km: null,
      single_trip_cost_aud: round2((point.car_weekly / 10) + corridorTollPerTrip),
      weekly_cost_aud: point.car_weekly,
      fuel_cost_aud: point.car_fuel_weekly,
      toll_cost_aud: point.car_gross_tolls_weekly,
      net_toll_cost_aud: point.car_net_tolls_weekly,
      toll_subsidy_aud: point.car_toll_subsidy,
      fuel_price_per_litre: null,
      fetched_at: nowIso,
    })
  }

  return rows
}

function buildSeedCachedSummary(
  originSa3: string,
  reportingQuarter: string,
  timeScale: TimeScale,
): CachedReportSummary {
  const destination = 'Sydney Inner City'
  const seedRows = buildSeedHistoricalSnapshots(originSa3, reportingQuarter)
  const quarterRows = seedRows.filter((row) => row.reporting_quarter === reportingQuarter)
  const pt = quarterRows.find((row) => row.mode === HTS_MODE_PUBLIC_TRANSPORT) ?? null
  const car = quarterRows.find((row) => row.mode === HTS_MODE_VEHICLE_DRIVER) ?? null

  const corridor: CorridorSummaryPayload = scaleCorridorForTimeScale(
    {
      reporting_quarter: reportingQuarter,
      origin_sa3: originSa3,
      destination_sa3: destination,
      commuter_volume: 0,
      pt_minutes: pt?.time_minutes ?? null,
      driving_minutes: car?.time_minutes ?? null,
      pt_weekly_cost_aud: pt?.weekly_cost_aud ?? null,
      car_weekly_cost_aud: car?.weekly_cost_aud ?? null,
      weekly_cost_delta_aud:
        pt?.weekly_cost_aud != null && car?.weekly_cost_aud != null
          ? round2(car.weekly_cost_aud - pt.weekly_cost_aud)
          : null,
      time_delta_min:
        pt?.time_minutes != null && car?.time_minutes != null
          ? pt.time_minutes - car.time_minutes
          : null,
      toll_subsidy_aud: car?.toll_subsidy_aud ?? 0,
    },
    timeScale,
  )

  const modes: ModeBreakdownEntry[] = [
    pt
      ? scaleModeEntryForTimeScale(
          {
            mode: pt.mode,
            time_minutes: pt.time_minutes,
            single_trip_cost_aud: pt.single_trip_cost_aud,
            weekly_cost_aud: pt.weekly_cost_aud,
            toll_subsidy_aud: pt.toll_subsidy_aud,
          },
          timeScale,
        )
      : {
          mode: HTS_MODE_PUBLIC_TRANSPORT,
          time_minutes: null,
          single_trip_cost_aud: null,
          weekly_cost_aud: null,
        },
    car
      ? scaleModeEntryForTimeScale(
          {
            mode: car.mode,
            time_minutes: car.time_minutes,
            single_trip_cost_aud: car.single_trip_cost_aud,
            weekly_cost_aud: car.weekly_cost_aud,
            toll_subsidy_aud: car.toll_subsidy_aud,
          },
          timeScale,
        )
      : {
          mode: HTS_MODE_VEHICLE_DRIVER,
          time_minutes: null,
          single_trip_cost_aud: null,
          weekly_cost_aud: null,
        },
  ]

  return {
    reporting_quarter: reportingQuarter,
    origin_sa3: originSa3,
    destination_sa3: destination,
    time_scale: timeScale,
    corridor,
    modes,
    computed_at: null,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export const useCommuteReportStore = defineStore('commuteReport', () => {
  const timeScale = ref<TimeScale>('weekly')
  const selectedQuarter = ref<ReportQuarterSlug>('2026-Q2')
  const selectedOrigin = ref<string>(DEFAULT_ORIGIN_SA3)
  const cachedSummaryData = ref<CachedReportSummary | null>(null)
  const historicalTrendData = ref<HistoricalCommuteSnapshotRow[]>([])
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  let refreshGeneration = 0

  const reportingQuarter = computed(() =>
    quarterSlugToReportingQuarter(selectedQuarter.value),
  )

  const ptModeEntry = computed(() =>
    cachedSummaryData.value?.modes.find((entry) => entry.mode === HTS_MODE_PUBLIC_TRANSPORT) ??
    null,
  )

  const carModeEntry = computed(() =>
    cachedSummaryData.value?.modes.find((entry) => entry.mode === HTS_MODE_VEHICLE_DRIVER) ??
    null,
  )

  const ptCostAud = computed(
    () =>
      cachedSummaryData.value?.corridor?.pt_weekly_cost_aud ??
      ptModeEntry.value?.weekly_cost_aud ??
      null,
  )

  const carCostAud = computed(
    () =>
      cachedSummaryData.value?.corridor?.car_weekly_cost_aud ??
      carModeEntry.value?.weekly_cost_aud ??
      null,
  )

  const weeklyCostDeltaAud = computed(() => {
    const corridorDelta = cachedSummaryData.value?.corridor?.weekly_cost_delta_aud
    if (corridorDelta !== null && corridorDelta !== undefined) {
      return corridorDelta
    }
    if (ptCostAud.value === null || carCostAud.value === null) return null
    return Math.round((carCostAud.value - ptCostAud.value) * 100) / 100
  })

  const timeDeltaMin = computed(
    () => cachedSummaryData.value?.corridor?.time_delta_min ?? null,
  )

  const ptMinutes = computed(
    () => cachedSummaryData.value?.corridor?.pt_minutes ?? ptModeEntry.value?.time_minutes ?? null,
  )

  const drivingMinutes = computed(
    () =>
      cachedSummaryData.value?.corridor?.driving_minutes ??
      carModeEntry.value?.time_minutes ??
      null,
  )

  const commuterVolume = computed(
    () => cachedSummaryData.value?.corridor?.commuter_volume ?? 0,
  )

  const tollSubsidyAud = computed(
    () => cachedSummaryData.value?.corridor?.toll_subsidy_aud ?? 0,
  )

  const hasActiveSummary = computed(() => cachedSummaryData.value !== null)

  const trendByQuarter = computed((): TrendQuarterPoint[] => {
    const quarters = [
      ...new Set(historicalTrendData.value.map((row) => row.reporting_quarter)),
    ]

    return quarters.map((quarter) => {
      const quarterRows = historicalTrendData.value.filter(
        (row) => row.reporting_quarter === quarter,
      )
      const ptWeekly = findModeCost(quarterRows, quarter, HTS_MODE_PUBLIC_TRANSPORT)
      const carWeekly = findModeCost(quarterRows, quarter, HTS_MODE_VEHICLE_DRIVER)
      const tollSubsidy = quarterRows
        .filter((row) => row.mode === HTS_MODE_VEHICLE_DRIVER)
        .reduce((sum, row) => sum + (row.toll_subsidy_aud ?? 0), 0)

      return {
        reporting_quarter: quarter,
        quarter_slug: reportingQuarterToSlug(quarter),
        pt_weekly_cost_aud: ptWeekly,
        car_weekly_cost_aud: carWeekly,
        weekly_cost_delta_aud:
          ptWeekly === null || carWeekly === null
            ? null
            : Math.round((carWeekly - ptWeekly) * 100) / 100,
        time_delta_min: (() => {
          const pt = quarterRows.find((row) => row.mode === HTS_MODE_PUBLIC_TRANSPORT)
          const car = quarterRows.find((row) => row.mode === HTS_MODE_VEHICLE_DRIVER)
          if (!pt || !car) return null
          return pt.time_minutes - car.time_minutes
        })(),
        toll_subsidy_aud: Math.round(tollSubsidy * 100) / 100,
      }
    })
  })

  const averageWeeklyCostDeltaAud = computed(() => {
    const deltas = trendByQuarter.value
      .map((point) => point.weekly_cost_delta_aud)
      .filter((value): value is number => value !== null)
    if (!deltas.length) return null
    const total = deltas.reduce((sum, value) => sum + value, 0)
    return Math.round((total / deltas.length) * 100) / 100
  })

  const latestTrendPoint = computed(
    () => trendByQuarter.value[trendByQuarter.value.length - 1] ?? null,
  )

  async function fetchActiveSummary(): Promise<void> {
    const quarter = reportingQuarter.value
    const origin = selectedOrigin.value

    const rows = await fetchReportSummaryRows(quarter, origin)
    cachedSummaryData.value =
      buildCachedSummary(rows, quarter, origin, timeScale.value) ??
      buildSeedCachedSummary(origin, quarter, timeScale.value)
  }

  async function fetchHistoricalTrends(): Promise<void> {
    const origin = selectedOrigin.value
    const rows = await fetchHistoricalSnapshotRows(origin)
    const hydrated = rows.length ? rows : buildSeedHistoricalSnapshots(origin, reportingQuarter.value)
    historicalTrendData.value = transformHistoricalRows(hydrated, timeScale.value)
  }

  async function refreshReportData(): Promise<void> {
    const generation = ++refreshGeneration
    isLoading.value = true
    loadError.value = null

    try {
      await Promise.all([fetchActiveSummary(), fetchHistoricalTrends()])
    } catch (error) {
      if (generation !== refreshGeneration) return
      cachedSummaryData.value = null
      historicalTrendData.value = []
      loadError.value =
        error instanceof SupabaseClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to load commute report data.'
    } finally {
      if (generation === refreshGeneration) {
        isLoading.value = false
      }
    }
  }

  function setTimeScale(scale: TimeScale) {
    timeScale.value = scale
  }

  function setSelectedQuarter(quarter: ReportQuarterSlug) {
    selectedQuarter.value = quarter
  }

  function setSelectedOrigin(origin: string) {
    selectedOrigin.value = origin
  }

  watch(
    [timeScale, selectedQuarter, selectedOrigin],
    () => {
      void refreshReportData()
    },
    { immediate: true },
  )

  return {
    timeScale,
    selectedQuarter,
    selectedOrigin,
    cachedSummaryData,
    historicalTrendData,
    isLoading,
    loadError,
    reportingQuarter,
    ptCostAud,
    carCostAud,
    weeklyCostDeltaAud,
    timeDeltaMin,
    ptMinutes,
    drivingMinutes,
    commuterVolume,
    tollSubsidyAud,
    hasActiveSummary,
    trendByQuarter,
    averageWeeklyCostDeltaAud,
    latestTrendPoint,
    ptModeEntry,
    carModeEntry,
    fetchActiveSummary,
    fetchHistoricalTrends,
    refreshReportData,
    setTimeScale,
    setSelectedQuarter,
    setSelectedOrigin,
  }
})
