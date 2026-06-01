<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import StorySegmentedControl from './ui/StorySegmentedControl.vue'
import { useTallyAnimation } from '../composables/useTallyAnimation'
import { useCommuteStoryStore } from '../stores/commuteStoryStore'
import type { AggregationMode } from '../stores/commuteStoryStore'

const story = useCommuteStoryStore()
const { aggregationMode, cityAverages, isLoading } = storeToRefs(story)

const averageTimeTarget = computed(() => cityAverages.value.averageTimeMinutes)
const averageCostTarget = computed(() => cityAverages.value.averageCostAud)

const { displayValue: displayTime, isAnimating: timeAnimating } =
  useTallyAnimation(averageTimeTarget)
const { displayValue: displayCost, isAnimating: costAnimating } =
  useTallyAnimation(averageCostTarget)

const costPeriodLabel = computed(() =>
  aggregationMode.value === 'weekly' ? 'per week' : 'per day',
)

const windowOptions = [
  { value: 'daily' as AggregationMode, label: 'Daily' },
  { value: 'weekly' as AggregationMode, label: 'Weekly' },
]
</script>

<template>
  <section class="tl-section" aria-labelledby="scorecards-heading">
    <div class="tl-section-header">
      <div>
        <h2 id="scorecards-heading" class="tl-h2">Citywide averages</h2>
        <p class="tl-body-muted mt-2">Metro-level time and cost across Greater Sydney.</p>
      </div>
      <StorySegmentedControl
        v-model="aggregationMode"
        :options="windowOptions"
        group-label="Daily or weekly aggregation"
      />
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <article
        class="tl-stat-card"
        aria-labelledby="score-time-label"
        :aria-busy="isLoading || timeAnimating"
      >
        <p id="score-time-label" class="tl-label">Average commute time</p>
        <p class="tl-metric mt-4" aria-live="polite">
          <template v-if="isLoading && displayTime === null">…</template>
          <template v-else-if="displayTime !== null">{{ displayTime }} min</template>
          <template v-else>—</template>
        </p>
        <p class="tl-body-muted mt-2 text-sm">Metro mean · public transport &amp; driving</p>
      </article>

      <article
        class="tl-stat-card tl-stat-card--secondary"
        aria-labelledby="score-cost-label"
        :aria-busy="isLoading || costAnimating"
      >
        <p id="score-cost-label" class="tl-label">Average commute cost</p>
        <p class="tl-metric mt-4" aria-live="polite">
          <template v-if="isLoading && displayCost === null">…</template>
          <template v-else-if="displayCost !== null">${{ displayCost }}</template>
          <template v-else>—</template>
        </p>
        <p class="tl-body-muted mt-2 text-sm">Opal vs car · {{ costPeriodLabel }}</p>
      </article>
    </div>

    <div class="tl-table-wrap max-w-lg">
      <table class="tl-table" aria-labelledby="scorecards-table-caption">
        <caption id="scorecards-table-caption" class="tl-label">
          Scorecard data table
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Average time</th>
            <td class="tabular-nums">
              {{ displayTime !== null ? `${displayTime} min` : '—' }}
            </td>
          </tr>
          <tr>
            <th scope="row">Average cost</th>
            <td class="tabular-nums">
              {{ displayCost !== null ? `$${displayCost}` : '—' }}
            </td>
          </tr>
          <tr>
            <th scope="row">Window</th>
            <td>{{ aggregationMode }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
