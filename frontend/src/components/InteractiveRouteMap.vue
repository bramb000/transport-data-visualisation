<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteMap } from '../composables/useRouteMap'
import { EXPLORER_SA3_OPTIONS } from '../config/reportOrigins'
import { useCommuteDataStore } from '../stores/commuteDataStore'
import { DEFAULT_DESTINATION_SA3 } from '../types/commuteData'
import { loadSa3Centroids, type Sa3Centroid } from '../utils/sa3Centroids'
import { HTS_MODE_PUBLIC_TRANSPORT, HTS_MODE_VEHICLE_DRIVER } from '../types/supabaseTables'

const store = useCommuteDataStore()
const { routeSelection, routeMetrics, aggregationMode, isLoading } = storeToRefs(store)

const mapContainer = ref<HTMLElement | null>(null)
const centroids = ref<Map<string, Sa3Centroid>>(new Map())

const sa3Options = computed(() => EXPLORER_SA3_OPTIONS.filter((name) => centroids.value.has(name)))

const localOrigin = computed({
  get: () => routeSelection.value.origin ?? 'Canterbury',
  set: (value: string) => store.setRouteSelection({ ...routeSelection.value, origin: value }),
})

const localDestination = computed({
  get: () => routeSelection.value.destination ?? DEFAULT_DESTINATION_SA3,
  set: (value: string) =>
    store.setRouteSelection({ ...routeSelection.value, destination: value }),
})

const endpoints = computed(() => ({
  origin: centroids.value.get(localOrigin.value) ?? null,
  destination: centroids.value.get(localDestination.value) ?? null,
}))

const { mapError, isMapLoading } = useRouteMap(mapContainer, endpoints)

const periodLabel = computed(() => (aggregationMode.value === 'weekly' ? 'weekly' : 'daily'))

onMounted(async () => {
  centroids.value = await loadSa3Centroids()
})

</script>

<template>
  <div class="st-map-host relative">
    <div ref="mapContainer" class="h-full w-full min-h-screen" role="region" aria-label="Interactive route map" />

    <p v-if="isMapLoading" class="st-loading">Loading map…</p>
    <p v-if="mapError" class="st-loading text-st-danger">{{ mapError }}</p>

    <div class="st-panel">
      <div class="st-panel__inner">
        <p class="st-field-label">Origin</p>
        <select v-model="localOrigin" class="st-select" aria-label="Origin SA3">
          <option v-for="name in sa3Options" :key="`o-${name}`" :value="name">{{ name }}</option>
        </select>

        <p class="st-field-label mt-4">Destination</p>
        <select v-model="localDestination" class="st-select" aria-label="Destination SA3">
          <option v-for="name in sa3Options" :key="`d-${name}`" :value="name">{{ name }}</option>
        </select>

        <p class="st-field-label mt-6">Route</p>
        <p class="font-[family-name:var(--font-st-display)] text-2xl text-st-ink">
          {{ localOrigin }} → {{ localDestination }}
        </p>

        <div class="st-metric-row mt-6">
          <div>
            <p class="st-field-label">Rush hour</p>
            <p class="st-metric-block__value">{{ routeMetrics?.rushMinutes ?? '—' }} min</p>
          </div>
          <div>
            <p class="st-field-label">Off-peak</p>
            <p class="st-metric-block__value">{{ routeMetrics?.offPeakMinutes ?? '—' }} min</p>
          </div>
        </div>

        <div class="st-metric-row mt-4">
          <div>
            <p class="st-field-label">Public transport</p>
            <p class="st-metric-block__value">
              <template v-if="isLoading">…</template>
              <template v-else>${{ routeMetrics?.ptCostAud ?? '—' }}</template>
            </p>
            <p class="text-xs text-st-ink-muted">Opal · {{ periodLabel }}</p>
          </div>
          <div>
            <p class="st-field-label">Private car</p>
            <p class="st-metric-block__value">
              <template v-if="isLoading">…</template>
              <template v-else>${{ routeMetrics?.carCostAud ?? '—' }}</template>
            </p>
            <p class="text-xs text-st-ink-muted">Fuel + tolls · {{ periodLabel }}</p>
          </div>
        </div>

        <div class="st-table-wrap">
          <table class="st-table">
            <caption class="sr-only">Route mode comparison</caption>
            <thead>
              <tr>
                <th scope="col">Mode</th>
                <th scope="col">Time</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mode in routeMetrics?.modes ?? []" :key="mode.mode">
                <th scope="row">
                  {{
                    mode.mode === HTS_MODE_PUBLIC_TRANSPORT
                      ? 'PT'
                      : mode.mode === HTS_MODE_VEHICLE_DRIVER
                        ? 'Car'
                        : mode.mode
                  }}
                </th>
                <td>{{ mode.time_minutes ?? '—' }}</td>
                <td>{{ mode.weekly_cost_aud ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
