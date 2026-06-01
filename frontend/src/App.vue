<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CommuteChoroplethMap from './components/CommuteChoroplethMap.vue'
import CommuteDashboard from './components/CommuteDashboard.vue'
import { fetchHealth } from './api/commuteClient'
import { fetchSupabaseHealth } from './api/supabaseClient'
import { isBackendApiConfigured, isSupabaseConfigured } from './utils/deployment'

type ConnectionMode = 'backend' | 'supabase' | 'static'
type ConnectionStatus = 'loading' | 'ok' | 'error'

const connectionMode = ref<ConnectionMode>(
  isBackendApiConfigured() ? 'backend' : isSupabaseConfigured() ? 'supabase' : 'static',
)
const connectionStatus = ref<ConnectionStatus>('loading')
const dataRowCount = ref<number | null>(null)

onMounted(async () => {
  if (connectionMode.value === 'static') {
    connectionStatus.value = 'ok'
    return
  }

  try {
    if (connectionMode.value === 'backend') {
      await fetchHealth()
    } else {
      const health = await fetchSupabaseHealth()
      dataRowCount.value = health.rowCount
    }
    connectionStatus.value = 'ok'
  } catch {
    connectionStatus.value = 'error'
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
          <span v-if="connectionStatus === 'loading'" class="text-slate-500">Connecting…</span>
          <span v-else-if="connectionStatus === 'ok' && connectionMode === 'backend'" class="font-medium text-emerald-700">
            API connected
          </span>
          <span v-else-if="connectionStatus === 'ok' && connectionMode === 'supabase'" class="font-medium text-emerald-700">
            Supabase connected
            <span v-if="dataRowCount === 0" class="font-normal text-amber-700"> (no ETL data yet)</span>
          </span>
          <span v-else-if="connectionStatus === 'ok' && connectionMode === 'static'" class="font-medium text-slate-600">
            Static report
          </span>
          <span v-else-if="connectionMode === 'backend'" class="font-medium text-amber-700">API unavailable</span>
          <span v-else class="font-medium text-amber-700">Supabase unavailable</span>
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-8 space-y-10">
      <CommuteChoroplethMap />
      <CommuteDashboard />
    </main>
  </div>
</template>
