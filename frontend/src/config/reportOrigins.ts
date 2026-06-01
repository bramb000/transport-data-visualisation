import { CITY_WIDE_ORIGIN_SA3 } from '../types/commuteStory'

/** Origin SA3 labels available in the data story explorer. */
export const ORIGIN_SA3_OPTIONS = [
  CITY_WIDE_ORIGIN_SA3,
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

/** SA3 labels with map centroids (excludes metro rollup pseudo-origin). */
export const EXPLORER_SA3_OPTIONS = ORIGIN_SA3_OPTIONS.filter(
  (label) => label !== CITY_WIDE_ORIGIN_SA3,
)
