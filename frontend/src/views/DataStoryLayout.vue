<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import DeviationLeaderboard from '../components/DeviationLeaderboard.vue'
import InteractiveRouteMap from '../components/InteractiveRouteMap.vue'
import MacroAggregates from '../components/MacroAggregates.vue'
import TrendTimelineChart from '../components/TrendTimelineChart.vue'
import { useScrollySteps } from '../composables/useScrollySteps'
import { useCommuteDataStore } from '../stores/commuteDataStore'

const store = useCommuteDataStore()
const { activeStep, stepScrollProgress, loadError } = storeToRefs(store)

const { setStepRef, copy } = useScrollySteps()

const stageInteractive = computed(
  () => activeStep.value === 0 || activeStep.value === 1 || activeStep.value === 3,
)
</script>

<template>
  <div class="st-scrolly">
    <a href="#scrolly-content" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4">
      Skip to story
    </a>

    <div class="st-stage" :class="{ 'st-stage--interactive': stageInteractive }" aria-hidden="true">
      <div class="st-stage__inner">
        <Transition name="st-stage-fade" mode="out-in">
          <MacroAggregates v-if="activeStep === 0" key="macro" class="st-stage__viz" />
          <TrendTimelineChart
            v-else-if="activeStep === 1"
            key="trend"
            class="st-stage__viz"
            :scroll-progress="stepScrollProgress"
          />
          <DeviationLeaderboard v-else-if="activeStep === 2" key="deviation" class="st-stage__viz" />
          <InteractiveRouteMap v-else-if="activeStep === 3" key="map" class="st-stage__viz" />
        </Transition>
      </div>
    </div>

    <div id="scrolly-content" class="st-scroll">
      <p
        v-if="loadError"
        role="alert"
        class="st-alert"
      >
        {{ loadError }}
      </p>

      <section
        v-for="(step, index) in copy"
        :key="step.kicker"
        :ref="(el) => setStepRef(index, el as HTMLElement | null)"
        class="st-step"
        :aria-current="activeStep === index ? 'step' : undefined"
      >
        <article class="st-card">
          <p class="st-kicker">{{ step.kicker }}</p>
          <h2 class="st-display">{{ step.headline }}</h2>
          <p class="st-body">{{ step.body }}</p>
        </article>
      </section>
    </div>
  </div>
</template>
