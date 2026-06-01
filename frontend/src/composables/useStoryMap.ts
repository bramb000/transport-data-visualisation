import type { GeoJSONSource, Map, StyleSpecification } from 'maplibre-gl'
import { onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import { storyDesign } from '../config/designTokens'
import { loadMapLibre } from '../lib/maplibreLoader'
import { buildBezierArc } from '../utils/bezierArc'
import type { Sa3Centroid } from '../utils/sa3Centroids'

const ARC_SOURCE_ID = 'story-arc'
const ARC_LAYER_ID = 'story-arc-line'
const ORIGIN_LAYER_ID = 'story-origin-point'
const DEST_LAYER_ID = 'story-dest-point'

const PAPER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-paper',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -1,
        'raster-contrast': 0.15,
        'raster-brightness-min': 0.05,
        'raster-brightness-max': 0.95,
      },
    },
  ],
}

function mapTilerStyle(): StyleSpecification | string {
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()
  if (!key) return PAPER_STYLE
  return `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`
}

interface RouteEndpoints {
  origin: Sa3Centroid | null
  destination: Sa3Centroid | null
}

export function useStoryMap(
  containerRef: Ref<HTMLElement | null>,
  endpoints: Ref<RouteEndpoints>,
) {
  const map = shallowRef<Map | null>(null)
  const mapError = ref<string | null>(null)
  const isMapLoading = ref(true)

  function upsertArc(maplibregl: Awaited<ReturnType<typeof loadMapLibre>>) {
    const instance = map.value
    const { origin, destination } = endpoints.value
    if (!instance) return

    if (!origin || !destination) {
      if (instance.getSource(ARC_SOURCE_ID)) {
        ;(instance.getSource(ARC_SOURCE_ID) as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        })
      }
      return
    }

    const arcCoordinates = buildBezierArc(
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    )

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { role: 'arc' },
          geometry: { type: 'LineString' as const, coordinates: arcCoordinates },
        },
        {
          type: 'Feature' as const,
          properties: { role: 'origin' },
          geometry: { type: 'Point' as const, coordinates: [origin.lng, origin.lat] },
        },
        {
          type: 'Feature' as const,
          properties: { role: 'destination' },
          geometry: {
            type: 'Point' as const,
            coordinates: [destination.lng, destination.lat],
          },
        },
      ],
    }

    if (!instance.getSource(ARC_SOURCE_ID)) {
      instance.addSource(ARC_SOURCE_ID, { type: 'geojson', data: featureCollection })
      instance.addLayer({
        id: ARC_LAYER_ID,
        type: 'line',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'arc'],
        paint: {
          'line-color': storyDesign.colors.secondary,
          'line-width': 3.5,
          'line-dasharray': [1.5, 1.2],
        },
      })
      instance.addLayer({
        id: ORIGIN_LAYER_ID,
        type: 'circle',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'origin'],
        paint: {
          'circle-radius': 7,
          'circle-color': storyDesign.colors.primary,
          'circle-stroke-color': storyDesign.colors.secondary,
          'circle-stroke-width': 2,
        },
      })
      instance.addLayer({
        id: DEST_LAYER_ID,
        type: 'circle',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'destination'],
        paint: {
          'circle-radius': 7,
          'circle-color': storyDesign.colors.secondary,
          'circle-stroke-color': storyDesign.colors.text,
          'circle-stroke-width': 2,
        },
      })
    } else {
      ;(instance.getSource(ARC_SOURCE_ID) as GeoJSONSource).setData(featureCollection)
    }

    const bounds = new maplibregl.LngLatBounds()
    bounds.extend([origin.lng, origin.lat])
    bounds.extend([destination.lng, destination.lat])
    instance.fitBounds(bounds, { padding: 72, maxZoom: 11, duration: 700 })
  }

  onMounted(() => {
    if (!containerRef.value) {
      isMapLoading.value = false
      return
    }

    void (async () => {
      try {
        const maplibregl = await loadMapLibre()

        map.value = new maplibregl.Map({
          container: containerRef.value!,
          style: mapTilerStyle(),
          center: [151.05, -33.87],
          zoom: 9.4,
          attributionControl: {},
        })

        map.value.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

        map.value.on('load', () => {
          upsertArc(maplibregl)
          isMapLoading.value = false
        })
      } catch (error) {
        mapError.value =
          error instanceof Error ? error.message : 'Unable to initialise the map explorer.'
        isMapLoading.value = false
      }
    })()
  })

  watch(endpoints, async () => {
    const instance = map.value
    if (!instance) return

    const maplibregl = await loadMapLibre()

    if (instance.isStyleLoaded()) {
      upsertArc(maplibregl)
      return
    }

    instance.once('load', () => upsertArc(maplibregl))
  })

  onUnmounted(() => {
    map.value?.remove()
    map.value = null
  })

  return { map, mapError, isMapLoading }
}
