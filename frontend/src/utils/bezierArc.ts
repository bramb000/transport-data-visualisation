/** Quadratic-bezier arc between two WGS84 points for map overlays. */
export function buildBezierArc(
  start: [number, number],
  end: [number, number],
  steps = 48,
  bulgeDegrees = 0.12,
): [number, number][] {
  const midLng = (start[0] + end[0]) / 2
  const midLat = (start[1] + end[1]) / 2 + bulgeDegrees
  const control: [number, number] = [midLng, midLat]

  const line: [number, number][] = []
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const inv = 1 - t
    const lng = inv * inv * start[0] + 2 * inv * t * control[0] + t * t * end[0]
    const lat = inv * inv * start[1] + 2 * inv * t * control[1] + t * t * end[1]
    line.push([lng, lat])
  }

  return line
}
