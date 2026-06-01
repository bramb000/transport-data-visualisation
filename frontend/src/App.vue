<script setup lang="ts">
import CommuteAffordabilityReport from './views/CommuteAffordabilityReport.vue'
import type { ReportFilterChangePayload } from './types/reportEvents'
import type { TimeScale } from './stores/commuteReportStore'

function onReportFilterChange(_payload: ReportFilterChangePayload) {
  /* Hook for analytics / deep-linking when parent wrappers are added. */
}

function onTimeScaleChange(_scale: TimeScale) {
  /* Reserved for external telemetry. */
}

function onOriginChange(_origin: string) {
  /* Reserved for external telemetry. */
}
</script>

<template>
  <CommuteAffordabilityReport
    @filter-change="onReportFilterChange"
    @time-scale-change="onTimeScaleChange"
    @origin-change="onOriginChange"
  />
</template>
