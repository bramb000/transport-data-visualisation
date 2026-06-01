<script setup lang="ts">
import type { RushHourLeaderEntry } from '../types/commuteStory'

defineProps<{
  title: string
  rows: RushHourLeaderEntry[]
  barWidth: (entry: RushHourLeaderEntry) => string
  barRotation: (index: number) => string
}>()
</script>

<template>
  <div class="doodle-sketch-border bg-[#fffef8] p-4 rotate-[0.4deg]">
    <h3 class="doodle-label mb-4 normal-case">{{ title }}</h3>
    <ol class="space-y-4">
      <li v-for="(entry, index) in rows" :key="entry.sa3Name" class="list-none">
        <p class="doodle-annotation text-sm text-stone-800">{{ entry.annotation }}</p>
        <div class="mt-2 h-4 w-full border border-dashed border-stone-400 bg-[#f5f0e8]">
          <div
            class="doodle-marker-bar h-full"
            :class="barRotation(index)"
            :style="{ width: barWidth(entry) }"
            role="presentation"
            aria-hidden="true"
          />
        </div>
      </li>
    </ol>
  </div>
</template>
