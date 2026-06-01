<script setup lang="ts">
import * as echarts from 'echarts'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCommuteDataStore } from '../stores/commuteDataStore'

const store = useCommuteDataStore()
const { leaveDeviations, arriveDeviations, isLoading } = storeToRefs(store)

const chartHost = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const chartRows = computed(() => {
  const leave = leaveDeviations.value.map((row) => ({
    name: `${row.sa3Name} (leave)`,
    offPeak: row.offPeakMinutes,
    rush: row.rushHourMinutes,
    penalty: row.penaltyMinutes,
  }))
  const arrive = arriveDeviations.value.map((row) => ({
    name: `${row.sa3Name} (arrive)`,
    offPeak: row.offPeakMinutes,
    rush: row.rushHourMinutes,
    penalty: row.penaltyMinutes,
  }))
  return [...leave, ...arrive].sort((left, right) => right.penalty - left.penalty).slice(0, 10)
})

function buildOption(): echarts.EChartsOption {
  const names = chartRows.value.map((row) => row.name)
  const offPeak = chartRows.value.map((row) => row.offPeak)
  const rush = chartRows.value.map((row) => row.rush)

  return {
    backgroundColor: 'transparent',
    grid: { left: 120, right: 32, top: 32, bottom: 32 },
    tooltip: { trigger: 'item' },
    xAxis: {
      type: 'value',
      name: 'Minutes',
      axisLine: { lineStyle: { color: '#3f3f46' } },
      splitLine: { lineStyle: { color: '#27272a' } },
      axisLabel: { color: '#a1a1aa' },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#fafafa', fontFamily: 'Inter', fontSize: 11 },
    },
    series: [
      {
        name: 'Off-peak',
        type: 'scatter',
        data: offPeak.map((value, index) => [value, index]),
        symbolSize: 12,
        itemStyle: { color: '#3b82f6' },
      },
      {
        name: 'Rush hour',
        type: 'scatter',
        data: rush.map((value, index) => [value, index]),
        symbolSize: 12,
        itemStyle: { color: '#d97706' },
      },
      {
        name: 'Gap',
        type: 'custom',
        renderItem: (_params, api) => {
          const index = api.value(1) as number
          const off = offPeak[index] ?? 0
          const rushVal = rush[index] ?? 0
          const start = api.coord([off, index])
          const end = api.coord([rushVal, index])
          return {
            type: 'line',
            shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
            style: { stroke: '#a1a1aa', lineWidth: 2 },
          }
        },
        data: rush.map((_, index) => [0, index]),
        z: 1,
      },
    ],
  }
}

onMounted(() => {
  if (!chartHost.value) return
  chart = echarts.init(chartHost.value)
  chart.setOption(buildOption())
  window.addEventListener('resize', handleResize)
})

function handleResize() {
  chart?.resize()
}

watch(chartRows, () => chart?.setOption(buildOption(), { notMerge: true }))

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})

const tableRows = computed(() => [...leaveDeviations.value, ...arriveDeviations.value])
</script>

<template>
  <div class="st-chart-host relative">
    <p v-if="isLoading" class="st-loading">Loading deviation data…</p>
    <div
      ref="chartHost"
      class="h-full w-full min-h-screen"
      role="img"
      aria-label="Rush hour dumbbell chart: off-peak vs rush travel times by suburb"
    />
    <table class="sr-only">
      <caption>Rush hour deviation by suburb</caption>
      <thead>
        <tr>
          <th scope="col">Suburb</th>
          <th scope="col">List</th>
          <th scope="col">Off-peak (min)</th>
          <th scope="col">Rush (min)</th>
          <th scope="col">Penalty (min)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableRows" :key="`${row.listType}-${row.sa3Name}`">
          <th scope="row">{{ row.sa3Name }}</th>
          <td>{{ row.listType }}</td>
          <td>{{ row.offPeakMinutes }}</td>
          <td>{{ row.rushHourMinutes }}</td>
          <td>{{ row.penaltyMinutes }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
