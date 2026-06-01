<script setup lang="ts">
import type { RushHourLeaderEntry } from '../types/commuteStory'

defineProps<{
  title: string
  rows: RushHourLeaderEntry[]
  barWidth: (entry: RushHourLeaderEntry) => string
}>()
</script>

<template>
  <div class="tl-panel">
    <h3 class="tl-h2 text-xl">{{ title }}</h3>
    <ol class="mt-6 space-y-5">
      <li v-for="entry in rows" :key="entry.sa3Name" class="tl-rank-row list-none">
        <p class="tl-rank-copy">{{ entry.annotation }}</p>
        <div class="tl-progress-track" role="presentation" aria-hidden="true">
          <div class="tl-progress-fill" :style="{ width: barWidth(entry) }" />
        </div>
      </li>
    </ol>
  </div>
</template>
