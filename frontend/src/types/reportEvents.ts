import type { TimeScale } from '../stores/commuteReportStore'

/** Emitted when any report filter control changes. */
export interface ReportFilterChangePayload {
  timeScale: TimeScale
  originSa3: string
}
