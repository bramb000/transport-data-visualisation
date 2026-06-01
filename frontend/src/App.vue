<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CommuteChoroplethMap from './components/CommuteChoroplethMap.vue'
import CommuteDashboard from './components/CommuteDashboard.vue'
import { fetchHealth } from './api/commuteClient'

const apiStatus = ref<'loading' | 'ok' | 'error'>('loading')

onMounted(async () => {
  try {
    await fetchHealth()
    apiStatus.value = 'ok'
  } catch {
    apiStatus.value = 'error'
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Sydney Commute Compare</h1>
          <p class="text-sm text-slate-500">Public transport vs private car — time & cost</p>
        </div>
        <p class="text-sm" aria-live="polite">
          <span v-if="apiStatus === 'loading'" class="text-slate-500">Connecting to API…</span>
          <span v-else-if="apiStatus === 'ok'" class="font-medium text-emerald-700">API connected</span>
          <span v-else class="font-medium text-amber-700">API unavailable</span>
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-8 space-y-10">
      <CommuteChoroplethMap />
      <CommuteDashboard />
    </main>
  </div>
</template>
