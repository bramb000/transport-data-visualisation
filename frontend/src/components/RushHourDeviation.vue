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
  const ratio = Math.round((entry.penaltyMinutes / maxPenalty.value) * 100)
  return `${Math.min(100, Math.max(8, ratio))}%`
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
  <section class="tl-section" aria-labelledby="rush-hour-heading">
    <div>
      <h2 id="rush-hour-heading" class="tl-h2">Rush-hour deviation</h2>
      <p class="tl-body-muted mt-2 max-w-2xl">
        Extra driving minutes at peak compared with off-peak — ranked by suburb.
      </p>
    </div>

    <div class="hidden gap-8 md:grid md:grid-cols-2">
      <RushHourLeaderboardPanel
        v-for="panel in carouselPanels"
        :key="panel.id"
        :title="panel.title"
        :rows="panel.rows"
        :bar-width="barWidth"
      />
    </div>

    <div class="md:hidden" role="region" aria-label="Rush hour leaderboards">
      <div class="relative min-h-[280px]">
        <RushHourLeaderboardPanel
          v-for="(panel, index) in carouselPanels"
          v-show="mobileSlide === index"
          :key="`${panel.id}-mobile`"
          :title="panel.title"
          :rows="panel.rows"
          :bar-width="barWidth"
        />
      </div>
      <div class="tl-carousel-dots" role="tablist" aria-label="Leaderboard slides">
        <button
          v-for="(panel, index) in carouselPanels"
          :key="`dot-${panel.id}`"
          type="button"
          class="tl-carousel-dot"
          :class="{ 'tl-carousel-dot--active': mobileSlide === index }"
          :aria-selected="mobileSlide === index"
          role="tab"
          @click="mobileSlide = index"
        >
          <span class="sr-only">{{ panel.title }}</span>
        </button>
      </div>
    </div>

    <div class="tl-table-wrap">
      <table class="tl-table" aria-labelledby="rush-table-caption">
        <caption id="rush-table-caption" class="tl-label">
          Rush-hour penalty data
        </caption>
        <thead>
          <tr>
            <th scope="col">List</th>
            <th scope="col">Suburb</th>
            <th scope="col">Peak penalty (min)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in topLeave" :key="`leave-${entry.sa3Name}`">
            <th scope="row">Leave from</th>
            <td>{{ entry.sa3Name }}</td>
            <td class="tabular-nums">{{ entry.penaltyMinutes }}</td>
          </tr>
          <tr v-for="entry in topArrive" :key="`arrive-${entry.sa3Name}`">
            <th scope="row">Arrive to</th>
            <td>{{ entry.sa3Name }}</td>
            <td class="tabular-nums">{{ entry.penaltyMinutes }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
