import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommuteDataStore } from '../stores/commuteDataStore'
import { SCROLL_STEP_COUNT } from '../types/commuteData'
import type { ScrollyStepCopy } from './useScrollySteps'

/** Scroll narrative cards — trend step driven by commute-time direction. */
export function useStoryStepCopy() {
  const store = useCommuteDataStore()
  const { commuteTimeInsight } = storeToRefs(store)

  const copy = computed<ScrollyStepCopy[]>(() => [
    {
      kicker: '[Section 01]',
      headline: '[Insert Hook Here]',
      body: '[Data Insight to follow]',
    },
    {
      kicker: '[Section 02]',
      headline: commuteTimeInsight.value.headline,
      body: commuteTimeInsight.value.body,
    },
    {
      kicker: '[Section 03]',
      headline: '[Peak vs Off-Peak Placeholder]',
      body: '[Data Insight to follow]',
    },
    {
      kicker: '[Section 04]',
      headline: '[Corridor Explorer Placeholder]',
      body: '[Data Insight to follow]',
    },
  ])

  return { copy, stepCount: SCROLL_STEP_COUNT }
}
