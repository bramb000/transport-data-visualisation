import { SupabaseClientError } from './supabaseClient'
import { isSupabaseConfigured } from '../utils/deployment'
import type {
  HistoricalCommuteSnapshotRow,
  ReportSummaryCacheRow,
} from '../types/supabaseTables'

interface SupabaseConfig {
  url: string
  anonKey: string
}

function requireSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new SupabaseClientError('Supabase environment variables are not configured.')
  }

  return { url: url.replace(/\/$/, ''), anonKey }
}

function buildHeaders(anonKey: string): HeadersInit {
  return {
    Accept: 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
}

async function fetchSupabaseRows<T>(
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  if (!isSupabaseConfigured()) {
    throw new SupabaseClientError('Supabase is not configured for this deployment.')
  }

  const { url, anonKey } = requireSupabaseConfig()
  const params = new URLSearchParams(query)
  const response = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
    headers: buildHeaders(anonKey),
  })

  if (!response.ok) {
    throw new SupabaseClientError(
      `Supabase ${table} request failed (${response.status}).`,
    )
  }

  return (await response.json()) as T[]
}

/** Rows from ``report_summaries_cache`` for a quarter and origin SA3 label. */
export async function fetchReportSummaryRows(
  reportingQuarter: string,
  originSa3: string,
): Promise<ReportSummaryCacheRow[]> {
  return fetchSupabaseRows<ReportSummaryCacheRow>('report_summaries_cache', {
    select: '*',
    reporting_quarter: `eq.${reportingQuarter}`,
    origin_sa3: `eq.${originSa3}`,
  })
}

/** Chronological snapshot rows for an origin across all quarters. */
export async function fetchHistoricalSnapshotRows(
  originSa3: string,
): Promise<HistoricalCommuteSnapshotRow[]> {
  return fetchSupabaseRows<HistoricalCommuteSnapshotRow>('historical_commute_snapshots', {
    select: '*',
    origin_sa3: `eq.${originSa3}`,
    order: 'reporting_quarter.asc',
  })
}

/** All cached summary rows for a quarter and origin–destination corridor. */
export async function fetchCorridorSummaryRows(
  reportingQuarter: string,
  originSa3: string,
  destinationSa3: string,
): Promise<ReportSummaryCacheRow[]> {
  return fetchSupabaseRows<ReportSummaryCacheRow>('report_summaries_cache', {
    select: '*',
    reporting_quarter: `eq.${reportingQuarter}`,
    origin_sa3: `eq.${originSa3}`,
    destination_sa3: `eq.${destinationSa3}`,
  })
}

/** Every ``corridor_summary`` payload for a reporting quarter (leaderboard / metro rollups). */
export async function fetchMetroCorridorSummaries(
  reportingQuarter: string,
): Promise<ReportSummaryCacheRow[]> {
  return fetchSupabaseRows<ReportSummaryCacheRow>('report_summaries_cache', {
    select: '*',
    reporting_quarter: `eq.${reportingQuarter}`,
    summary_key: 'eq.corridor_summary',
    order: 'origin_sa3.asc',
  })
}
