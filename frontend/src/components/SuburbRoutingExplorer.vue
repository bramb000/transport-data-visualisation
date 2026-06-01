<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useStoryMap } from '../composables/useStoryMap'
import { EXPLORER_SA3_OPTIONS } from '../config/reportOrigins'
import { useCommuteStoryStore } from '../stores/commuteStoryStore'
import { DEFAULT_DESTINATION_SA3 } from '../types/commuteStory'
import { loadSa3Centroids, type Sa3Centroid } from '../utils/sa3Centroids'
import {
  HTS_MODE_PUBLIC_TRANSPORT,
  HTS_MODE_VEHICLE_DRIVER,
} from '../types/supabaseTables'

const story = useCommuteStoryStore()
const {
  activeRouteLabel,
  trafficComparison,
  routeSnapshot,
  ptModeCost,
  carModeCost,
  aggregationMode,
  hasRouteSelection,
  isLoading,
} = storeToRefs(story)

const mapContainer = ref<HTMLElement | null>(null)
const centroids = ref<Map<string, Sa3Centroid>>(new Map())
const panelOpen = ref(true)

const localOrigin = ref('Canterbury')
const localDestination = ref(DEFAULT_DESTINATION_SA3)

const sa3Options = computed(() =>
  EXPLORER_SA3_OPTIONS.filter((name) => centroids.value.has(name)),
)

const endpoints = computed(() => ({
  origin: centroids.value.get(localOrigin.value) ?? null,
  destination: centroids.value.get(localDestination.value) ?? null,
}))

const { mapError, isMapLoading } = useStoryMap(mapContainer, endpoints)

const routeSummary = computed(() => activeRouteLabel.value ?? 'Pick an origin and destination')

const costPeriodLabel = computed(() =>
  aggregationMode.value === 'weekly' ? 'per week' : 'per day',
)

const showMobilePanel = computed(() => panelOpen.value && hasRouteSelection.value)

onMounted(async () => {
  centroids.value = await loadSa3Centroids()
  story.setSelectedOrigin(localOrigin.value)
  story.setSelectedDestination(localDestination.value)
})

watch([localOrigin, localDestination], ([origin, destination]) => {
  story.setSelectedOrigin(origin)
  story.setSelectedDestination(destination)
  panelOpen.value = Boolean(origin && destination)
})
</script>

<template>
  <section class="tl-section" aria-labelledby="explorer-heading">
    <div>
      <h2 id="explorer-heading" class="tl-h2">A-to-B map explorer</h2>
      <p class="tl-body-muted mt-2 max-w-2xl">
        Select a corridor to trace the journey on the map and compare rush-hour travel with mode
        costs.
      </p>
    </div>

    <div class="tl-map-layout">
      <div class="tl-map-toolbar">
        <div class="tl-field">
          <label class="tl-label" for="origin-select">Origin</label>
          <select id="origin-select" v-model="localOrigin" class="tl-select">
            <option v-for="name in sa3Options" :key="`o-${name}`" :value="name">{{ name }}</option>
          </select>
        </div>
        <div class="tl-field">
          <label class="tl-label" for="destination-select">Destination</label>
          <select id="destination-select" v-model="localDestination" class="tl-select">
            <option v-for="name in sa3Options" :key="`d-${name}`" :value="name">{{ name }}</option>
          </select>
        </div>
      </div>

      <div class="tl-map-layout__main">
        <div class="tl-map-frame">
          <div
            ref="mapContainer"
            class="tl-map-canvas"
            role="region"
            :aria-label="`Commute map from ${localOrigin} to ${localDestination}`"
            :aria-busy="isMapLoading"
            aria-live="polite"
          />

          <div v-if="isMapLoading" class="tl-map-loading" role="status">
            <p class="tl-label normal-case">Loading map…</p>
          </div>

          <p v-if="mapError" class="tl-alert absolute bottom-4 left-4 right-4 z-10" role="alert">
            {{ mapError }}
          </p>
        </div>

        <button
          type="button"
          class="tl-btn-ghost mb-3 md:hidden"
          :aria-expanded="showMobilePanel"
          aria-controls="route-detail-panel"
          @click="panelOpen = !panelOpen"
        >
          {{ showMobilePanel ? 'Hide' : 'Show' }} route details
        </button>

        <aside
          id="route-detail-panel"
          class="tl-detail-panel tl-detail-panel--drawer"
          :class="{ 'tl-detail-panel--closed': !showMobilePanel }"
          :aria-hidden="!hasRouteSelection"
        >
          <p class="tl-kicker">Corridor</p>
          <h3 class="tl-h2 mt-1">{{ routeSummary }}</h3>

          <div class="tl-comparison-grid mt-6" role="group" aria-label="Rush hour comparison">
            <div class="tl-comparison-tile">
              <p class="tl-label">Rush hour</p>
              <p class="tl-metric-sm mt-2">
                {{ trafficComparison.rushMinutes ?? '—' }}
                <span class="tl-body text-lg"> min</span>
              </p>
              <p class="tl-body-muted mt-1 text-xs">Driving</p>
            </div>
            <div class="tl-comparison-tile">
              <p class="tl-label">Off-peak</p>
              <p class="tl-metric-sm mt-2">
                {{ trafficComparison.offPeakMinutes ?? '—' }}
                <span class="tl-body text-lg"> min</span>
              </p>
              <p class="tl-body-muted mt-1 text-xs">Driving</p>
            </div>
          </div>

          <p
            v-if="trafficComparison.penaltyMinutes"
            class="tl-body mt-4 text-sm"
            aria-live="polite"
          >
            Peak penalty:
            <strong class="text-tl-warning">+{{ trafficComparison.penaltyMinutes }} min</strong>
            vs off-peak
          </p>

          <div class="mt-6 grid gap-4 sm:grid-cols-2" role="group" aria-label="Mode cost comparison">
            <div class="tl-stat-card tl-stat-card--accent py-4">
              <p class="tl-label">Public transport</p>
              <p class="tl-metric-sm mt-2">
                <template v-if="isLoading">…</template>
                <template v-else-if="ptModeCost !== null">${{ ptModeCost }}</template>
                <template v-else>—</template>
              </p>
              <p class="tl-body-muted mt-1 text-xs">Opal · {{ costPeriodLabel }}</p>
            </div>
            <div class="tl-stat-card tl-stat-card--secondary py-4">
              <p class="tl-label">Private car</p>
              <p class="tl-metric-sm mt-2">
                <template v-if="isLoading">…</template>
                <template v-else-if="carModeCost !== null">${{ carModeCost }}</template>
                <template v-else>—</template>
              </p>
              <p class="tl-body-muted mt-1 text-xs">Fuel + tolls · {{ costPeriodLabel }}</p>
            </div>
          </div>

          <div class="tl-table-wrap mt-6">
            <table class="tl-table text-xs" aria-labelledby="route-table-caption">
              <caption id="route-table-caption" class="tl-label">Route comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Time (min)</th>
                  <th scope="col">Cost ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="mode in routeSnapshot?.modes ?? []" :key="mode.mode">
                  <th scope="row">
                    {{
                      mode.mode === HTS_MODE_PUBLIC_TRANSPORT
                        ? 'Public transport'
                        : mode.mode === HTS_MODE_VEHICLE_DRIVER
                          ? 'Private car'
                          : mode.mode
                    }}
                  </th>
                  <td class="tabular-nums">{{ mode.time_minutes ?? '—' }}</td>
                  <td class="tabular-nums">{{ mode.weekly_cost_aud ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>
