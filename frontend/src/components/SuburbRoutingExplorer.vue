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
const notebookOpen = ref(false)

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

onMounted(async () => {
  centroids.value = await loadSa3Centroids()
  story.setSelectedOrigin(localOrigin.value)
  story.setSelectedDestination(localDestination.value)
  notebookOpen.value = true
})

watch([localOrigin, localDestination], ([origin, destination]) => {
  story.setSelectedOrigin(origin)
  story.setSelectedDestination(destination)
  notebookOpen.value = Boolean(origin && destination)
})

function toggleNotebook() {
  notebookOpen.value = !notebookOpen.value
}
</script>

<template>
  <section aria-labelledby="explorer-heading" class="relative">
    <h2 id="explorer-heading" class="story-display mb-2 text-3xl rotate-1">
      A-to-B map explorer
    </h2>
    <p class="mb-4 max-w-2xl text-sm text-stone-600">
      Trace a rough arc between SA3 centroids and open the notebook for rush-hour and cost
      comparisons.
    </p>

    <div class="story-map-controls mb-3 flex flex-col gap-2 md:hidden">
      <div class="story-polaroid story-polaroid--origin -rotate-2 relative">
        <label class="story-label block" for="origin-select-mobile">Origin</label>
        <select
          id="origin-select-mobile"
          v-model="localOrigin"
          class="story-select mt-1 w-full"
        >
          <option v-for="name in sa3Options" :key="`om-${name}`" :value="name">{{ name }}</option>
        </select>
      </div>
      <div class="story-polaroid story-polaroid--dest rotate-2 relative">
        <label class="story-label block" for="destination-select-mobile">Destination</label>
        <select
          id="destination-select-mobile"
          v-model="localDestination"
          class="story-select mt-1 w-full"
        >
          <option v-for="name in sa3Options" :key="`dm-${name}`" :value="name">{{ name }}</option>
        </select>
      </div>
    </div>

    <div class="story-map-shell relative">
      <div class="story-polaroid story-polaroid--origin -rotate-2 hidden md:block">
        <label class="story-label block" for="origin-select">Origin</label>
        <select id="origin-select" v-model="localOrigin" class="story-select mt-1 w-full">
          <option v-for="name in sa3Options" :key="`o-${name}`" :value="name">
            {{ name }}
          </option>
        </select>
      </div>

      <div class="story-polaroid story-polaroid--dest rotate-2 hidden md:block">
        <label class="story-label block" for="destination-select">Destination</label>
        <select id="destination-select" v-model="localDestination" class="story-select mt-1 w-full">
          <option v-for="name in sa3Options" :key="`d-${name}`" :value="name">{{ name }}</option>
        </select>
      </div>

      <div
        ref="mapContainer"
        class="story-map-canvas h-[min(68vh,520px)] w-full"
        role="region"
        :aria-label="`Commute map from ${localOrigin} to ${localDestination}`"
        :aria-busy="isMapLoading"
        aria-live="polite"
      />

      <p
        v-if="isMapLoading"
        class="story-label pointer-events-none absolute inset-0 flex items-center justify-center bg-story-canvas/60 normal-case"
        role="status"
      >
        Loading map…
      </p>

      <p v-if="mapError" class="story-alert absolute bottom-4 left-4 right-4 z-10" role="alert">
        {{ mapError }}
      </p>

      <button
        type="button"
        class="story-notebook-tab md:hidden"
        :aria-expanded="notebookOpen"
        aria-controls="route-notebook"
        @click="toggleNotebook"
      >
        {{ notebookOpen ? 'Hide' : 'Open' }} notebook
      </button>

      <aside
        id="route-notebook"
        class="story-notebook"
        :class="{ 'story-notebook--open': notebookOpen && hasRouteSelection }"
        :aria-hidden="!notebookOpen || !hasRouteSelection"
      >
        <div class="story-notebook-inner">
          <p class="story-kicker">Corridor notes</p>
          <h3 class="story-display text-2xl">{{ routeSummary }}</h3>

          <div class="mt-4 grid grid-cols-2 gap-3" role="group" aria-label="Rush hour comparison">
            <div class="story-sketch-border bg-story-surface p-3 -rotate-1">
              <p class="story-label">Rush hour</p>
              <p class="story-metric text-3xl">
                {{ trafficComparison.rushMinutes ?? '—' }}
                <span class="text-lg">min</span>
              </p>
              <p class="text-xs text-stone-600">Driving</p>
            </div>
            <div class="story-sketch-border bg-story-surface p-3 rotate-1">
              <p class="story-label">Non-rush</p>
              <p class="story-metric text-3xl">
                {{ trafficComparison.offPeakMinutes ?? '—' }}
                <span class="text-lg">min</span>
              </p>
              <p class="text-xs text-stone-600">Driving</p>
            </div>
          </div>

          <p
            v-if="trafficComparison.penaltyMinutes"
            class="story-annotation mt-3 text-sm"
            aria-live="polite"
          >
            Peak penalty: +{{ trafficComparison.penaltyMinutes }} mins vs off-peak
          </p>

          <div
            class="mt-5 grid grid-cols-2 gap-3"
            role="group"
            aria-label="Mode cost comparison"
          >
            <div class="story-card bg-story-accent-surface -rotate-1 py-4">
              <p class="story-label">Public transport</p>
              <p class="story-metric text-3xl">
                <template v-if="isLoading">…</template>
                <template v-else-if="ptModeCost !== null">${{ ptModeCost }}</template>
                <template v-else>—</template>
              </p>
              <p class="text-xs text-stone-600">Opal · {{ costPeriodLabel }}</p>
            </div>
            <div class="story-card bg-story-secondary-surface rotate-1 py-4">
              <p class="story-label">Private car</p>
              <p class="story-metric text-3xl">
                <template v-if="isLoading">…</template>
                <template v-else-if="carModeCost !== null">${{ carModeCost }}</template>
                <template v-else>—</template>
              </p>
              <p class="text-xs text-stone-600">Fuel + tolls · {{ costPeriodLabel }}</p>
            </div>
          </div>

          <table class="story-table mt-5 w-full text-xs" aria-labelledby="notebook-table-caption">
            <caption id="notebook-table-caption" class="story-label mb-2 text-left">
              Route comparison table
            </caption>
            <thead>
              <tr>
                <th scope="col" class="story-th">Mode</th>
                <th scope="col" class="story-th">Time (min)</th>
                <th scope="col" class="story-th">Cost ($)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="mode in routeSnapshot?.modes ?? []"
                :key="mode.mode"
              >
                <th scope="row" class="story-td">
                  {{
                    mode.mode === HTS_MODE_PUBLIC_TRANSPORT
                      ? 'Public transport'
                      : mode.mode === HTS_MODE_VEHICLE_DRIVER
                        ? 'Private car'
                        : mode.mode
                  }}
                </th>
                <td class="story-td tabular-nums">{{ mode.time_minutes ?? '—' }}</td>
                <td class="story-td tabular-nums">{{ mode.weekly_cost_aud ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  </section>
</template>
