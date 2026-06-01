<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
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

function setMode(mode: AggregationMode) {
  if (mode !== aggregationMode.value) story.setAggregationMode(mode)
}
</script>

<template>
  <section class="relative" aria-labelledby="scorecards-heading">
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 id="scorecards-heading" class="story-display text-3xl rotate-1">
        Citywide averages
      </h2>

      <div
        class="story-toggle-track flex w-fit items-center gap-1 p-1"
        role="group"
        aria-label="Daily or weekly aggregation"
      >
        <button
          type="button"
          class="story-toggle-knob"
          :class="{ 'story-toggle-knob--on': aggregationMode === 'daily' }"
          :aria-pressed="aggregationMode === 'daily'"
          @click="setMode('daily')"
        >
          Daily
        </button>
        <button
          type="button"
          class="story-toggle-knob -rotate-1"
          :class="{ 'story-toggle-knob--on': aggregationMode === 'weekly' }"
          :aria-pressed="aggregationMode === 'weekly'"
          @click="setMode('weekly')"
        >
          Weekly
        </button>
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <article
        class="story-card -rotate-2 md:-translate-y-1"
        aria-labelledby="score-time-label"
        :aria-busy="isLoading || timeAnimating"
      >
        <p id="score-time-label" class="story-label">Average commute time</p>
        <p class="story-metric mt-3" aria-live="polite">
          <template v-if="isLoading && displayTime === null">…</template>
          <template v-else-if="displayTime !== null">{{ displayTime }} min</template>
          <template v-else>—</template>
        </p>
        <p class="mt-2 text-xs text-stone-600">Metro mean · PT &amp; driving</p>
      </article>

      <article
        class="story-card rotate-2 bg-story-secondary-surface md:translate-y-2"
        aria-labelledby="score-cost-label"
        :aria-busy="isLoading || costAnimating"
      >
        <p id="score-cost-label" class="story-label">Average commute cost</p>
        <p class="story-metric mt-3" aria-live="polite">
          <template v-if="isLoading && displayCost === null">…</template>
          <template v-else-if="displayCost !== null">${{ displayCost }}</template>
          <template v-else>—</template>
        </p>
        <p class="mt-2 text-xs text-stone-600">Opal vs car · {{ costPeriodLabel }}</p>
      </article>
    </div>

    <table class="story-table mt-8 w-full max-w-lg" aria-labelledby="scorecards-table-caption">
      <caption id="scorecards-table-caption" class="story-label mb-2 text-left">
        Scorecard data table
      </caption>
      <thead>
        <tr>
          <th scope="col" class="story-th">Metric</th>
          <th scope="col" class="story-th">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" class="story-td">Average time</th>
          <td class="story-td tabular-nums">
            {{ displayTime !== null ? `${displayTime} min` : '—' }}
          </td>
        </tr>
        <tr>
          <th scope="row" class="story-td">Average cost</th>
          <td class="story-td tabular-nums">
            {{ displayCost !== null ? `$${displayCost}` : '—' }}
          </td>
        </tr>
        <tr>
          <th scope="row" class="story-td">Window</th>
          <td class="story-td">{{ aggregationMode }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
