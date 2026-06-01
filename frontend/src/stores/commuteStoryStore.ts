import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  fetchCorridorSummaryRows,
  fetchMetroCorridorSummaries,
} from '../api/reportSupabase'
import { SupabaseClientError } from '../api/supabaseClient'
import type {
  AggregationMode,
  CityAverages,
  RouteStorySnapshot,
  TrafficComparison,
  TrafficState,
} from '../types/commuteStory'
import {
  CITY_WIDE_ORIGIN_SA3,
  DEFAULT_DESTINATION_SA3,
  DEFAULT_REPORTING_QUARTER,
} from '../types/commuteStory'
import type {
  CorridorSummaryPayload,
  ModeBreakdownEntry,
  ModeBreakdownPayload,
  ReportSummaryCacheRow,
} from '../types/supabaseTables'
import type { RushHourLeaderEntry } from '../types/commuteStory'
import { offPeakDrivingMinutes, rushPenaltyMinutes } from '../utils/trafficProfile'
import { weeklyToDailyCost } from '../utils/tollCap'

export type {
  AggregationMode,
  TrafficState,
  CityAverages,
  RouteStorySnapshot,
  TrafficComparison,
  RushHourLeaderEntry,
}

const SEED_LEAVE_LEADERS: RushHourLeaderEntry[] = [
  {
    sa3Name: 'Penrith',
    penaltyMinutes: 45,
    annotation: 'Penrith: +45 mins of gridlock',
  },
  {
    sa3Name: 'Blacktown',
    penaltyMinutes: 38,
    annotation: 'Blacktown: +38 mins of gridlock',
  },
  {
    sa3Name: 'Canterbury',
    penaltyMinutes: 12,
    annotation: 'Canterbury: +12 mins of gridlock',
  },
]

const SEED_ARRIVE_LEADERS: RushHourLeaderEntry[] = [
  {
    sa3Name: 'Sydney Inner City',
    penaltyMinutes: 22,
    annotation: 'Sydney Inner City: +22 mins of gridlock',
  },
  {
    sa3Name: 'Strathfield - Burwood - Ashfield',
    penaltyMinutes: 8,
    annotation: 'Strathfield - Burwood - Ashfield: +8 mins of gridlock',
  },
  {
    sa3Name: 'Parramatta',
    penaltyMinutes: 31,
    annotation: 'Parramatta: +31 mins of gridlock',
  },
]

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

function scaleCorridor(
  corridor: CorridorSummaryPayload,
  mode: AggregationMode,
): CorridorSummaryPayload {
  if (mode === 'weekly') return corridor

  return {
    ...corridor,
    pt_weekly_cost_aud: scaleMoney(corridor.pt_weekly_cost_aud, mode),
    car_weekly_cost_aud: scaleMoney(corridor.car_weekly_cost_aud, mode),
    weekly_cost_delta_aud: scaleMoney(corridor.weekly_cost_delta_aud, mode),
    toll_subsidy_aud: scaleMoney(corridor.toll_subsidy_aud, mode) ?? 0,
  }
}

function scaleModeEntry(entry: ModeBreakdownEntry, mode: AggregationMode): ModeBreakdownEntry {
  if (mode === 'weekly') return entry

  return {
    ...entry,
    single_trip_cost_aud:
      entry.single_trip_cost_aud === null
        ? null
        : Math.round(entry.single_trip_cost_aud * 2 * 100) / 100,
    weekly_cost_aud: scaleMoney(entry.weekly_cost_aud, mode),
    toll_subsidy_aud:
      entry.toll_subsidy_aud === null || entry.toll_subsidy_aud === undefined
        ? entry.toll_subsidy_aud
        : scaleMoney(entry.toll_subsidy_aud, mode),
  }
}

function buildRouteSnapshot(
  rows: ReportSummaryCacheRow[],
  originSa3: string,
  destinationSa3: string,
  aggregationMode: AggregationMode,
): RouteStorySnapshot | null {
  if (!rows.length) return null

  const corridorRow = rows.find((row) => row.summary_key === 'corridor_summary')
  const modeRow = rows.find((row) => row.summary_key === 'mode_breakdown')

  const rawCorridor = corridorRow?.payload
  const corridor =
    rawCorridor && isCorridorPayload(rawCorridor)
      ? scaleCorridor(rawCorridor, aggregationMode)
      : null

  const rawModes = modeRow?.payload
  const modes =
    rawModes && isModeBreakdownPayload(rawModes)
      ? rawModes.modes.map((entry) => scaleModeEntry(entry, aggregationMode))
      : []

  return {
    origin_sa3: originSa3,
    destination_sa3: destinationSa3,
    reporting_quarter: corridorRow?.reporting_quarter ?? DEFAULT_REPORTING_QUARTER,
    corridor,
    modes,
    computed_at: corridorRow?.computed_at ?? modeRow?.computed_at ?? null,
  }
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function drivingMinutesForTraffic(
  corridor: CorridorSummaryPayload,
  trafficState: TrafficState,
): number | null {
  const rush = corridor.driving_minutes
  if (rush === null) return null
  if (trafficState === 'rush_hour') return rush
  return offPeakDrivingMinutes(rush)
}

function cityAveragesFromCorridor(
  corridor: CorridorSummaryPayload | null,
  aggregationMode: AggregationMode,
  trafficState: TrafficState,
): CityAverages {
  if (!corridor) {
    return { averageTimeMinutes: null, averageCostAud: null }
  }

  const ptMinutes = corridor.pt_minutes
  const drivingMinutes = drivingMinutesForTraffic(corridor, trafficState)
  const timeSamples = [ptMinutes, drivingMinutes].filter((value): value is number => value !== null)

  const ptCost = scaleMoney(corridor.pt_weekly_cost_aud, aggregationMode)
  const carCost = scaleMoney(corridor.car_weekly_cost_aud, aggregationMode)
  const costSamples = [ptCost, carCost].filter((value): value is number => value !== null)

  return {
    averageTimeMinutes: mean(timeSamples),
    averageCostAud: mean(costSamples),
  }
}

function trafficComparisonFromCorridor(
  corridor: CorridorSummaryPayload | null,
): TrafficComparison {
  if (!corridor || corridor.driving_minutes === null) {
    return { rushMinutes: null, offPeakMinutes: null, penaltyMinutes: null }
  }

  const rushMinutes = corridor.driving_minutes
  const offPeakMinutes = offPeakDrivingMinutes(rushMinutes)

  return {
    rushMinutes,
    offPeakMinutes,
    penaltyMinutes: rushPenaltyMinutes(rushMinutes),
  }
}

function annotatePenalty(sa3Name: string, penaltyMinutes: number): string {
  return `${sa3Name}: +${penaltyMinutes} mins of gridlock`
}

function buildLeaveLeaderboard(corridors: CorridorSummaryPayload[]): RushHourLeaderEntry[] {
  const entries = corridors
    .filter(
      (row) =>
        row.destination_sa3 === DEFAULT_DESTINATION_SA3 &&
        row.origin_sa3 !== CITY_WIDE_ORIGIN_SA3,
    )
    .map((row) => {
      const penaltyMinutes = rushPenaltyMinutes(row.driving_minutes)
      return {
        sa3Name: row.origin_sa3,
        penaltyMinutes,
        annotation: annotatePenalty(row.origin_sa3, penaltyMinutes),
      }
    })
    .sort((left, right) => right.penaltyMinutes - left.penaltyMinutes)

  return mergeLeaderboardWithSeed(entries, SEED_LEAVE_LEADERS)
}

function buildArriveLeaderboard(corridors: CorridorSummaryPayload[]): RushHourLeaderEntry[] {
  const byDestination = new Map<string, number>()

  for (const row of corridors) {
    if (row.origin_sa3 === CITY_WIDE_ORIGIN_SA3) continue
    const penalty = rushPenaltyMinutes(row.driving_minutes)
    const current = byDestination.get(row.destination_sa3) ?? 0
    byDestination.set(row.destination_sa3, Math.max(current, penalty))
  }

  const entries = [...byDestination.entries()]
    .map(([sa3Name, penaltyMinutes]) => ({
      sa3Name,
      penaltyMinutes,
      annotation: annotatePenalty(sa3Name, penaltyMinutes),
    }))
    .sort((left, right) => right.penaltyMinutes - left.penaltyMinutes)

  return mergeLeaderboardWithSeed(entries, SEED_ARRIVE_LEADERS)
}

function mergeLeaderboardWithSeed(
  live: RushHourLeaderEntry[],
  seed: RushHourLeaderEntry[],
): RushHourLeaderEntry[] {
  const merged = new Map<string, RushHourLeaderEntry>()
  for (const entry of seed) merged.set(entry.sa3Name, entry)
  for (const entry of live) {
    if (entry.penaltyMinutes > 0) merged.set(entry.sa3Name, entry)
  }
  return [...merged.values()].sort((left, right) => right.penaltyMinutes - left.penaltyMinutes)
}

export const useCommuteStoryStore = defineStore('commuteStory', () => {
  const aggregationMode = ref<AggregationMode>('weekly')
  const trafficState = ref<TrafficState>('rush_hour')
  const selectedOrigin = ref<string | null>(null)
  const selectedDestination = ref<string | null>(null)
  const reportingQuarter = ref(DEFAULT_REPORTING_QUARTER)

  const routeSnapshot = ref<RouteStorySnapshot | null>(null)
  const metroCorridors = ref<CorridorSummaryPayload[]>([])
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  let refreshGeneration = 0

  const hasRouteSelection = computed(
    () => Boolean(selectedOrigin.value && selectedDestination.value),
  )

  const activeRouteLabel = computed(() => {
    if (!selectedOrigin.value || !selectedDestination.value) return null
    return `${selectedOrigin.value} ➔ ${selectedDestination.value}`
  })

  const trafficComparison = computed((): TrafficComparison =>
    trafficComparisonFromCorridor(routeSnapshot.value?.corridor ?? null),
  )

  const cityAverages = computed((): CityAverages =>
    cityAveragesFromCorridor(
      metroCorridors.value.find(
        (row) =>
          row.origin_sa3 === CITY_WIDE_ORIGIN_SA3 &&
          row.destination_sa3 === DEFAULT_DESTINATION_SA3,
      ) ?? null,
      aggregationMode.value,
      trafficState.value,
    ),
  )

  const rushHourLeaveLeaderboard = computed(() =>
    buildLeaveLeaderboard(metroCorridors.value),
  )

  const rushHourArriveLeaderboard = computed(() =>
    buildArriveLeaderboard(metroCorridors.value),
  )

  const ptModeCost = computed(() => {
    const corridor = routeSnapshot.value?.corridor
    if (!corridor) return null
    return scaleMoney(corridor.pt_weekly_cost_aud, aggregationMode.value)
  })

  const carModeCost = computed(() => {
    const corridor = routeSnapshot.value?.corridor
    if (!corridor) return null
    return scaleMoney(corridor.car_weekly_cost_aud, aggregationMode.value)
  })

  async function fetchSelectedRoute(): Promise<void> {
    const origin = selectedOrigin.value
    const destination = selectedDestination.value

    if (!origin || !destination) {
      routeSnapshot.value = null
      return
    }

    const rows = await fetchCorridorSummaryRows(
      reportingQuarter.value,
      origin,
      destination,
    )
    routeSnapshot.value = buildRouteSnapshot(
      rows,
      origin,
      destination,
      aggregationMode.value,
    )
  }

  async function fetchMetroRollup(): Promise<void> {
    const rows = await fetchMetroCorridorSummaries(reportingQuarter.value)
    metroCorridors.value = rows
      .map((row) => row.payload)
      .filter(isCorridorPayload)
      .map((corridor) => scaleCorridor(corridor, aggregationMode.value))
  }

  async function refreshStoryData(): Promise<void> {
    const generation = ++refreshGeneration
    isLoading.value = true
    loadError.value = null

    try {
      await Promise.all([fetchMetroRollup(), fetchSelectedRoute()])
    } catch (error) {
      if (generation !== refreshGeneration) return
      routeSnapshot.value = null
      metroCorridors.value = []
      loadError.value =
        error instanceof SupabaseClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to load commute story data.'
    } finally {
      if (generation === refreshGeneration) {
        isLoading.value = false
      }
    }
  }

  function setAggregationMode(mode: AggregationMode) {
    aggregationMode.value = mode
  }

  function setTrafficState(state: TrafficState) {
    trafficState.value = state
  }

  function setSelectedOrigin(origin: string | null) {
    selectedOrigin.value = origin
  }

  function setSelectedDestination(destination: string | null) {
    selectedDestination.value = destination
  }

  watch(
    [aggregationMode, trafficState, selectedOrigin, selectedDestination, reportingQuarter],
    () => {
      void refreshStoryData()
    },
    { immediate: true },
  )

  return {
    aggregationMode,
    trafficState,
    selectedOrigin,
    selectedDestination,
    reportingQuarter,
    cityAverages,
    routeSnapshot,
    metroCorridors,
    isLoading,
    loadError,
    hasRouteSelection,
    activeRouteLabel,
    trafficComparison,
    rushHourLeaveLeaderboard,
    rushHourArriveLeaderboard,
    ptModeCost,
    carModeCost,
    refreshStoryData,
    setAggregationMode,
    setTrafficState,
    setSelectedOrigin,
    setSelectedDestination,
  }
})
