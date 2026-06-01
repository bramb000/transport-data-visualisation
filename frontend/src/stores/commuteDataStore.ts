import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  fetchAllHistoricalSnapshots,
  fetchCorridorSummaryRows,
  fetchMetroCorridorSummaries,
} from '../api/reportSupabase'
import { SupabaseClientError } from '../api/supabaseClient'
import type {
  AggregationMode,
  MacroAverages,
  RouteMetrics,
  RouteSelection,
  SuburbDeviation,
  TrendDistanceFilterKm,
} from '../types/commuteData'
import {
  CITY_WIDE_ORIGIN_SA3,
  DEFAULT_DESTINATION_SA3,
  DEFAULT_REPORTING_QUARTER,
  SCROLL_STEP_COUNT,
} from '../types/commuteData'
import type {
  CorridorSummaryPayload,
  HistoricalCommuteSnapshotRow,
  ModeBreakdownEntry,
  ModeBreakdownPayload,
  ReportSummaryCacheRow,
} from '../types/supabaseTables'
import { HTS_MODE_PUBLIC_TRANSPORT, HTS_MODE_VEHICLE_DRIVER } from '../types/supabaseTables'
import { buildCommuteTimeInsight } from '../utils/commuteTimeInsight'
import { buildMonthlyHistoricalTrends, countTrendMonths } from '../utils/historicalTrends'
import { offPeakDrivingMinutes, rushPenaltyMinutes } from '../utils/trafficProfile'
import { weeklyToDailyCost } from '../utils/tollCap'

export type {
  AggregationMode,
  HistoricalTrendPoint,
  MacroAverages,
  SuburbDeviation,
  RouteMetrics,
  TrendDistanceFilterKm,
} from '../types/commuteData'

function isCorridorPayload(payload: unknown): payload is CorridorSummaryPayload {
  if (!payload || typeof payload !== 'object') return false
  return 'origin_sa3' in payload && 'destination_sa3' in payload
}

function isModeBreakdownPayload(payload: unknown): payload is ModeBreakdownPayload {
  if (!payload || typeof payload !== 'object') return false
  return Array.isArray((payload as ModeBreakdownPayload).modes)
}

function scaleMoney(value: number | null, mode: AggregationMode): number | null {
  if (value === null) return null
  return mode === 'weekly' ? value : weeklyToDailyCost(value)
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function buildMacroFromCorridor(
  corridor: CorridorSummaryPayload | null,
  mode: AggregationMode,
): MacroAverages {
  if (!corridor) return { averageTimeMinutes: null, averageCostAud: null }

  const ptMinutes = corridor.pt_minutes
  const drivingMinutes = corridor.driving_minutes
  const timeSamples = [ptMinutes, drivingMinutes].filter((value): value is number => value !== null)

  const ptCost = scaleMoney(corridor.pt_weekly_cost_aud, mode)
  const carCost = scaleMoney(corridor.car_weekly_cost_aud, mode)
  const costSamples = [ptCost, carCost].filter((value): value is number => value !== null)

  return {
    averageTimeMinutes: mean(timeSamples),
    averageCostAud: mean(costSamples),
  }
}

function buildSuburbDeviations(corridors: CorridorSummaryPayload[]): SuburbDeviation[] {
  const leave: SuburbDeviation[] = []
  const arriveMap = new Map<string, SuburbDeviation>()

  for (const row of corridors) {
    if (row.origin_sa3 === CITY_WIDE_ORIGIN_SA3) continue
    const rush = row.driving_minutes
    if (rush === null) continue

    const offPeak = offPeakDrivingMinutes(rush) ?? rush
    const penalty = rushPenaltyMinutes(rush)

    if (row.destination_sa3 === DEFAULT_DESTINATION_SA3) {
      leave.push({
        sa3Name: row.origin_sa3,
        listType: 'leave',
        offPeakMinutes: offPeak,
        rushHourMinutes: rush,
        penaltyMinutes: penalty,
      })
    }

    const existing = arriveMap.get(row.destination_sa3)
    if (!existing || penalty > existing.penaltyMinutes) {
      arriveMap.set(row.destination_sa3, {
        sa3Name: row.destination_sa3,
        listType: 'arrive',
        offPeakMinutes: offPeak,
        rushHourMinutes: rush,
        penaltyMinutes: penalty,
      })
    }
  }

  return [
    ...leave.sort((left, right) => right.penaltyMinutes - left.penaltyMinutes),
    ...[...arriveMap.values()].sort((left, right) => right.penaltyMinutes - left.penaltyMinutes),
  ]
}

function buildRouteMetrics(
  rows: ReportSummaryCacheRow[],
  origin: string,
  destination: string,
  mode: AggregationMode,
): RouteMetrics | null {
  if (!rows.length) return null

  const corridorRow = rows.find((row) => row.summary_key === 'corridor_summary')
  const modeRow = rows.find((row) => row.summary_key === 'mode_breakdown')

  const rawCorridor = corridorRow?.payload
  const corridor =
    rawCorridor && isCorridorPayload(rawCorridor)
      ? {
          ...rawCorridor,
          pt_weekly_cost_aud: scaleMoney(rawCorridor.pt_weekly_cost_aud, mode),
          car_weekly_cost_aud: scaleMoney(rawCorridor.car_weekly_cost_aud, mode),
          weekly_cost_delta_aud: scaleMoney(rawCorridor.weekly_cost_delta_aud, mode),
        }
      : null

  const rawModes = modeRow?.payload
  const modes: ModeBreakdownEntry[] =
    rawModes && isModeBreakdownPayload(rawModes)
      ? rawModes.modes.map((entry) => ({
          ...entry,
          weekly_cost_aud: scaleMoney(entry.weekly_cost_aud, mode),
        }))
      : []

  const rush = corridor?.driving_minutes ?? null
  const offPeak = offPeakDrivingMinutes(rush)

  const ptEntry = modes.find((entry) => entry.mode === HTS_MODE_PUBLIC_TRANSPORT)
  const carEntry = modes.find((entry) => entry.mode === HTS_MODE_VEHICLE_DRIVER)

  return {
    origin_sa3: origin,
    destination_sa3: destination,
    rushMinutes: rush,
    offPeakMinutes: offPeak,
    penaltyMinutes: rush !== null && offPeak !== null ? rush - offPeak : null,
    ptCostAud: corridor?.pt_weekly_cost_aud ?? ptEntry?.weekly_cost_aud ?? null,
    carCostAud: corridor?.car_weekly_cost_aud ?? carEntry?.weekly_cost_aud ?? null,
    modes,
    corridor,
  }
}

export const useCommuteDataStore = defineStore('commuteData', () => {
  const aggregationMode = ref<AggregationMode>('weekly')
  const trendDistanceKm = ref<TrendDistanceFilterKm>(50)
  const suburbDeviations = ref<SuburbDeviation[]>([])
  const metroCorridors = ref<CorridorSummaryPayload[]>([])
  const rawHistoricalRows = ref<HistoricalCommuteSnapshotRow[]>([])
  const routeSelection = ref<RouteSelection>({ origin: 'Canterbury', destination: DEFAULT_DESTINATION_SA3 })
  const routeMetrics = ref<RouteMetrics | null>(null)

  const activeStep = ref(0)
  const stepScrollProgress = ref(0)

  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  let loadGeneration = 0

  const macroAverages = computed(() =>
    buildMacroFromCorridor(
      metroCorridors.value.find(
        (row) =>
          row.origin_sa3 === CITY_WIDE_ORIGIN_SA3 &&
          row.destination_sa3 === DEFAULT_DESTINATION_SA3,
      ) ?? null,
      aggregationMode.value,
    ),
  )

  const leaveDeviations = computed(() =>
    suburbDeviations.value.filter((row) => row.listType === 'leave').slice(0, 8),
  )

  const arriveDeviations = computed(() =>
    suburbDeviations.value.filter((row) => row.listType === 'arrive').slice(0, 8),
  )

  const historicalTrends = computed(() =>
    buildMonthlyHistoricalTrends(
      rawHistoricalRows.value,
      aggregationMode.value,
      trendDistanceKm.value,
    ),
  )

  const trendMonthCount = computed(() =>
    countTrendMonths(rawHistoricalRows.value, trendDistanceKm.value),
  )

  const commuteTimeInsight = computed(() => buildCommuteTimeInsight(historicalTrends.value))

  async function fetchCoreData(): Promise<void> {
    const generation = ++loadGeneration
    isLoading.value = true
    loadError.value = null

    try {
      const [snapshots, corridorRows] = await Promise.all([
        fetchAllHistoricalSnapshots(),
        fetchMetroCorridorSummaries(DEFAULT_REPORTING_QUARTER),
      ])

      if (generation !== loadGeneration) return

      rawHistoricalRows.value = snapshots
      metroCorridors.value = corridorRows
        .map((row) => row.payload)
        .filter(isCorridorPayload)
      suburbDeviations.value = buildSuburbDeviations(metroCorridors.value)

      await fetchRouteMetrics()
    } catch (error) {
      if (generation !== loadGeneration) return
      rawHistoricalRows.value = []
      suburbDeviations.value = []
      metroCorridors.value = []
      routeMetrics.value = null
      loadError.value =
        error instanceof SupabaseClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to load commute data.'
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false
      }
    }
  }

  async function fetchRouteMetrics(): Promise<void> {
    const { origin, destination } = routeSelection.value
    if (!origin || !destination) {
      routeMetrics.value = null
      return
    }

    const rows = await fetchCorridorSummaryRows(DEFAULT_REPORTING_QUARTER, origin, destination)
    routeMetrics.value = buildRouteMetrics(rows, origin, destination, aggregationMode.value)
  }

  function setAggregationMode(mode: AggregationMode) {
    aggregationMode.value = mode
  }

  function setTrendDistanceKm(km: TrendDistanceFilterKm) {
    trendDistanceKm.value = km
  }

  function setActiveStep(step: number) {
    const clamped = Math.max(0, Math.min(step, SCROLL_STEP_COUNT - 1))
    if (activeStep.value === clamped) return
    activeStep.value = clamped
    stepScrollProgress.value = 0
  }

  function setStepScrollProgress(progress: number) {
    stepScrollProgress.value = Math.max(0, Math.min(progress, 1))
  }

  function setRouteSelection(selection: RouteSelection) {
    routeSelection.value = { ...selection }
  }

  watch(aggregationMode, () => {
    void fetchRouteMetrics()
  })

  watch(routeSelection, () => {
    void fetchRouteMetrics()
  }, { deep: true })

  void fetchCoreData()

  return {
    aggregationMode,
    trendDistanceKm,
    historicalTrends,
    trendMonthCount,
    commuteTimeInsight,
    suburbDeviations,
    metroCorridors,
    routeSelection,
    routeMetrics,
    activeStep,
    stepScrollProgress,
    isLoading,
    loadError,
    macroAverages,
    leaveDeviations,
    arriveDeviations,
    fetchCoreData,
    fetchRouteMetrics,
    setAggregationMode,
    setTrendDistanceKm,
    setActiveStep,
    setStepScrollProgress,
    setRouteSelection,
  }
})
