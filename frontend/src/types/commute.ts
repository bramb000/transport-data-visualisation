export type VehicleProfileId = 'small_car' | 'medium_car' | 'suv' | 'ute_van'

export interface Coordinates {
  lat: number
  lon: number
  label?: string
}

export interface UserProfileSchema {
  origin: Coordinates
  destination: Coordinates
  vehicle_profile_id?: VehicleProfileId
  fuel_consumption_l_per_100km?: number | null
  fuel_suburb?: string
}

export interface CoordinatePoint {
  lat: number
  lon: number
}

export interface OpalFareDetail {
  distance_km: number
  fare_band: string
  fare_aud: number
  fare_peak_aud: number
  fare_off_peak_aud: number
  fare_type: string
}

export interface TransitLeg {
  mode: string
  duration_min: number
  distance_km: number
  route_number?: string | null
  origin?: string | null
  destination?: string | null
}

export interface PublicTransportMetrics {
  duration_min?: number | null
  distance_km?: number | null
  cost_aud?: number | null
  modes: string[]
  route_numbers: string[]
  route_label?: string | null
  option_rank?: number | null
  legs: TransitLeg[]
  interchanges?: number | null
  fare?: OpalFareDetail | null
  error?: string | null
}

export interface DrivingMetrics {
  duration_min?: number | null
  distance_km?: number | null
  cost_aud?: number | null
  fuel_price_per_litre?: number | null
  fuel_price_source?: string | null
  consumption_l_per_100km?: number | null
  litres_used?: number | null
  geometry?: string | null
  warning?: string | null
  error?: string | null
}

export interface CommuteMetricsResponse {
  origin: CoordinatePoint
  destination: CoordinatePoint
  public_transport: PublicTransportMetrics
  public_transport_options: PublicTransportMetrics[]
  driving: DrivingMetrics
  errors: string[]
  fetched_at: string
}

export interface VehicleProfile {
  id: VehicleProfileId
  label: string
  default_consumption_l_per_100km: number
}

export type VehicleProfilesResponse = Record<VehicleProfileId, VehicleProfile>
