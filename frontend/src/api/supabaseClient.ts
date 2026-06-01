import { isSupabaseConfigured } from '../utils/deployment'

export class SupabaseClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseClientError'
  }
}

function requireSupabaseConfig(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new SupabaseClientError('Supabase environment variables are not configured.')
  }

  return { url: url.replace(/\/$/, ''), anonKey }
}

/** Lightweight REST ping — confirms Supabase is reachable with the anon key. */
export async function fetchSupabaseHealth(): Promise<{ status: string; rowCount: number }> {
  if (!isSupabaseConfigured()) {
    throw new SupabaseClientError('Supabase is not configured for this deployment.')
  }

  const { url, anonKey } = requireSupabaseConfig()
  const response = await fetch(
    `${url}/rest/v1/commute_metrics?select=id&limit=1`,
    {
      headers: {
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
  )

  if (!response.ok) {
    throw new SupabaseClientError(`Supabase request failed (${response.status}).`)
  }

  const rows = (await response.json()) as unknown[]
  return { status: 'ok', rowCount: rows.length }
}
