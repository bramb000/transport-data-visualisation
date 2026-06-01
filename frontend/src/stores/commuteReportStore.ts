import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ChoroplethMetric,
  FlowCorridor,
  FlowCorridorsByOrigin,
  MapVisualizationMode,
  RegionMetricsByQuarter,
  Sa3RegionMetrics,
  TimelineQuarter,
} from '../types/commuteReport'

const DEFAULT_DESTINATION_SA3 = 'Sydney Inner City'

/** Seed metrics illustrating Western Sydney toll-cap relief narrative (Q4 2023 → Q1 2024). */
function buildSeedMetrics(): RegionMetricsByQuarter {
  const westernHighPenalty: Sa3RegionMetrics = {
    sa3_code: '11801',
    sa3_name: 'Penrith',
    avg_cost_to_cbd: 28.4,
    avg_time_delta_min: 52,
    time_penalty: 0.82,
    financial_cost: 0.91,
  }
  const westernRelief: Sa3RegionMetrics = {
    ...westernHighPenalty,
    avg_cost_to_cbd: 14.2,
    avg_time_delta_min: 48,
    time_penalty: 0.74,
    financial_cost: 0.38,
  }

  const blacktownHigh: Sa3RegionMetrics = {
    sa3_code: '11802',
    sa3_name: 'Blacktown',
    avg_cost_to_cbd: 24.6,
    avg_time_delta_min: 44,
    time_penalty: 0.71,
    financial_cost: 0.84,
  }
  const blacktownRelief: Sa3RegionMetrics = {
    ...blacktownHigh,
    avg_cost_to_cbd: 12.8,
    avg_time_delta_min: 41,
    time_penalty: 0.66,
    financial_cost: 0.35,
  }

  const canterbury: Sa3RegionMetrics = {
    sa3_code: '12503',
    sa3_name: 'Canterbury',
    avg_cost_to_cbd: 8.9,
    avg_time_delta_min: 18,
    time_penalty: 0.28,
    financial_cost: 0.22,
  }

  const innerCity: Sa3RegionMetrics = {
    sa3_code: '11703',
    sa3_name: 'Sydney Inner City',
    avg_cost_to_cbd: 4.1,
    avg_time_delta_min: 4,
    time_penalty: 0.05,
    financial_cost: 0.08,
  }

  const strathfield: Sa3RegionMetrics = {
    sa3_code: '12504',
    sa3_name: 'Strathfield - Burwood - Ashfield',
    avg_cost_to_cbd: 7.2,
    avg_time_delta_min: 14,
    time_penalty: 0.21,
    financial_cost: 0.18,
  }

  const baseQ4: Record<string, Sa3RegionMetrics> = {
    [westernHighPenalty.sa3_code]: westernHighPenalty,
    [blacktownHigh.sa3_code]: blacktownHigh,
    [canterbury.sa3_code]: canterbury,
    [innerCity.sa3_code]: innerCity,
    [strathfield.sa3_code]: strathfield,
  }

  const baseQ1: Record<string, Sa3RegionMetrics> = {
    ...baseQ4,
    [westernHighPenalty.sa3_code]: westernRelief,
    [blacktownHigh.sa3_code]: blacktownRelief,
  }

  return {
    'Q4 2023': baseQ4,
    'Q1 2024': baseQ1,
    'Q2 2024': baseQ1,
    'Q3 2024': baseQ1,
  }
}

function buildSeedFlows(): FlowCorridorsByOrigin {
  return {
    '12503': [
      {
        destination_sa3_code: '11703',
        destination_sa3_name: 'Sydney Inner City',
        commuter_volume: 18200,
        pt_minutes: 42,
        driving_minutes: 28,
      },
      {
        destination_sa3_code: '12504',
        destination_sa3_name: 'Strathfield - Burwood - Ashfield',
        commuter_volume: 9400,
        pt_minutes: 18,
        driving_minutes: 12,
      },
      {
        destination_sa3_code: '11802',
        destination_sa3_name: 'Blacktown',
        commuter_volume: 5100,
        pt_minutes: 55,
        driving_minutes: 24,
      },
      {
        destination_sa3_code: '11801',
        destination_sa3_name: 'Penrith',
        commuter_volume: 3200,
        pt_minutes: 78,
        driving_minutes: 35,
      },
      {
        destination_sa3_code: '11703',
        destination_sa3_name: 'North Sydney - Mosman',
        commuter_volume: 2800,
        pt_minutes: 48,
        driving_minutes: 22,
      },
    ],
  }
}

export const useCommuteReportStore = defineStore('commuteReport', () => {
  const mapMode = ref<MapVisualizationMode>('choropleth')
  const choroplethMetric = ref<ChoroplethMetric>('financial_cost')
  const activeTimeline = ref<TimelineQuarter>('Q4 2023')
  const fixedDestinationSa3 = ref(DEFAULT_DESTINATION_SA3)
  const selectedOriginSa3Code = ref<string | null>(null)
  const isDataLoading = ref(false)
  const regionMetricsByQuarter = ref<RegionMetricsByQuarter>(buildSeedMetrics())
  const flowCorridorsByOrigin = ref<FlowCorridorsByOrigin>(buildSeedFlows())

  const activeRegionMetrics = computed(
    () => regionMetricsByQuarter.value[activeTimeline.value] ?? {},
  )

  const selectedOriginMetrics = computed(() => {
    if (!selectedOriginSa3Code.value) return null
    return activeRegionMetrics.value[selectedOriginSa3Code.value] ?? null
  })

  const activeFlowCorridors = computed((): FlowCorridor[] => {
    if (!selectedOriginSa3Code.value) return []
    return flowCorridorsByOrigin.value[selectedOriginSa3Code.value] ?? []
  })

  const accessibilityTableRows = computed(() =>
    Object.values(activeRegionMetrics.value).map((row) => ({
      sa3_code: row.sa3_code,
      sa3_name: row.sa3_name,
      avg_cost_to_cbd: row.avg_cost_to_cbd,
      avg_time_delta_min: row.avg_time_delta_min,
      time_penalty: row.time_penalty,
      financial_cost: row.financial_cost,
      timeline: activeTimeline.value,
      metric: choroplethMetric.value,
      destination: fixedDestinationSa3.value,
    })),
  )

  const accessibilityTableKey = computed(
    () =>
      `${mapMode.value}-${choroplethMetric.value}-${activeTimeline.value}-${selectedOriginSa3Code.value ?? 'none'}`,
  )

  function setMapMode(mode: MapVisualizationMode) {
    mapMode.value = mode
  }

  function setChoroplethMetric(metric: ChoroplethMetric) {
    choroplethMetric.value = metric
  }

  function setActiveTimeline(quarter: TimelineQuarter) {
    activeTimeline.value = quarter
  }

  function selectOriginSa3(sa3Code: string | null) {
    selectedOriginSa3Code.value = sa3Code
  }

  function setDataLoading(loading: boolean) {
    isDataLoading.value = loading
  }

  return {
    mapMode,
    choroplethMetric,
    activeTimeline,
    fixedDestinationSa3,
    selectedOriginSa3Code,
    isDataLoading,
    regionMetricsByQuarter,
    flowCorridorsByOrigin,
    activeRegionMetrics,
    selectedOriginMetrics,
    activeFlowCorridors,
    accessibilityTableRows,
    accessibilityTableKey,
    setMapMode,
    setChoroplethMetric,
    setActiveTimeline,
    selectOriginSa3,
    setDataLoading,
  }
})
