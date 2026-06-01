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
  <div class="story-sketch-border bg-story-surface p-4 rotate-[0.4deg]">
    <h3 class="story-label mb-4 normal-case">{{ title }}</h3>
    <ol class="space-y-4">
      <li v-for="(entry, index) in rows" :key="entry.sa3Name" class="list-none">
        <p class="story-annotation text-sm text-story-text">{{ entry.annotation }}</p>
        <div class="mt-2 h-4 w-full border border-dashed border-stone-400 bg-story-accent-surface">
          <div
            class="story-marker-bar h-full"
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
