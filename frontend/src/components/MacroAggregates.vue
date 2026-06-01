<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCommuteDataStore } from '../stores/commuteDataStore'
import type { AggregationMode } from '../types/commuteData'

const store = useCommuteDataStore()
const { macroAverages, aggregationMode, isLoading } = storeToRefs(store)

const modes: { value: AggregationMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]
</script>

<template>
  <div class="st-chart-host flex flex-col items-center justify-center px-6" aria-live="polite">
    <div class="st-segment mb-12">
      <button
        v-for="mode in modes"
        :key="mode.value"
        type="button"
        class="st-segment__btn"
        :class="{ 'st-segment__btn--active': aggregationMode === mode.value }"
        :aria-pressed="aggregationMode === mode.value"
        @click="store.setAggregationMode(mode.value)"
      >
        {{ mode.label }}
      </button>
    </div>

    <div class="grid w-full max-w-5xl gap-16 md:grid-cols-2 md:gap-8">
      <div class="text-center">
        <p class="st-macro-value">
          <template v-if="isLoading">—</template>
          <template v-else-if="macroAverages.averageTimeMinutes !== null">
            {{ macroAverages.averageTimeMinutes }}
          </template>
          <template v-else>—</template>
        </p>
        <p class="st-macro-label">Average time (min)</p>
      </div>
      <div class="text-center">
        <p class="st-macro-value">
          <template v-if="isLoading">—</template>
          <template v-else-if="macroAverages.averageCostAud !== null">
            ${{ macroAverages.averageCostAud }}
          </template>
          <template v-else>—</template>
        </p>
        <p class="st-macro-label">
          Average cost ({{ aggregationMode === 'weekly' ? 'weekly' : 'daily' }})
        </p>
      </div>
    </div>
  </div>
</template>
