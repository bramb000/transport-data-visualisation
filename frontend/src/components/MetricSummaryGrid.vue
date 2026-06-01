<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommuteReportStore } from '../stores/commuteReportStore'
import type { TimeScale } from '../stores/commuteReportStore'
import { formatCurrency, formatMinutes } from '../utils/formatters'
import { HTS_MODE_VEHICLE_DRIVER } from '../types/supabaseTables'

type AnimatedNumberish = number | null

const reportStore = useCommuteReportStore()
const {
  timeScale,
  reportingQuarter,
  ptCostAud,
  carCostAud,
  weeklyCostDeltaAud,
  ptMinutes,
  drivingMinutes,
  tollSubsidyAud,
  historicalTrendData,
  isLoading,
} = storeToRefs(reportStore)

function parseReportingYear(label: string): number | null {
  const match = /^Q[1-4]\s+(\d{4})$/.exec(label.trim())
  return match ? Number(match[1]) : null
}

const isWeekly = computed(() => timeScale.value === 'weekly')
const reportYear = computed(() => parseReportingYear(reportingQuarter.value))
const tollCapActive = computed(
  () => isWeekly.value && (reportYear.value ?? 0) >= 2024 && (tollSubsidyAud.value ?? 0) > 0,
)

function hoursPerWeekFromMinutesDelta(deltaMin: AnimatedNumberish, scale: TimeScale): number | null {
  if (deltaMin === null) return null
  const weeklyDeltaMinutes = scale === 'weekly' ? deltaMin : deltaMin * 5
  return weeklyDeltaMinutes / 60
}

function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function useAnimatedNumber(source: () => AnimatedNumberish, durationMs = 420) {
  const value = ref<AnimatedNumberish>(source())
  let rafId: number | null = null

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function animate(next: AnimatedNumberish) {
    stop()
    const prev = value.value
    if (next === null || prev === null) {
      value.value = next
      return
    }

    const start = performance.now()
    const from = prev
    const to = next
    const delta = to - from

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      value.value = from + delta * eased
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        rafId = null
        value.value = to
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  watch(
    () => source(),
    (next) => animate(next),
  )

  onBeforeUnmount(() => stop())
  return value
}

// Fuel vs toll split for the active quarter (derived from historical snapshots).
const activeVehicleCostSplit = computed(() => {
  const quarter = reportingQuarter.value
  const rows = historicalTrendData.value.filter(
    (row) => row.reporting_quarter === quarter && row.mode === HTS_MODE_VEHICLE_DRIVER,
  )

  const fuel = rows.reduce((sum, row) => sum + (row.fuel_cost_aud ?? 0), 0)
  // Prefer net tolls if present; otherwise fall back to gross tolls.
  const tolls = rows.reduce(
    (sum, row) => sum + (row.net_toll_cost_aud ?? row.toll_cost_aud ?? 0),
    0,
  )
  const total = fuel + tolls

  return {
    fuelAud: round2(fuel),
    tollsAud: round2(tolls),
    fuelPct: total > 0 ? clamp0to100((fuel / total) * 100) : 0,
    tollsPct: total > 0 ? clamp0to100((tolls / total) * 100) : 0,
    hasBreakdown: rows.length > 0 && total > 0,
  }
})

const animatedDeltaHours = useAnimatedNumber(() =>
  (() => {
    if (ptMinutes.value === null || drivingMinutes.value === null) return null
    return hoursPerWeekFromMinutesDelta(ptMinutes.value - drivingMinutes.value, timeScale.value)
  })(),
)

const animatedCostDelta = useAnimatedNumber(() => weeklyCostDeltaAud.value)

const divergenceCopy = computed(() => {
  const hours = animatedDeltaHours.value
  const cost = animatedCostDelta.value

  if (hours === null || cost === null) {
    return 'Divergence summary will appear once both modes have loaded.'
  }

  const hoursAbs = Math.abs(hours)
  const costAbs = Math.abs(cost)
  const timeVerb = hours >= 0 ? 'saves' : 'adds'
  const costVerb = cost >= 0 ? 'adds' : 'saves'
  const hourLabel = hoursAbs === 1 ? 'hour' : 'hours'

  return `Driving ${timeVerb} the average commuter ${hoursAbs.toFixed(1)} ${hourLabel} per week, but ${costVerb} an extra ${formatCurrency(
    costAbs,
  )} in running costs.`
})
</script>

<template>
  <section aria-label="Commute mode scorecards">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
      <!-- Public transport -->
      <article :class="`report-card-boundary ${isLoading ? 'report-skeleton-pulse border-slate-300/80' : 'border-slate-200'} p-5 md:p-6`">
        <p class="text-report-card-label">Public transport</p>
        <p class="text-report-metric mt-2">{{ formatCurrency(ptCostAud) }}</p>
        <p class="mt-1 text-sm text-slate-600">
          Avg duration:
          <strong class="font-semibold text-slate-900">{{ formatMinutes(ptMinutes) }}</strong>
        </p>
        <p
          v-if="isWeekly"
          class="mt-4 inline-flex max-w-full items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900"
        >
          Protected by the frozen $50 weekly Opal travel cap
        </p>
      </article>

      <!-- Private vehicle -->
      <article :class="`report-card-boundary ${isLoading ? 'report-skeleton-pulse border-slate-300/80' : 'border-slate-200'} p-5 md:p-6`">
        <p class="text-report-card-label">Private vehicle</p>
        <p class="text-report-metric mt-2">{{ formatCurrency(carCostAud) }}</p>
        <p class="mt-1 text-sm text-slate-600">
          Avg duration:
          <strong class="font-semibold text-slate-900">{{ formatMinutes(drivingMinutes) }}</strong>
        </p>

        <div class="mt-5">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fuel vs tolls</p>
            <p v-if="activeVehicleCostSplit.hasBreakdown" class="text-xs tabular-nums text-slate-500">
              {{ formatCurrency(activeVehicleCostSplit.fuelAud) }} fuel ·
              {{ formatCurrency(activeVehicleCostSplit.tollsAud) }} tolls
            </p>
          </div>

          <div
            class="mt-2 h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100"
            role="img"
            aria-label="Fuel and tolls contribution bar"
          >
            <div class="flex h-full w-full">
              <div
                class="h-full bg-amber-500/80"
                :style="{ width: `${activeVehicleCostSplit.fuelPct}%` }"
                :aria-label="`Fuel share ${activeVehicleCostSplit.fuelPct.toFixed(0)}%`"
              />
              <div
                class="h-full bg-slate-700/75"
                :style="{ width: `${activeVehicleCostSplit.tollsPct}%` }"
                :aria-label="`Tolls share ${activeVehicleCostSplit.tollsPct.toFixed(0)}%`"
              />
            </div>
          </div>

          <p v-if="!activeVehicleCostSplit.hasBreakdown" class="mt-2 text-xs text-slate-500">
            Breakdown appears once historical snapshots include fuel and toll fields.
          </p>
        </div>

        <p
          v-if="tollCapActive"
          class="mt-4 inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
        >
          Contains -{{ formatCurrency(tollSubsidyAud) }} Toll Cap Rebate
        </p>
      </article>

      <!-- Divergence -->
      <article :class="`report-card-boundary ${isLoading ? 'report-skeleton-pulse border-slate-300/80' : 'border-slate-200'} p-5 md:p-6`">
        <p class="text-report-card-label">Affordability divergence</p>
        <p class="text-report-metric mt-2">{{ formatCurrency(weeklyCostDeltaAud) }}</p>
        <p class="mt-1 text-xs text-slate-500">
          Net variance · {{ isWeekly ? 'weekly' : 'daily' }} view
        </p>

        <p class="mt-4 text-sm leading-relaxed text-slate-700">
          {{ divergenceCopy }}
        </p>
      </article>
    </div>

    <!-- Accessibility fallback table -->
    <table class="sr-only" aria-label="Commute mode scorecard values">
      <caption>
        Public transport and private vehicle summary values for {{ reportingQuarter }} ({{ timeScale }} scale).
      </caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Cost</th>
          <th scope="col">Duration</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Public transport</th>
          <td>{{ formatCurrency(ptCostAud) }}</td>
          <td>{{ formatMinutes(ptMinutes) }}</td>
          <td>
            {{ isWeekly ? 'Protected by the frozen $50 weekly Opal travel cap' : 'Daily view' }}
          </td>
        </tr>
        <tr>
          <th scope="row">Private vehicle</th>
          <td>{{ formatCurrency(carCostAud) }}</td>
          <td>{{ formatMinutes(drivingMinutes) }}</td>
          <td>
            Fuel {{ formatCurrency(activeVehicleCostSplit.fuelAud) }}, tolls
            {{ formatCurrency(activeVehicleCostSplit.tollsAud) }}
            <span v-if="tollCapActive">
              · Contains -{{ formatCurrency(tollSubsidyAud) }} toll cap rebate
            </span>
          </td>
        </tr>
        <tr>
          <th scope="row">Divergence</th>
          <td>{{ formatCurrency(weeklyCostDeltaAud) }}</td>
          <td>{{ formatMinutes(ptMinutes !== null && drivingMinutes !== null ? ptMinutes - drivingMinutes : null) }}</td>
          <td>{{ divergenceCopy }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

