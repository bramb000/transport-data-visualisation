export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatMinutes(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} min`
}

export function formatDistanceKm(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} km`
}
