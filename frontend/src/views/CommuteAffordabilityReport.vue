<script setup lang="ts">
import { storeToRefs } from 'pinia'
import CommuteChoroplethMap from '../components/CommuteChoroplethMap.vue'
import MetricSummaryGrid from '../components/MetricSummaryGrid.vue'
import { ORIGIN_SA3_OPTIONS } from '../config/reportOrigins'
import {
  useCommuteReportStore,
  type TimeScale,
} from '../stores/commuteReportStore'
import type { ReportFilterChangePayload } from '../types/reportEvents'
import { formatCurrency, formatMinutes } from '../utils/formatters'

const emit = defineEmits<{
  'filter-change': [payload: ReportFilterChangePayload]
  'time-scale-change': [scale: TimeScale]
  'origin-change': [origin: string]
}>()

const reportStore = useCommuteReportStore()
const {
  timeScale,
  selectedOrigin,
  isLoading,
  loadError,
  trendByQuarter,
  reportingQuarter,
} = storeToRefs(reportStore)

const timeScaleOptions: { value: TimeScale; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]

function emitFilterChange() {
  const payload: ReportFilterChangePayload = {
    timeScale: timeScale.value,
    originSa3: selectedOrigin.value,
  }
  emit('filter-change', payload)
}

function onTimeScaleSelect(scale: TimeScale) {
  if (timeScale.value === scale) return
  reportStore.setTimeScale(scale)
  emit('time-scale-change', scale)
  emitFilterChange()
}

function onOriginSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (selectedOrigin.value === value) return
  reportStore.setSelectedOrigin(value)
  emit('origin-change', value)
  emitFilterChange()
}

function cardBoundaryClass(extra = ''): string {
  const pulse = isLoading.value ? 'report-skeleton-pulse border-slate-300/80' : 'border-slate-200'
  return `report-card-boundary ${pulse} ${extra}`.trim()
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header
      class="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/75 backdrop-blur-md"
      role="banner"
    >
      <div
        class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8"
      >
        <div class="min-w-0 flex-1">
          <p class="text-report-kicker">Sydney Commute Affordability Report</p>
          <h1 class="text-report-title mt-1">
            Time, tolls &amp; the cost of getting to work
          </h1>
          <p class="text-report-subtitle mt-2 max-w-2xl">
            Comparing multimodal public transport and private car commute affordability across
            Greater Sydney SA3 regions.
          </p>
        </div>

        <div
          class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center lg:pb-0.5"
          role="toolbar"
          aria-label="Report filters"
        >
          <div
            class="inline-flex rounded-full border border-slate-200 bg-slate-100/90 p-1 shadow-inner"
            role="group"
            aria-label="Daily or weekly cost scale"
          >
            <button
              v-for="option in timeScaleOptions"
              :key="option.value"
              type="button"
              class="rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              :class="
                timeScale === option.value
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              "
              :aria-pressed="timeScale === option.value"
              @click="onTimeScaleSelect(option.value)"
            >
              {{ option.label }}
            </button>
          </div>

          <label class="flex min-w-[12rem] flex-col gap-1">
            <span class="text-report-card-label">Origin SA3 region</span>
            <div class="relative">
              <select
                class="w-full appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-slate-900 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                :value="selectedOrigin"
                @change="onOriginSelect"
              >
                <option v-for="origin in ORIGIN_SA3_OPTIONS" :key="origin" :value="origin">
                  {{ origin }}
                </option>
              </select>
              <span
                class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"
                aria-hidden="true"
              >
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </span>
            </div>
          </label>
        </div>
      </div>
    </header>

    <div
      v-if="isLoading"
      class="pointer-events-none fixed inset-0 z-40 bg-slate-50/40 backdrop-blur-[1px]"
      aria-hidden="true"
    />

    <main
      class="relative mx-auto max-w-7xl space-y-12 px-4 pb-16 pt-[13.5rem] sm:px-6 sm:pt-[12.5rem] lg:space-y-16 lg:pt-[11.5rem]"
      :aria-busy="isLoading"
      aria-live="polite"
    >
      <p
        v-if="loadError"
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        {{ loadError }}
      </p>

      <!-- Section 1: Metrics summary -->
      <section aria-labelledby="metrics-summary-heading">
        <div class="mb-6">
          <h2 id="metrics-summary-heading" class="text-report-section-heading">
            At a glance
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            {{ selectedOrigin }} · {{ reportingQuarter }} · {{ timeScale }} view
          </p>
        </div>

        <MetricSummaryGrid />

      </section>

      <!-- Section 2: Spatial matrix -->
      <section aria-labelledby="spatial-matrix-heading">
        <div class="mb-6">
          <h2 id="spatial-matrix-heading" class="text-report-section-heading">
            Spatial matrix
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            Choropleth affordability and time–cost comparison by SA3.
          </p>
        </div>

        <div
          class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:snap-none"
          role="region"
          aria-label="Spatial matrix panels"
          tabindex="0"
        >
          <article
            :class="
              cardBoundaryClass(
                'min-w-[88vw] shrink-0 snap-center overflow-hidden sm:min-w-[78vw] lg:col-span-2 lg:min-w-0',
              )
            "
          >
            <div class="border-b border-slate-100 px-4 py-3">
              <p class="text-report-card-label">Map &amp; scatterplot canvas</p>
            </div>
            <div class="min-h-[22rem] lg:min-h-[28rem]">
              <CommuteChoroplethMap />
            </div>
          </article>

          <aside
            :class="
              cardBoundaryClass(
                'flex min-h-[22rem] min-w-[78vw] shrink-0 snap-center flex-col p-4 md:p-5 lg:col-span-1 lg:min-w-0',
              )
            "
          >
            <p class="text-report-card-label">Corridor leaderboard</p>
            <ol class="mt-4 flex-1 space-y-3" aria-label="Quarters ranked by car minus PT cost gap">
              <li
                v-for="(row, index) in trendByQuarter.slice(-5).reverse()"
                :key="row.reporting_quarter"
                class="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <span class="text-sm font-medium text-slate-800">
                  <span class="mr-2 tabular-nums text-slate-400">{{ index + 1 }}</span>
                  {{ row.quarter_slug ?? row.reporting_quarter }}
                </span>
                <span class="text-sm tabular-nums text-slate-600">
                  {{ formatCurrency(row.weekly_cost_delta_aud) }}
                </span>
              </li>
              <li
                v-if="!trendByQuarter.length"
                class="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500"
              >
                Leaderboard populates when historical snapshots load.
              </li>
            </ol>
          </aside>
        </div>
      </section>

      <!-- Section 3: Timeline engine -->
      <section aria-labelledby="timeline-engine-heading" class="-mx-4 sm:mx-0">
        <div class="mb-6 px-4 sm:px-0">
          <h2 id="timeline-engine-heading" class="text-report-section-heading">
            Timeline engine
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            Quarterly PT vs car cost trajectories for {{ selectedOrigin }}.
          </p>
        </div>

        <div :class="cardBoundaryClass('mx-4 overflow-hidden sm:mx-0')">
          <div
            class="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6"
          >
            <p class="text-report-card-label">Trend lines</p>
            <p class="text-xs text-slate-500">
              {{ trendByQuarter.length }} quarter{{ trendByQuarter.length === 1 ? '' : 's' }}
            </p>
          </div>

          <div class="min-h-[16rem] w-full overflow-x-auto px-4 py-6 sm:px-6">
            <div
              class="flex min-w-max items-end gap-3 sm:gap-4"
              role="img"
              aria-labelledby="timeline-engine-heading"
            >
              <div
                v-for="point in trendByQuarter"
                :key="point.reporting_quarter"
                class="flex w-16 flex-col items-center gap-2 sm:w-20"
              >
                <div class="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    class="w-3 rounded-t bg-teal-600/80"
                    :style="{
                      height: `${Math.min(100, (point.pt_weekly_cost_aud ?? 0) * 1.2)}%`,
                    }"
                    :title="`PT ${formatCurrency(point.pt_weekly_cost_aud)}`"
                  />
                  <div
                    class="w-3 rounded-t bg-slate-700/80"
                    :style="{
                      height: `${Math.min(100, (point.car_weekly_cost_aud ?? 0) * 1.2)}%`,
                    }"
                    :title="`Car ${formatCurrency(point.car_weekly_cost_aud)}`"
                  />
                </div>
                <span class="text-center text-[10px] font-medium leading-tight text-slate-600 sm:text-xs">
                  {{ point.quarter_slug ?? point.reporting_quarter }}
                </span>
              </div>
            </div>
            <p
              v-if="!trendByQuarter.length"
              class="py-12 text-center text-sm text-slate-500"
            >
              Timeline charts render when historical commute snapshots are available.
            </p>
          </div>

          <table class="sr-only" aria-label="Quarterly commute cost trend data">
            <caption>
              Public transport and private car {{ timeScale }} costs by reporting quarter for
              {{ selectedOrigin }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                <th scope="col">PT cost (AUD)</th>
                <th scope="col">Car cost (AUD)</th>
                <th scope="col">Cost delta (AUD)</th>
                <th scope="col">Time delta (min)</th>
                <th scope="col">Toll subsidy (AUD)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in trendByQuarter" :key="`table-${point.reporting_quarter}`">
                <th scope="row">{{ point.quarter_slug ?? point.reporting_quarter }}</th>
                <td>{{ formatCurrency(point.pt_weekly_cost_aud) }}</td>
                <td>{{ formatCurrency(point.car_weekly_cost_aud) }}</td>
                <td>{{ formatCurrency(point.weekly_cost_delta_aud) }}</td>
                <td>{{ formatMinutes(point.time_delta_min) }}</td>
                <td>{{ formatCurrency(point.toll_subsidy_aud) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>
