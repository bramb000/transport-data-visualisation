/** Map visualization modes for the commute affordability report. */
export type MapVisualizationMode = 'choropleth' | 'flow'

/** Choropleth metric toggles in Mode A. */
export type ChoroplethMetric = 'time_penalty' | 'financial_cost'

/** Timeline quarters driving toll-cap narrative shifts. */
export type TimelineQuarter = 'Q4 2023' | 'Q1 2024' | 'Q2 2024' | 'Q3 2024'

export interface Sa3BoundaryProperties {
  sa3_code: string
  sa3_name: string
}

export interface Sa3RegionMetrics {
  sa3_code: string
  sa3_name: string
  /** Weighted average daily cost to CBD (Opal vs fuel/tolls), AUD. */
  avg_cost_to_cbd: number
  /** Weighted average time delta vs fastest mode, minutes. */
  avg_time_delta_min: number
  /** Normalised 0–1 penalty for choropleth time colouring. */
  time_penalty: number
  /** Normalised 0–1 penalty for choropleth cost colouring. */
  financial_cost: number
}

export interface FlowCorridor {
  destination_sa3_code: string
  destination_sa3_name: string
  commuter_volume: number
  pt_minutes: number
  driving_minutes: number
}

export interface HoverPopupPayload {
  sa3_name: string
  avg_cost_to_cbd: number
  avg_time_delta_min: number
}

export type RegionMetricsByQuarter = Record<TimelineQuarter, Record<string, Sa3RegionMetrics>>

export type FlowCorridorsByOrigin = Record<string, FlowCorridor[]>
