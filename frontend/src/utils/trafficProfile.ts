/** Client-side off-peak driving factor until Supabase stores both traffic profiles. */
export const OFF_PEAK_TIME_FACTOR = 0.72

export function rushPenaltyMinutes(drivingMinutes: number | null): number {
  if (drivingMinutes === null) return 0
  const offPeak = Math.round(drivingMinutes * OFF_PEAK_TIME_FACTOR)
  return Math.max(0, drivingMinutes - offPeak)
}

export function offPeakDrivingMinutes(drivingMinutes: number | null): number | null {
  if (drivingMinutes === null) return null
  return Math.round(drivingMinutes * OFF_PEAK_TIME_FACTOR)
}
