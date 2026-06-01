import type {
  CommuteMetricsResponse,
  UserProfileSchema,
  VehicleProfilesResponse,
} from '../types/commute'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export class CommuteApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(message: string, status: number, detail: string) {
    super(message)
    this.name = 'CommuteApiError'
    this.status = status
    this.detail = detail
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorBody = (await response.json()) as { detail?: string | { msg: string }[] }
      if (typeof errorBody.detail === 'string') {
        detail = errorBody.detail
      } else if (Array.isArray(errorBody.detail)) {
        detail = errorBody.detail.map((item) => item.msg).join('; ')
      }
    } catch {
      // Keep default status text when error body is not JSON.
    }
    throw new CommuteApiError(`Request failed (${response.status})`, response.status, detail)
  }

  return response.json() as Promise<T>
}

export async function fetchHealth(): Promise<{ status: string }> {
  return requestJson<{ status: string }>('/api/v1/health')
}

export async function fetchVehicleProfiles(): Promise<VehicleProfilesResponse> {
  return requestJson<VehicleProfilesResponse>('/api/v1/vehicle-profiles')
}

export async function calculateCommute(
  profile: UserProfileSchema,
): Promise<CommuteMetricsResponse> {
  const payload: UserProfileSchema = {
    vehicle_profile_id: profile.vehicle_profile_id ?? 'medium_car',
    fuel_suburb: profile.fuel_suburb ?? 'Sydney',
    origin: profile.origin,
    destination: profile.destination,
    ...(profile.fuel_consumption_l_per_100km != null
      ? { fuel_consumption_l_per_100km: profile.fuel_consumption_l_per_100km }
      : {}),
  }

  return requestJson<CommuteMetricsResponse>('/api/v1/commute/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
