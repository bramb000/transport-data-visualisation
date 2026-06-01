<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import RushHourLeaderboardPanel from './RushHourLeaderboardPanel.vue'
import { useCommuteStoryStore } from '../stores/commuteStoryStore'
import type { RushHourLeaderEntry } from '../types/commuteStory'

const story = useCommuteStoryStore()
const { rushHourLeaveLeaderboard, rushHourArriveLeaderboard } = storeToRefs(story)

const mobileSlide = ref(0)

const topLeave = computed(() => rushHourLeaveLeaderboard.value.slice(0, 5))
const topArrive = computed(() => rushHourArriveLeaderboard.value.slice(0, 5))

const maxPenalty = computed(() => {
  const values = [...topLeave.value, ...topArrive.value].map((row) => row.penaltyMinutes)
  return Math.max(...values, 1)
})

function barWidth(entry: RushHourLeaderEntry): string {
  const ratio = Math.min(100, Math.round((entry.penaltyMinutes / maxPenalty.value) * 100))
  const wobble = 4 + (entry.penaltyMinutes % 5)
  return `${Math.max(ratio - wobble, 18)}%`
}

function barRotation(index: number): string {
  const rotations = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2', '-rotate-1']
  return rotations[index % rotations.length] ?? 'rotate-1'
}

const carouselPanels = computed(() => [
  {
    id: 'leave',
    title: 'Worst suburbs to leave from (morning peak)',
    rows: topLeave.value,
  },
  { id: 'arrive', title: 'Worst suburbs to arrive to', rows: topArrive.value },
])
</script>

<template>
  <section aria-labelledby="rush-hour-heading">
    <h2 id="rush-hour-heading" class="doodle-display mb-2 text-3xl -rotate-1">
      Rush-hour deviation
    </h2>
    <p class="mb-6 max-w-2xl text-sm text-stone-600">
      Hand-drawn penalty bars show how many extra minutes driving costs at peak versus off-peak.
    </p>

    <div class="hidden gap-8 md:grid md:grid-cols-2">
      <RushHourLeaderboardPanel
        v-for="panel in carouselPanels"
        :key="panel.id"
        :title="panel.title"
        :rows="panel.rows"
        :bar-width="barWidth"
        :bar-rotation="barRotation"
      />
    </div>

    <div class="md:hidden" role="region" aria-label="Rush hour leaderboards carousel">
      <div class="relative min-h-[280px]">
        <RushHourLeaderboardPanel
          v-for="(panel, index) in carouselPanels"
          v-show="mobileSlide === index"
          :key="`${panel.id}-mobile`"
          class="doodle-carousel-slide"
          :title="panel.title"
          :rows="panel.rows"
          :bar-width="barWidth"
          :bar-rotation="barRotation"
        />
      </div>
      <div class="mt-3 flex justify-center gap-2" role="tablist" aria-label="Leaderboard slides">
        <button
          v-for="(panel, index) in carouselPanels"
          :key="`dot-${panel.id}`"
          type="button"
          class="doodle-carousel-dot"
          :class="{ 'doodle-carousel-dot--active': mobileSlide === index }"
          :aria-selected="mobileSlide === index"
          role="tab"
          @click="mobileSlide = index"
        >
          <span class="sr-only">{{ panel.title }}</span>
        </button>
      </div>
    </div>

    <table class="doodle-table mt-8 w-full" aria-labelledby="rush-table-caption">
      <caption id="rush-table-caption" class="doodle-label mb-2 text-left">
        Rush-hour penalty data (accessible fallback)
      </caption>
      <thead>
        <tr>
          <th scope="col" class="doodle-th">List</th>
          <th scope="col" class="doodle-th">Suburb</th>
          <th scope="col" class="doodle-th">Peak penalty (min)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in topLeave" :key="`leave-${entry.sa3Name}`">
          <th scope="row" class="doodle-td">Leave from</th>
          <td class="doodle-td">{{ entry.sa3Name }}</td>
          <td class="doodle-td tabular-nums">{{ entry.penaltyMinutes }}</td>
        </tr>
        <tr v-for="entry in topArrive" :key="`arrive-${entry.sa3Name}`">
          <th scope="row" class="doodle-td">Arrive to</th>
          <td class="doodle-td">{{ entry.sa3Name }}</td>
          <td class="doodle-td tabular-nums">{{ entry.penaltyMinutes }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
