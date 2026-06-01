interface Sa3FeatureCollection {
  features: Array<{
    properties?: { sa3_code?: string; sa3_name?: string }
    geometry?: { type: string; coordinates: number[][][] }
  }>
}

export interface Sa3Centroid {
  sa3Code: string
  sa3Name: string
  lng: number
  lat: number
}

function centroidFromPolygon(coordinates: number[][][]): [number, number] {
  const ring = coordinates[0] ?? []
  if (!ring.length) return [151.2, -33.87]

  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of ring) {
    sumLng += lng
    sumLat += lat
  }

  return [sumLng / ring.length, sumLat / ring.length]
}

/** Load SA3 centroids from bundled GeoJSON (simplified metro polygons). */
export async function loadSa3Centroids(): Promise<Map<string, Sa3Centroid>> {
  const response = await fetch('/data/sydney_sa3_boundaries.geojson')
  const collection = (await response.json()) as Sa3FeatureCollection

  const lookup = new Map<string, Sa3Centroid>()

  for (const feature of collection.features) {
    const sa3Name = feature.properties?.sa3_name
    const sa3Code = feature.properties?.sa3_code
    if (!sa3Name || !sa3Code || feature.geometry?.type !== 'Polygon') continue

    const [lng, lat] = centroidFromPolygon(feature.geometry.coordinates)
    lookup.set(sa3Name, { sa3Code, sa3Name, lng, lat })
  }

  return lookup
}
