<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AverageCommuteScorecards from '../components/AverageCommuteScorecards.vue'
import MapExplorerSkeleton from '../components/MapExplorerSkeleton.vue'
import RushHourDeviation from '../components/RushHourDeviation.vue'
import { useDeferredMount } from '../composables/useDeferredMount'
import { useCommuteStoryStore } from '../stores/commuteStoryStore'
import type { TrafficState } from '../stores/commuteStoryStore'

const SuburbRoutingExplorer = defineAsyncComponent({
  loader: () => import('../components/SuburbRoutingExplorer.vue'),
  loadingComponent: MapExplorerSkeleton,
  delay: 120,
})

const story = useCommuteStoryStore()
const { loadError } = storeToRefs(story)

const explorerSectionRef = ref<HTMLElement | null>(null)
const { isReady: explorerReady } = useDeferredMount(explorerSectionRef)

function onTrafficChange(state: TrafficState) {
  story.setTrafficState(state)
}
</script>

<template>
  <div class="doodle-paper min-h-screen text-doodle-text">
    <a href="#story-main" class="doodle-skip-link">Skip to story content</a>

    <header
      class="doodle-sketch-border mx-3 mt-4 -rotate-1 bg-doodle-surface px-6 py-5 md:mx-8 md:mt-8"
      role="banner"
    >
      <p class="doodle-kicker mb-1 rotate-2">Sydney commute affordability</p>
      <h1 class="doodle-display max-w-3xl text-4xl leading-none md:text-5xl">
        The gridlock notebook
      </h1>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-doodle-secondary/80 md:text-base">
        A hand-sketched data story comparing public transport and private car commutes across
        Greater Sydney.
      </p>

      <fieldset class="mt-5">
        <legend class="doodle-label mb-2">Traffic profile (story-wide)</legend>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="doodle-chip rotate-1"
            :class="{ 'doodle-chip--active': story.trafficState === 'rush_hour' }"
            :aria-pressed="story.trafficState === 'rush_hour'"
            @click="onTrafficChange('rush_hour')"
          >
            Rush hour
          </button>
          <button
            type="button"
            class="doodle-chip"
            :class="{ 'doodle-chip--active': story.trafficState === 'off_peak' }"
            :aria-pressed="story.trafficState === 'off_peak'"
            @click="onTrafficChange('off_peak')"
          >
            Off-peak
          </button>
        </div>
      </fieldset>
    </header>

    <div
      v-if="loadError"
      class="doodle-alert mx-3 mt-4 md:mx-8"
      role="alert"
      aria-live="assertive"
    >
      {{ loadError }}
    </div>

    <main id="story-main" class="mx-3 mt-10 space-y-16 pb-16 md:mx-8" role="main">
      <AverageCommuteScorecards />
      <RushHourDeviation />

      <div ref="explorerSectionRef">
        <SuburbRoutingExplorer v-if="explorerReady" />
        <MapExplorerSkeleton v-else message="Map explorer loads when you scroll here…" />
      </div>
    </main>

    <footer
      class="doodle-sketch-border mx-3 mb-6 bg-[#f5f0e8] px-4 py-3 text-xs text-doodle-secondary/70 md:mx-8"
      role="contentinfo"
    >
      Pre-calculated aggregates from Supabase · Q2 2026 reporting quarter
    </footer>
  </div>
</template>
