<script setup lang="ts">
import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type Map } from 'maplibre-gl'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommuteMapStore } from '../stores/commuteMapStore'
import type {
  ChoroplethMetric,
  FlowCorridor,
  MapVisualizationMode,
  Sa3BoundaryProperties,
  TimelineQuarter,
} from '../types/commuteReport'
import { formatCurrency, formatMinutes } from '../utils/formatters'

/** Static asset — not streamed from the database. */
const SA3_GEOJSON_URL = '/data/sydney_sa3_boundaries.geojson'

const SOURCE_BOUNDARIES = 'sa3-boundaries'
const SOURCE_FLOW_ARCS = 'sa3-flow-arcs'
const LAYER_CHOROPLETH_FILL = 'sa3-choropleth-fill'
const LAYER_CHOROPLETH_LINE = 'sa3-choropleth-line'
const LAYER_FLOW_ARCS = 'sa3-flow-arcs'

const COLOR_NEUTRAL_LOW = '#e2e8f0'
const COLOR_NEGATIVE_HIGH = '#dc2626'
const COLOR_TRANSIT_DESERT = '#991b1b'
const COLOR_FLOW_DEFAULT = '#2563eb'

const SYDNEY_BOUNDS: maplibregl.LngLatBoundsLike = [
  [150.55, -34.05],
  [151.35, -33.65],
]

const reportStore = useCommuteMapStore()
const {
  mapMode,
  choroplethMetric,
  activeTimeline,
  fixedDestinationSa3,
  selectedOriginSa3Code,
  isDataLoading,
  activeRegionMetrics,
  activeFlowCorridors,
  accessibilityTableRows,
  accessibilityTableKey,
} = storeToRefs(reportStore)

const mapContainer = ref<HTMLElement | null>(null)
const mapInstance = shallowRef<Map | null>(null)
const popupRef = shallowRef<maplibregl.Popup | null>(null)

const isGeoJsonLoaded = ref(false)
const isMapReady = ref(false)
const geoJsonLoadError = ref<string | null>(null)
const baseGeoJson = shallowRef<GeoJSON.FeatureCollection | null>(null)

const isMobile = ref(false)
const mobileSheetOpen = ref(false)
const mobileSheetPayload = ref<{ sa3_name: string; avg_cost_to_cbd: number; avg_time_delta_min: number } | null>(null)

const hoveredSa3Code = ref<string | null>(null)

const isMapBlocked = computed(() => isDataLoading.value || !isGeoJsonLoaded.value || !isMapReady.value)

const timelineOptions: TimelineQuarter[] = ['Q4 2023', 'Q1 2024', 'Q2 2024', 'Q3 2024']

const choroplethMetricProperty = computed(() =>
  choroplethMetric.value === 'time_penalty' ? 'time_penalty' : 'financial_cost',
)

const showFlowLayer = computed(() => mapMode.value === 'flow')
const showChoroplethLayer = computed(() => mapMode.value === 'choropleth')

function resolveMapTilerStyleUrl(): string {
  const key = import.meta.env.VITE_MAPTILER_API_KEY
  if (!key) {
    console.warn('VITE_MAPTILER_API_KEY missing — falling back to MapLibre demo tiles.')
    return 'https://demotiles.maplibre.org/style.json'
  }
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`
}

function choroplethColorExpression(metricProperty: string): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', metricProperty], 0],
    0,
    COLOR_NEUTRAL_LOW,
    0.45,
    '#fecaca',
    0.75,
    '#f87171',
    1,
    COLOR_NEGATIVE_HIGH,
  ]
}

function enrichGeoJsonWithMetrics(
  collection: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const metrics = activeRegionMetrics.value
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature) => {
      const props = feature.properties as Sa3BoundaryProperties | null
      const code = props?.sa3_code ?? ''
      const metricRow = metrics[code]
      return {
        ...feature,
        properties: {
          ...props,
          time_penalty: metricRow?.time_penalty ?? 0,
          financial_cost: metricRow?.financial_cost ?? 0,
          avg_cost_to_cbd: metricRow?.avg_cost_to_cbd ?? 0,
          avg_time_delta_min: metricRow?.avg_time_delta_min ?? 0,
        },
      }
    }),
  }
}

function featureCentroid(feature: GeoJSON.Feature): [number, number] {
  if (feature.geometry.type !== 'Polygon') return [151.2, -33.87]
  const ring = feature.geometry.coordinates[0] ?? []
  if (!ring.length) return [151.2, -33.87]
  const lngs = ring.map((coord) => coord[0] ?? 0)
  const lats = ring.map((coord) => coord[1] ?? 0)
  return [
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ]
}

function buildArcCoordinates(
  origin: [number, number],
  destination: [number, number],
): [number, number][] {
  const midLng = (origin[0] + destination[0]) / 2
  const midLat = (origin[1] + destination[1]) / 2
  const lift = 0.04
  const control: [number, number] = [midLng, midLat + lift]
  const points: [number, number][] = []
  for (let step = 0; step <= 24; step += 1) {
    const t = step / 24
    const u = 1 - t
    points.push([
      u * u * origin[0] + 2 * u * t * control[0] + t * t * destination[0],
      u * u * origin[1] + 2 * u * t * control[1] + t * t * destination[1],
    ])
  }
  return points
}

function isTransitDesert(corridor: FlowCorridor): boolean {
  return corridor.pt_minutes > corridor.driving_minutes * 2
}

function buildFlowArcCollection(
  originCode: string,
  corridors: FlowCorridor[],
  boundaryCollection: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const originFeature = boundaryCollection.features.find(
    (feature) => (feature.properties as Sa3BoundaryProperties | null)?.sa3_code === originCode,
  )
  if (!originFeature) {
    return { type: 'FeatureCollection', features: [] }
  }

  const originCentroid = featureCentroid(originFeature)
  const topFive = [...corridors]
    .sort((a, b) => b.commuter_volume - a.commuter_volume)
    .slice(0, 5)

  return {
    type: 'FeatureCollection',
    features: topFive.map((corridor) => {
      const destinationFeature = boundaryCollection.features.find(
        (feature) =>
          (feature.properties as Sa3BoundaryProperties | null)?.sa3_code ===
          corridor.destination_sa3_code,
      )
      const destinationCentroid = destinationFeature
        ? featureCentroid(destinationFeature)
        : originCentroid
      return {
        type: 'Feature',
        properties: {
          destination_sa3_name: corridor.destination_sa3_name,
          commuter_volume: corridor.commuter_volume,
          is_transit_desert: isTransitDesert(corridor),
        },
        geometry: {
          type: 'LineString',
          coordinates: buildArcCoordinates(originCentroid, destinationCentroid),
        },
      }
    }),
  }
}

async function loadSa3GeoJson(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(SA3_GEOJSON_URL)
  if (!response.ok) {
    throw new Error(`Failed to load SA3 boundaries (${response.status})`)
  }
  return (await response.json()) as GeoJSON.FeatureCollection
}

function applyBoundarySourceData(map: Map) {
  if (!baseGeoJson.value) return
  const source = map.getSource(SOURCE_BOUNDARIES) as GeoJSONSource | undefined
  if (!source) return
  source.setData(enrichGeoJsonWithMetrics(baseGeoJson.value))
}

function applyFlowArcSourceData(map: Map) {
  const source = map.getSource(SOURCE_FLOW_ARCS) as GeoJSONSource | undefined
  if (!source || !baseGeoJson.value) return

  if (!selectedOriginSa3Code.value || mapMode.value !== 'flow') {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }

  source.setData(
    buildFlowArcCollection(
      selectedOriginSa3Code.value,
      activeFlowCorridors.value,
      baseGeoJson.value,
    ),
  )
}

function refreshMapVisualState() {
  const map = mapInstance.value
  if (!map || !isMapReady.value) return

  applyBoundarySourceData(map)
  applyFlowArcSourceData(map)

  const metricProperty = choroplethMetricProperty.value
  map.setPaintProperty(LAYER_CHOROPLETH_FILL, 'fill-color', choroplethColorExpression(metricProperty))
  map.setPaintProperty(
    LAYER_CHOROPLETH_FILL,
    'fill-opacity',
    showChoroplethLayer.value
      ? ['case', ['boolean', ['feature-state', 'dimmed'], false], 0.15, 0.72]
      : 0.08,
  )
  map.setLayoutProperty(LAYER_FLOW_ARCS, 'visibility', showFlowLayer.value ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_CHOROPLETH_FILL, 'visibility', 'visible')
}

function setHoverFeatureState(map: Map, sa3Code: string | null) {
  if (hoveredSa3Code.value) {
    map.setFeatureState(
      { source: SOURCE_BOUNDARIES, id: hoveredSa3Code.value },
      { hover: false },
    )
  }
  hoveredSa3Code.value = sa3Code
  if (sa3Code) {
    map.setFeatureState({ source: SOURCE_BOUNDARIES, id: sa3Code }, { hover: true })
  }
}

function updateDimmedFeatureStates(map: Map) {
  if (!baseGeoJson.value) return
  for (const feature of baseGeoJson.value.features) {
    const code = (feature.properties as Sa3BoundaryProperties | null)?.sa3_code
    if (!code || feature.id === undefined) continue
    const dimmed =
      mapMode.value === 'flow' &&
      !!selectedOriginSa3Code.value &&
      selectedOriginSa3Code.value !== code
    map.setFeatureState({ source: SOURCE_BOUNDARIES, id: feature.id }, { dimmed })
  }
}

function buildPopupHtml(sa3Name: string, avgCost: number, avgTimeDelta: number): string {
  return `
    <div class="text-sm">
      <p class="font-semibold text-slate-900">${sa3Name}</p>
      <p class="mt-1 text-slate-600">Avg cost to CBD: <strong>${formatCurrency(avgCost)}</strong></p>
      <p class="text-slate-600">Avg time delta: <strong>${formatMinutes(avgTimeDelta)}</strong></p>
    </div>
  `
}

function bindMapInteractionHandlers(map: Map) {
  popupRef.value = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'commute-map-popup',
    offset: 12,
  })

  map.on('mousemove', LAYER_CHOROPLETH_FILL, (event) => {
    if (isMapBlocked.value) return
    map.getCanvas().style.cursor = 'pointer'
    const feature = event.features?.[0]
    if (!feature?.id) return

    const props = feature.properties as Record<string, unknown>
    const sa3Code = String(props.sa3_code ?? '')
    setHoverFeatureState(map, sa3Code)

    const payload = {
      sa3_name: String(props.sa3_name ?? 'Unknown SA3'),
      avg_cost_to_cbd: Number(props.avg_cost_to_cbd ?? 0),
      avg_time_delta_min: Number(props.avg_time_delta_min ?? 0),
    }

    if (isMobile.value) return

    popupRef.value
      ?.setLngLat(event.lngLat)
      .setHTML(
        buildPopupHtml(payload.sa3_name, payload.avg_cost_to_cbd, payload.avg_time_delta_min),
      )
      .addTo(map)
  })

  map.on('mouseleave', LAYER_CHOROPLETH_FILL, () => {
    map.getCanvas().style.cursor = ''
    setHoverFeatureState(map, null)
    popupRef.value?.remove()
  })

  map.on('click', LAYER_CHOROPLETH_FILL, (event) => {
    if (isMapBlocked.value) return
    const feature = event.features?.[0]
    if (!feature?.id) return

    const props = feature.properties as Record<string, unknown>
    const sa3Code = String(props.sa3_code ?? '')
    reportStore.selectOriginSa3(sa3Code)

    const sa3Name = String(props.sa3_name ?? 'Unknown SA3')
    const avgCost = Number(props.avg_cost_to_cbd ?? 0)
    const avgTimeDelta = Number(props.avg_time_delta_min ?? 0)

    if (isMobile.value) {
      mobileSheetPayload.value = {
        sa3_name: sa3Name,
        avg_cost_to_cbd: avgCost,
        avg_time_delta_min: avgTimeDelta,
      }
      mobileSheetOpen.value = true
    }

    const bounds = new maplibregl.LngLatBounds()
    if (feature.geometry.type === 'Polygon') {
      for (const coord of feature.geometry.coordinates[0] ?? []) {
        bounds.extend(coord as [number, number])
      }
    }

    map.flyTo({
      center: bounds.getCenter(),
      zoom: Math.max(map.getZoom(), 10.5),
      speed: 0.85,
      padding: { top: 80, bottom: isMobile.value ? 180 : 80, left: 48, right: 48 },
    })

    updateDimmedFeatureStates(map)
    applyFlowArcSourceData(map)
  })
}

function initializeMapLayers(map: Map) {
  if (!baseGeoJson.value) return

  const enriched = enrichGeoJsonWithMetrics(baseGeoJson.value)
  enriched.features.forEach((feature, index) => {
    feature.id = (feature.properties as Sa3BoundaryProperties | null)?.sa3_code ?? String(index)
  })

  map.addSource(SOURCE_BOUNDARIES, {
    type: 'geojson',
    data: enriched,
  })

  map.addSource(SOURCE_FLOW_ARCS, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: LAYER_CHOROPLETH_FILL,
    type: 'fill',
    source: SOURCE_BOUNDARIES,
    paint: {
      'fill-color': choroplethColorExpression(choroplethMetricProperty.value),
      'fill-opacity': [
        'case',
        ['==', ['get', 'sa3_code'], selectedOriginSa3Code.value ?? ''],
        0.92,
        ['case', ['boolean', ['feature-state', 'dimmed'], false], 0.15, 0.72],
      ],
    },
  })

  map.addLayer({
    id: LAYER_CHOROPLETH_LINE,
    type: 'line',
    source: SOURCE_BOUNDARIES,
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#0f172a',
        '#64748b',
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2.8,
        ['==', ['get', 'sa3_code'], selectedOriginSa3Code.value ?? ''],
        2.4,
        0.8,
      ],
    },
  })

  map.addLayer({
    id: LAYER_FLOW_ARCS,
    type: 'line',
    source: SOURCE_FLOW_ARCS,
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'case',
        ['boolean', ['get', 'is_transit_desert'], false],
        COLOR_TRANSIT_DESERT,
        COLOR_FLOW_DEFAULT,
      ],
      'line-width': [
        'interpolate',
        ['linear'],
        ['get', 'commuter_volume'],
        1000,
        1.5,
        20000,
        8,
      ],
      'line-opacity': 0.88,
    },
  })

  bindMapInteractionHandlers(map)
  refreshMapVisualState()
}

async function bootstrapMap() {
  if (!mapContainer.value) return

  const map = new maplibregl.Map({
    container: mapContainer.value,
    style: resolveMapTilerStyleUrl(),
    bounds: SYDNEY_BOUNDS,
    fitBoundsOptions: { padding: 40 },
    attributionControl: {},
  })

  mapInstance.value = map

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  applyScrollZoomPolicy(map)

  map.on('load', () => {
    initializeMapLayers(map)
    isMapReady.value = true
    refreshMapVisualState()
  })
}

function applyScrollZoomPolicy(map: Map) {
  if (isMobile.value) {
    map.scrollZoom.disable()
  } else {
    map.scrollZoom.enable()
  }
}

function evaluateMobileViewport() {
  isMobile.value = window.matchMedia('(max-width: 767px)').matches
  if (mapInstance.value) {
    applyScrollZoomPolicy(mapInstance.value)
  }
  if (!isMobile.value) {
    mobileSheetOpen.value = false
  }
}

function handleSkipToGrid() {
  document.getElementById('commute-data-grid')?.focus()
}

function setMode(mode: MapVisualizationMode) {
  reportStore.setMapMode(mode)
}

function setMetric(metric: ChoroplethMetric) {
  reportStore.setChoroplethMetric(metric)
}

function setTimeline(quarter: TimelineQuarter) {
  reportStore.setActiveTimeline(quarter)
}

onMounted(async () => {
  evaluateMobileViewport()
  window.addEventListener('resize', evaluateMobileViewport)

  try {
    baseGeoJson.value = await loadSa3GeoJson()
    isGeoJsonLoaded.value = true
    await bootstrapMap()
  } catch (error) {
    geoJsonLoadError.value = error instanceof Error ? error.message : 'Unable to load SA3 boundaries.'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', evaluateMobileViewport)
  popupRef.value?.remove()
  mapInstance.value?.remove()
  mapInstance.value = null
})

watch([mapMode, choroplethMetric, activeTimeline, activeRegionMetrics, selectedOriginSa3Code], () => {
  refreshMapVisualState()
  if (mapInstance.value) {
    updateDimmedFeatureStates(mapInstance.value)
  }
})

watch(activeFlowCorridors, () => {
  if (mapInstance.value) {
    applyFlowArcSourceData(mapInstance.value)
  }
})
</script>

<template>
  <section
    class="relative h-[min(72vh,720px)] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"
    aria-label="Sydney commute affordability map"
  >
    <button
      type="button"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow"
      @click="handleSkipToGrid"
    >
      Skip interactive map and jump to data grid
    </button>

    <div
      ref="mapContainer"
      class="absolute inset-0"
      role="application"
      aria-label="Interactive choropleth and flow map of Sydney SA3 regions"
    />

    <div
      v-if="isMapBlocked"
      class="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm"
      aria-live="polite"
    >
      <div class="space-y-3 px-6 text-center">
        <div class="mx-auto h-10 w-10 animate-pulse rounded-full bg-slate-300" />
        <p class="text-sm font-medium text-slate-700">
          {{ geoJsonLoadError ?? 'Loading Sydney SA3 boundaries and commute metrics…' }}
        </p>
      </div>
    </div>

    <div
      class="absolute left-4 top-4 z-10 w-[min(100%,320px)] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Map mode</p>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium transition"
          :class="
            mapMode === 'choropleth'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
          @click="setMode('choropleth')"
        >
          Origin affordability
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium transition"
          :class="
            mapMode === 'flow'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
          @click="setMode('flow')"
        >
          Deserts &amp; corridors
        </button>
      </div>

      <template v-if="mapMode === 'choropleth'">
        <p class="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Destination · {{ fixedDestinationSa3 }}
        </p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-medium transition"
            :class="
              choroplethMetric === 'time_penalty'
                ? 'bg-teal-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
            @click="setMetric('time_penalty')"
          >
            Time penalty
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-medium transition"
            :class="
              choroplethMetric === 'financial_cost'
                ? 'bg-teal-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            "
            @click="setMetric('financial_cost')"
          >
            Financial cost
          </button>
        </div>
      </template>

      <template v-else>
        <p class="mt-4 text-xs text-slate-600">
          Click an SA3 to anchor outbound work corridors. Line weight scales with HTS commuter
          volume; desert routes highlight when PT takes more than 2× driving time.
        </p>
      </template>

      <label class="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Timeline
        <select
          class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          :value="activeTimeline"
          @change="setTimeline(($event.target as HTMLSelectElement).value as TimelineQuarter)"
        >
          <option v-for="quarter in timelineOptions" :key="quarter" :value="quarter">
            {{ quarter }}
          </option>
        </select>
      </label>
    </div>

    <div
      v-if="isMobile && mobileSheetOpen && mobileSheetPayload"
      class="absolute inset-x-0 bottom-0 z-30 translate-y-0 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-transform duration-300"
      role="dialog"
      aria-modal="true"
      :aria-label="`Details for ${mobileSheetPayload.sa3_name}`"
    >
      <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
      <p class="text-base font-semibold text-slate-900">{{ mobileSheetPayload.sa3_name }}</p>
      <p class="mt-2 text-sm text-slate-600">
        Avg cost to CBD:
        <strong>{{ formatCurrency(mobileSheetPayload.avg_cost_to_cbd) }}</strong>
      </p>
      <p class="text-sm text-slate-600">
        Avg time delta:
        <strong>{{ formatMinutes(mobileSheetPayload.avg_time_delta_min) }}</strong>
      </p>
      <button
        type="button"
        class="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        @click="mobileSheetOpen = false"
      >
        Close
      </button>
    </div>

    <table
      :key="accessibilityTableKey"
      id="commute-data-grid"
      tabindex="-1"
      class="sr-only"
      aria-live="polite"
      aria-label="Sydney SA3 commute affordability data grid"
    >
      <caption>
        Commute affordability by SA3 for {{ fixedDestinationSa3 }} during {{ activeTimeline }} —
        {{ choroplethMetric === 'time_penalty' ? 'time penalty' : 'financial cost' }} view
      </caption>
      <thead>
        <tr>
          <th scope="col">SA3 code</th>
          <th scope="col">SA3 name</th>
          <th scope="col">Average cost to CBD</th>
          <th scope="col">Average time delta</th>
          <th scope="col">Time penalty index</th>
          <th scope="col">Financial cost index</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in accessibilityTableRows" :key="row.sa3_code">
          <td>{{ row.sa3_code }}</td>
          <td>{{ row.sa3_name }}</td>
          <td>{{ formatCurrency(row.avg_cost_to_cbd) }}</td>
          <td>{{ formatMinutes(row.avg_time_delta_min) }}</td>
          <td>{{ row.time_penalty.toFixed(2) }}</td>
          <td>{{ row.financial_cost.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
:global(.commute-map-popup .maplibregl-popup-content) {
  padding: 0.75rem 0.9rem;
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgb(15 23 42 / 0.12);
}
</style>
