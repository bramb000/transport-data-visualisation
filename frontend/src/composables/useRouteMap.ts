import type { GeoJSONSource, Map, StyleSpecification } from 'maplibre-gl'
import { nextTick, onMounted, onUnmounted, shallowRef, watch, type Ref } from 'vue'
import { loadMapLibre } from '../lib/maplibreLoader'
import { buildBezierArc } from '../utils/bezierArc'
import type { Sa3Centroid } from '../utils/sa3Centroids'

const ARC_SOURCE_ID = 'route-arc'
const ARC_GLOW_LAYER = 'route-arc-glow'
const ARC_LINE_LAYER = 'route-arc-line'
const ORIGIN_LAYER = 'route-origin'
const DEST_LAYER = 'route-dest'
const MIN_MAP_PX = 48

const DARK_BASE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'basemap-dark',
      type: 'raster',
      source: 'basemap',
      paint: {
        'raster-saturation': -1,
        'raster-brightness-min': 0,
        'raster-brightness-max': 0.35,
        'raster-contrast': 0.2,
      },
    },
  ],
}

function basemapStyle(): StyleSpecification | string {
  const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim()
  if (key) return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`
  return DARK_BASE
}

interface RouteEndpoints {
  origin: Sa3Centroid | null
  destination: Sa3Centroid | null
}

export function useRouteMap(containerRef: Ref<HTMLElement | null>, endpoints: Ref<RouteEndpoints>) {
  const map = shallowRef<Map | null>(null)
  const mapError = shallowRef<string | null>(null)
  const isMapLoading = shallowRef(true)
  let resizeObserver: ResizeObserver | null = null
  let maplibreglModule: Awaited<ReturnType<typeof loadMapLibre>> | null = null

  function updateArc() {
    const instance = map.value
    const maplibregl = maplibreglModule
    const { origin, destination } = endpoints.value
    if (!instance || !maplibregl) return

    if (!origin || !destination) {
      const source = instance.getSource(ARC_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const coordinates = buildBezierArc(
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
      56,
      0.14,
    )
    const data = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { role: 'arc' },
          geometry: { type: 'LineString' as const, coordinates },
        },
        {
          type: 'Feature' as const,
          properties: { role: 'origin' },
          geometry: { type: 'Point' as const, coordinates: [origin.lng, origin.lat] },
        },
        {
          type: 'Feature' as const,
          properties: { role: 'destination' },
          geometry: { type: 'Point' as const, coordinates: [destination.lng, destination.lat] },
        },
      ],
    }

    if (!instance.getSource(ARC_SOURCE_ID)) {
      instance.addSource(ARC_SOURCE_ID, { type: 'geojson', data })
      instance.addLayer({
        id: ARC_GLOW_LAYER,
        type: 'line',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'arc'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 10,
          'line-opacity': 0.35,
          'line-blur': 4,
        },
      })
      instance.addLayer({
        id: ARC_LINE_LAYER,
        type: 'line',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'arc'],
        paint: {
          'line-color': '#93c5fd',
          'line-width': 3,
        },
      })
      instance.addLayer({
        id: ORIGIN_LAYER,
        type: 'circle',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'origin'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#3b82f6',
          'circle-stroke-color': '#fafafa',
          'circle-stroke-width': 2,
        },
      })
      instance.addLayer({
        id: DEST_LAYER,
        type: 'circle',
        source: ARC_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'destination'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#8b5cf6',
          'circle-stroke-color': '#fafafa',
          'circle-stroke-width': 2,
        },
      })
    } else {
      ;(instance.getSource(ARC_SOURCE_ID) as GeoJSONSource).setData(data)
    }

    const bounds = new maplibregl.LngLatBounds()
    bounds.extend([origin.lng, origin.lat])
    bounds.extend([destination.lng, destination.lat])
    instance.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: 800 })
  }

  async function ensureMap() {
    const container = containerRef.value
    if (!container || map.value) return

    const { width, height } = container.getBoundingClientRect()
    if (width < MIN_MAP_PX || height < MIN_MAP_PX) return

    try {
      maplibreglModule = await loadMapLibre()
      map.value = new maplibreglModule.Map({
        container,
        style: basemapStyle(),
        center: [151.05, -33.87],
        zoom: 9.2,
        attributionControl: {},
        cooperativeGestures: true,
      })

      map.value.on('load', () => {
        updateArc()
        isMapLoading.value = false
      })
    } catch (error) {
      mapError.value = error instanceof Error ? error.message : 'Map failed to load.'
      isMapLoading.value = false
    }
  }

  function handleContainerResize() {
    if (!map.value) {
      void ensureMap()
      return
    }
    map.value.resize()
    if (map.value.isStyleLoaded()) updateArc()
  }

  onMounted(async () => {
    await nextTick()
    const container = containerRef.value
    if (!container) {
      isMapLoading.value = false
      return
    }

    resizeObserver = new ResizeObserver(() => handleContainerResize())
    resizeObserver.observe(container)
    window.addEventListener('resize', handleContainerResize)
    await ensureMap()
  })

  watch(endpoints, () => {
    if (!map.value?.isStyleLoaded()) return
    updateArc()
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleContainerResize)
    map.value?.remove()
    map.value = null
    maplibreglModule = null
  })

  return { map, mapError, isMapLoading }
}
