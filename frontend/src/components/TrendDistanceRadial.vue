<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { TREND_DISTANCE_OPTIONS_KM, type TrendDistanceFilterKm } from '../types/commuteData'
import { useCommuteDataStore } from '../stores/commuteDataStore'

const store = useCommuteDataStore()
const { trendDistanceKm } = storeToRefs(store)

/** Arc positions (degrees) for the four distance tiers — right-hand semicircle. */
const tierLayout: { km: TrendDistanceFilterKm; angleDeg: number }[] = [
  { km: 50, angleDeg: -72 },
  { km: 30, angleDeg: -24 },
  { km: 20, angleDeg: 24 },
  { km: 10, angleDeg: 72 },
]

function selectDistance(km: TrendDistanceFilterKm) {
  store.setTrendDistanceKm(km)
}
</script>

<template>
  <fieldset class="st-trend-radial" aria-label="Filter trends by commute distance">
    <legend class="st-trend-radial__legend">Distance</legend>
    <p class="st-trend-radial__hint">Up to</p>

    <div class="st-trend-radial__compact" role="group" aria-label="Maximum distance">
      <button
        v-for="km in TREND_DISTANCE_OPTIONS_KM"
        :key="`compact-${km}`"
        type="button"
        class="st-trend-radial__compact-btn"
        :class="{ 'st-trend-radial__compact-btn--active': trendDistanceKm === km }"
        :aria-pressed="trendDistanceKm === km"
        @click="selectDistance(km)"
      >
        {{ km }} km
      </button>
    </div>

    <div class="st-trend-radial__arc" role="presentation">
      <svg class="st-trend-radial__guide" viewBox="0 0 120 120" aria-hidden="true">
        <path
          d="M 18 102 A 84 84 0 0 1 102 102"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          opacity="0.25"
        />
      </svg>
      <button
        v-for="tier in tierLayout"
        :key="tier.km"
        type="button"
        class="st-trend-radial__node"
        :class="{ 'st-trend-radial__node--active': trendDistanceKm === tier.km }"
        :style="{ '--st-radial-angle': `${tier.angleDeg}deg` }"
        :aria-pressed="trendDistanceKm === tier.km"
        @click="selectDistance(tier.km)"
      >
        <span class="st-trend-radial__value">{{ tier.km }}</span>
        <span class="st-trend-radial__unit">km</span>
      </button>
    </div>
    <p class="st-trend-radial__active" aria-live="polite">
      ≤ {{ trendDistanceKm }} km corridors
    </p>
    <ul class="sr-only">
      <li v-for="km in TREND_DISTANCE_OPTIONS_KM" :key="km">
        <button type="button" @click="selectDistance(km)">{{ km }} km maximum distance</button>
      </li>
    </ul>
  </fieldset>
</template>
