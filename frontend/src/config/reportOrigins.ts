import { DEFAULT_ORIGIN_SA3 } from '../types/commuteReportStore'

/** Origin SA3 labels available in the report origin filter. */
export const ORIGIN_SA3_OPTIONS = [
  DEFAULT_ORIGIN_SA3,
  'Canterbury',
  'Penrith',
  'Blacktown',
  'Strathfield - Burwood - Ashfield',
  'Sydney Inner City',
  'Auburn',
  'Bankstown',
  'Parramatta',
] as const

export type OriginSa3Option = (typeof ORIGIN_SA3_OPTIONS)[number]
