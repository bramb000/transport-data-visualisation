import type { ECharts, EChartsOption } from 'echarts'
import * as echarts from 'echarts'
import { nextTick, onMounted, onUnmounted, watch, type Ref, type WatchSource } from 'vue'

const MIN_HOST_PX = 48

/**
 * Initialise ECharts only after the host has layout dimensions (avoids 0×0 canvas bugs).
 */
export function useEchartsHost(
  hostRef: Ref<HTMLElement | null>,
  buildOption: () => EChartsOption,
  watchSources: WatchSource[] = [],
) {
  let chart: ECharts | null = null
  let resizeObserver: ResizeObserver | null = null

  function render() {
    if (!chart) return
    chart.setOption(buildOption(), { notMerge: true })
  }

  function ensureChart() {
    const host = hostRef.value
    if (!host || chart) return

    const { width, height } = host.getBoundingClientRect()
    if (width < MIN_HOST_PX || height < MIN_HOST_PX) return

    chart = echarts.init(host, undefined, { renderer: 'canvas' })
    render()
  }

  function handleResize() {
    ensureChart()
    chart?.resize()
  }

  onMounted(async () => {
    await nextTick()
    ensureChart()

    const host = hostRef.value
    if (!host) return

    resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(host)
    window.addEventListener('resize', handleResize)
    handleResize()
  })

  if (watchSources.length) {
    watch(watchSources, () => render())
  }

  onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleResize)
    chart?.dispose()
    chart = null
  })

  return {
    render,
    resize: () => chart?.resize(),
    getInstance: () => chart,
  }
}
