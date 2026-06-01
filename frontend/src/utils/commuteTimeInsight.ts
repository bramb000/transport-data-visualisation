import type { HistoricalTrendPoint } from '../types/commuteData'

export interface CommuteTimeInsight {
  headline: string
  body: string
}

/** Plain-language copy from monthly average commute time (first vs latest month). */
export function buildCommuteTimeInsight(points: HistoricalTrendPoint[]): CommuteTimeInsight {
  const series = points.filter((point) => point.averageTimeMinutes !== null)
  if (series.length < 2) {
    return {
      headline: 'Not enough history yet',
      body: 'Load monthly commute snapshots to see whether travel times are rising or falling.',
    }
  }

  const first = series[0]!
  const last = series[series.length - 1]!
  const startMinutes = first.averageTimeMinutes!
  const endMinutes = last.averageTimeMinutes!
  const change = Math.round((endMinutes - startMinutes) * 10) / 10
  const absChange = Math.abs(change)

  if (absChange < 1) {
    return {
      headline: 'Commute times held steady',
      body: `Average time stayed near ${endMinutes} minutes between ${first.monthLabel} and ${last.monthLabel}.`,
    }
  }

  if (change > 0) {
    return {
      headline: 'Commute times are increasing',
      body: `Average commute time rose by ${absChange} minutes from ${first.monthLabel} (${startMinutes} min) to ${last.monthLabel} (${endMinutes} min).`,
    }
  }

  return {
    headline: 'Commute times are decreasing',
    body: `Average commute time fell by ${absChange} minutes from ${first.monthLabel} (${startMinutes} min) to ${last.monthLabel} (${endMinutes} min).`,
  }
}
