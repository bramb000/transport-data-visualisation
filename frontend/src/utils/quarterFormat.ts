/** UI quarter slugs (``2026-Q2``) vs ETL labels (``Q2 2026``). */

export const REPORT_QUARTER_OPTIONS = [
  '2023-Q1',
  '2023-Q2',
  '2023-Q3',
  '2023-Q4',
  '2024-Q1',
  '2024-Q2',
  '2024-Q3',
  '2024-Q4',
  '2025-Q1',
  '2025-Q2',
  '2025-Q3',
  '2025-Q4',
  '2026-Q1',
  '2026-Q2',
] as const

export type ReportQuarterSlug = (typeof REPORT_QUARTER_OPTIONS)[number]

const SLUG_PATTERN = /^(\d{4})-Q([1-4])$/
const REPORTING_PATTERN = /^Q([1-4])\s+(\d{4})$/

/** Convert ``2026-Q2`` → ``Q2 2026`` for Supabase ``reporting_quarter`` filters. */
export function quarterSlugToReportingQuarter(slug: ReportQuarterSlug | string): string {
  const match = SLUG_PATTERN.exec(slug.trim())
  if (!match) {
    throw new Error(`Invalid quarter slug '${slug}'. Expected format: 2026-Q2`)
  }
  return `Q${match[2]} ${match[1]}`
}

/** Convert ``Q2 2026`` → ``2026-Q2`` for UI selectors. */
export function reportingQuarterToSlug(reportingQuarter: string): ReportQuarterSlug | null {
  const match = REPORTING_PATTERN.exec(reportingQuarter.trim())
  if (!match) return null
  const slug = `${match[2]}-Q${match[1]}` as ReportQuarterSlug
  return REPORT_QUARTER_OPTIONS.includes(slug) ? slug : null
}

/** Chronological sort key for mixed quarter labels. */
export function reportingQuarterSortKey(reportingQuarter: string): number {
  const match = REPORTING_PATTERN.exec(reportingQuarter.trim())
  if (!match) return 0
  const quarter = Number(match[1])
  const year = Number(match[2])
  return year * 10 + quarter
}
