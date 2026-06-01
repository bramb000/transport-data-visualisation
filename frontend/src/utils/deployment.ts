/** True when a non-local FastAPI backend URL is configured for this build. */
export function isBackendApiConfigured(): boolean {
  return getApiBaseUrl() !== null
}

/** Resolved API base URL, or null when the static Vercel deploy should not call FastAPI. */
export function getApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!configured) {
    return import.meta.env.DEV ? 'http://localhost:8000' : null
  }

  if (
    import.meta.env.PROD &&
    (configured.includes('localhost') || configured.includes('127.0.0.1'))
  ) {
    return null
  }

  return configured.replace(/\/$/, '')
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
      import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
  )
}
