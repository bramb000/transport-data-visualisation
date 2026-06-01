<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AverageCommuteScorecards from '../components/AverageCommuteScorecards.vue'
import MapExplorerSkeleton from '../components/MapExplorerSkeleton.vue'
import RushHourDeviation from '../components/RushHourDeviation.vue'
import StorySegmentedControl from '../components/ui/StorySegmentedControl.vue'
import { useDeferredMount } from '../composables/useDeferredMount'
import { useCommuteStoryStore } from '../stores/commuteStoryStore'
import type { TrafficState } from '../stores/commuteStoryStore'

const SuburbRoutingExplorer = defineAsyncComponent({
  loader: () => import('../components/SuburbRoutingExplorer.vue'),
  loadingComponent: MapExplorerSkeleton,
  delay: 120,
})

const story = useCommuteStoryStore()
const { loadError, trafficState } = storeToRefs(story)

const explorerSectionRef = ref<HTMLElement | null>(null)
const { isReady: explorerReady } = useDeferredMount(explorerSectionRef)

const trafficOptions = [
  { value: 'rush_hour' as TrafficState, label: 'Rush hour' },
  { value: 'off_peak' as TrafficState, label: 'Off-peak' },
]
</script>

<template>
  <div class="tl-page">
    <a href="#story-main" class="tl-skip-link">Skip to story content</a>

    <header class="tl-site-header" role="banner">
      <div class="tl-container py-8 md:py-12">
        <p class="tl-kicker mb-2">Sydney commute affordability</p>
        <h1 class="tl-h1 max-w-3xl">Your commute story</h1>
        <p class="tl-body-muted mt-4 max-w-2xl">
          A narrative journey through time and cost — comparing public transport and private car
          commutes across Greater Sydney.
        </p>

        <div class="mt-6">
          <p class="tl-label mb-2">Traffic profile</p>
          <StorySegmentedControl
            v-model="trafficState"
            :options="trafficOptions"
            group-label="Traffic profile for citywide averages"
          />
        </div>
      </div>
    </header>

    <div v-if="loadError" class="tl-container py-4" role="alert" aria-live="assertive">
      <p class="tl-alert">{{ loadError }}</p>
    </div>

    <main id="story-main" class="tl-container space-y-16 py-12 md:py-16" role="main">
      <AverageCommuteScorecards />
      <RushHourDeviation />

      <div ref="explorerSectionRef">
        <SuburbRoutingExplorer v-if="explorerReady" />
        <MapExplorerSkeleton v-else message="Map explorer loads when you scroll here…" />
      </div>
    </main>

    <footer class="tl-site-footer" role="contentinfo">
      <div class="tl-container">
        Pre-calculated aggregates from Supabase · Q2 2026 reporting quarter
      </div>
    </footer>
  </div>
</template>
