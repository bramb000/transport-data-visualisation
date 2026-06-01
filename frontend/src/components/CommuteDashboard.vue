<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { calculateCommute, CommuteApiError, fetchVehicleProfiles } from '../api/commuteClient'
import type {
  CommuteMetricsResponse,
  Coordinates,
  VehicleProfile,
  VehicleProfileId,
} from '../types/commute'
import { formatCurrency, formatDistanceKm, formatMinutes } from '../utils/formatters'

const DEFAULT_ORIGIN: Coordinates = {
  lat: -33.9116,
  lon: 151.1032,
  label: 'Campsie Station',
}

const DEFAULT_DESTINATION: Coordinates = {
  lat: -33.9185,
  lon: 151.1045,
  label: 'Burwood',
}

const origin = reactive<Coordinates>({ ...DEFAULT_ORIGIN })
const destination = reactive<Coordinates>({ ...DEFAULT_DESTINATION })

const vehicleProfiles = ref<VehicleProfile[]>([])
const selectedVehicleId = ref<VehicleProfileId>('medium_car')
const useCustomFuel = ref(false)
const customFuelConsumption = ref(10)

const metrics = ref<CommuteMetricsResponse | null>(null)
const isLoadingProfiles = ref(false)
const isCalculating = ref(false)
const errorMessage = ref<string | null>(null)

const selectedVehicle = computed(() =>
  vehicleProfiles.value.find((profile) => profile.id === selectedVehicleId.value),
)

const effectiveFuelConsumption = computed(() =>
  useCustomFuel.value
    ? customFuelConsumption.value
    : selectedVehicle.value?.default_consumption_l_per_100km ?? 8,
)

const tableCaption = computed(() => {
  if (!metrics.value) {
    return 'Commute comparison results will appear here after you run a calculation.'
  }
  return `Commute comparison updated at ${metrics.value.fetched_at}. Public transport versus driving time and cost.`
})

const comparisonRows = computed(() => {
  if (!metrics.value) return []

  const pt = metrics.value.public_transport
  const driving = metrics.value.driving

  return [
    {
      mode: pt.route_label ?? 'Public transport',
      time: formatMinutes(pt.duration_min),
      distance: formatDistanceKm(pt.distance_km),
      cost: formatCurrency(pt.cost_aud),
      notes: pt.error ?? (pt.route_numbers.length ? `Routes ${pt.route_numbers.join(', ')}` : 'Multimodal'),
    },
    {
      mode: 'Private car',
      time: formatMinutes(driving.duration_min),
      distance: formatDistanceKm(driving.distance_km),
      cost: formatCurrency(driving.cost_aud),
      notes:
        driving.error ??
        `${effectiveFuelConsumption.value.toFixed(1)} L/100 km @ ${formatCurrency(driving.fuel_price_per_litre ?? null)}/L`,
    },
  ]
})

const ptOptionRows = computed(() => {
  if (!metrics.value?.public_transport_options.length) return []
  return metrics.value.public_transport_options.map((option) => ({
    rank: option.option_rank ?? '—',
    label: option.route_label ?? 'Public transport',
    time: formatMinutes(option.duration_min),
    cost: formatCurrency(option.cost_aud),
  }))
})

onMounted(async () => {
  isLoadingProfiles.value = true
  errorMessage.value = null
  try {
    const profiles = await fetchVehicleProfiles()
    vehicleProfiles.value = Object.values(profiles)
    if (!vehicleProfiles.value.some((profile) => profile.id === selectedVehicleId.value)) {
      selectedVehicleId.value = vehicleProfiles.value[0]?.id ?? 'medium_car'
    }
    customFuelConsumption.value =
      selectedVehicle.value?.default_consumption_l_per_100km ?? customFuelConsumption.value
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Failed to load vehicle profiles.'
  } finally {
    isLoadingProfiles.value = false
  }
})

function onVehicleChange() {
  if (!useCustomFuel.value && selectedVehicle.value) {
    customFuelConsumption.value = selectedVehicle.value.default_consumption_l_per_100km
  }
}

async function runCalculation() {
  isCalculating.value = true
  errorMessage.value = null

  try {
    metrics.value = await calculateCommute({
      origin: { lat: origin.lat, lon: origin.lon, label: origin.label },
      destination: {
        lat: destination.lat,
        lon: destination.lon,
        label: destination.label,
      },
      vehicle_profile_id: selectedVehicleId.value,
      fuel_consumption_l_per_100km: useCustomFuel.value ? customFuelConsumption.value : null,
      fuel_suburb: 'Sydney',
    })
  } catch (error) {
    metrics.value = null
    if (error instanceof CommuteApiError) {
      errorMessage.value = error.detail
    } else if (error instanceof Error) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = 'Unable to calculate commute metrics.'
    }
  } finally {
    isCalculating.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Input form -->
    <section
      class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="commute-form-heading"
    >
      <h2 id="commute-form-heading" class="text-lg font-semibold text-slate-900">
        Plan your commute
      </h2>
      <p class="mt-1 text-sm text-slate-600">
        Enter origin and destination coordinates, choose a vehicle profile, then compare modes.
      </p>

      <form class="mt-6 grid gap-6 lg:grid-cols-2" @submit.prevent="runCalculation">
        <fieldset class="space-y-3">
          <legend class="text-sm font-medium text-slate-800">Origin</legend>
          <label class="block text-sm">
            <span class="text-slate-600">Label</span>
            <input
              v-model="origin.label"
              type="text"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm">
              <span class="text-slate-600">Latitude</span>
              <input
                v-model.number="origin.lat"
                type="number"
                step="0.0001"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label class="block text-sm">
              <span class="text-slate-600">Longitude</span>
              <input
                v-model.number="origin.lon"
                type="number"
                step="0.0001"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-3">
          <legend class="text-sm font-medium text-slate-800">Destination</legend>
          <label class="block text-sm">
            <span class="text-slate-600">Label</span>
            <input
              v-model="destination.label"
              type="text"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm">
              <span class="text-slate-600">Latitude</span>
              <input
                v-model.number="destination.lat"
                type="number"
                step="0.0001"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label class="block text-sm">
              <span class="text-slate-600">Longitude</span>
              <input
                v-model.number="destination.lon"
                type="number"
                step="0.0001"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-3 lg:col-span-2">
          <legend class="text-sm font-medium text-slate-800">Vehicle & fuel</legend>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block text-sm">
              <span class="text-slate-600">Vehicle profile</span>
              <select
                v-model="selectedVehicleId"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                :disabled="isLoadingProfiles"
                @change="onVehicleChange"
              >
                <option
                  v-for="profile in vehicleProfiles"
                  :key="profile.id"
                  :value="profile.id"
                >
                  {{ profile.label }} ({{ profile.default_consumption_l_per_100km }} L/100 km)
                </option>
              </select>
            </label>

            <div class="space-y-2">
              <label class="flex items-center gap-2 text-sm text-slate-700">
                <input v-model="useCustomFuel" type="checkbox" class="rounded border-slate-300" />
                Override fuel consumption
              </label>
              <label class="block text-sm">
                <span class="text-slate-600">Custom consumption (L/100 km)</span>
                <input
                  v-model.number="customFuelConsumption"
                  type="range"
                  min="4"
                  max="20"
                  step="0.1"
                  class="mt-2 w-full"
                  :disabled="!useCustomFuel"
                />
                <input
                  v-model.number="customFuelConsumption"
                  type="number"
                  min="4"
                  max="20"
                  step="0.1"
                  class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                  :disabled="!useCustomFuel"
                />
              </label>
            </div>
          </div>
        </fieldset>

        <div class="lg:col-span-2">
          <button
            type="submit"
            class="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            :disabled="isCalculating || isLoadingProfiles"
          >
            {{ isCalculating ? 'Calculating…' : 'Compare commute' }}
          </button>
        </div>
      </form>

      <p
        v-if="errorMessage"
        class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        role="alert"
      >
        {{ errorMessage }}
      </p>
    </section>

    <!-- Dashboard grid -->
    <div class="grid gap-6 xl:grid-cols-3">
      <!-- Map & chart placeholders -->
      <section
        class="space-y-4 xl:col-span-2"
        aria-labelledby="visualizations-heading"
      >
        <h2 id="visualizations-heading" class="sr-only">Map and chart visualizations</h2>

        <div
          class="flex min-h-64 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center shadow-sm"
          role="region"
          aria-label="Interactive route map placeholder"
        >
          <div>
            <p class="text-sm font-medium text-slate-700">MapLibre route map</p>
            <p class="mt-1 text-xs text-slate-500">MapTiler basemap and polylines will render here.</p>
          </div>
        </div>

        <div
          class="flex min-h-56 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center shadow-sm"
          role="img"
          aria-label="Time versus cost scatterplot placeholder"
        >
          <div>
            <p class="text-sm font-medium text-slate-700">Time vs cost scatterplot</p>
            <p class="mt-1 text-xs text-slate-500">ECharts quadrant chart will render here.</p>
          </div>
        </div>
      </section>

      <!-- Accessible comparison table -->
      <section
        class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1"
        aria-labelledby="comparison-table-heading"
      >
        <h2 id="comparison-table-heading" class="text-lg font-semibold text-slate-900">
          Mode comparison
        </h2>

        <div aria-live="polite" aria-atomic="true" class="mt-4 overflow-x-auto">
          <table class="min-w-full border-collapse text-left text-sm">
            <caption class="mb-3 text-left text-sm text-slate-600">
              {{ tableCaption }}
            </caption>
            <thead>
              <tr class="border-b border-slate-200">
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Mode</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Time</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Distance</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Cost</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!metrics" class="border-b border-slate-100">
                <td colspan="5" class="px-2 py-4 text-slate-500">
                  Run a calculation to populate the comparison table.
                </td>
              </tr>
              <tr
                v-for="row in comparisonRows"
                v-else
                :key="row.mode"
                class="border-b border-slate-100"
              >
                <th scope="row" class="px-2 py-2 font-medium text-slate-900">{{ row.mode }}</th>
                <td class="px-2 py-2">{{ row.time }}</td>
                <td class="px-2 py-2">{{ row.distance }}</td>
                <td class="px-2 py-2">{{ row.cost }}</td>
                <td class="px-2 py-2 text-slate-600">{{ row.notes }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="ptOptionRows.length > 1" class="mt-6">
          <h3 class="text-sm font-medium text-slate-800">Public transport options</h3>
          <table class="mt-2 min-w-full border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">#</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Route</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Time</th>
                <th scope="col" class="px-2 py-2 font-medium text-slate-700">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="option in ptOptionRows"
                :key="String(option.rank) + option.label"
                class="border-b border-slate-100"
              >
                <td class="px-2 py-2">{{ option.rank }}</td>
                <th scope="row" class="px-2 py-2 font-medium text-slate-900">{{ option.label }}</th>
                <td class="px-2 py-2">{{ option.time }}</td>
                <td class="px-2 py-2">{{ option.cost }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
