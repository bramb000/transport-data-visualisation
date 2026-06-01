<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useEchartsHost } from '../composables/useEchartsHost'
import { useCommuteDataStore } from '../stores/commuteDataStore'

const props = defineProps<{
  scrollProgress: number
}>()

const store = useCommuteDataStore()
const { historicalTrends, isLoading } = storeToRefs(store)

const chartHost = ref<HTMLElement | null>(null)

const quarters = computed(() => historicalTrends.value.map((point) => point.reporting_quarter))

const visibleCount = computed(() => {
  if (!quarters.value.length) return 0
  const progress = Math.max(props.scrollProgress, 0.15)
  return Math.max(1, Math.ceil(quarters.value.length * progress))
})

function buildOption(): EChartsOption {
  const slice = historicalTrends.value.slice(0, visibleCount.value)
  const labels = slice.map((point) => point.reporting_quarter)
  const times = slice.map((point) => point.averageTimeMinutes)
  const costs = slice.map((point) => point.averageCostAud)

  return {
    backgroundColor: 'transparent',
    animationDuration: 400,
    grid: { left: 48, right: 48, top: 48, bottom: 48 },
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['Avg time (min)', 'Avg cost ($)'],
      textStyle: { color: '#a1a1aa', fontFamily: 'JetBrains Mono', fontSize: 11 },
      top: 8,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#3f3f46' } },
      axisLabel: { color: '#a1a1aa', fontFamily: 'JetBrains Mono', fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Minutes',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#27272a' } },
        axisLabel: { color: '#71717a' },
      },
      {
        type: 'value',
        name: 'AUD',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#71717a' },
      },
    ],
    series: [
      {
        name: 'Avg time (min)',
        type: 'line',
        smooth: 0.45,
        data: times,
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#3b82f6' },
        itemStyle: { color: '#3b82f6' },
      },
      {
        name: 'Avg cost ($)',
        type: 'line',
        smooth: 0.45,
        data: costs,
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#8b5cf6' },
        itemStyle: { color: '#8b5cf6' },
      },
    ],
  }
}

useEchartsHost(chartHost, buildOption, [historicalTrends, visibleCount, () => props.scrollProgress])

</script>

<template>
  <div class="st-chart-host relative">
    <p v-if="isLoading" class="st-loading">Loading trend data…</p>
    <div
      ref="chartHost"
      class="st-chart-canvas"
      role="img"
      aria-label="Commute trend timeline"
    />
    <table class="sr-only">
      <caption>Historical commute trends</caption>
      <thead>
        <tr>
          <th scope="col">Quarter</th>
          <th scope="col">Avg time</th>
          <th scope="col">Avg cost</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in historicalTrends" :key="row.reporting_quarter">
          <th scope="row">{{ row.reporting_quarter }}</th>
          <td>{{ row.averageTimeMinutes ?? '—' }}</td>
          <td>{{ row.averageCostAud ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
