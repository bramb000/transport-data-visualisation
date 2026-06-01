import { useIntersectionObserver } from '@vueuse/core'
import { ref, type Ref } from 'vue'
import { useCommuteDataStore } from '../stores/commuteDataStore'
import { SCROLL_STEP_COUNT } from '../types/commuteData'
import { useStoryStepCopy } from './useStoryStepCopy'

export interface ScrollyStepCopy {
  kicker: string
  headline: string
  body: string
}

const VISIBILITY_THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const

/** Pick the scroll step whose section occupies the center band most strongly. */
function resolveActiveStep(ratios: number[]): { index: number; progress: number } {
  let bestIndex = 0
  let bestRatio = 0

  for (let index = 0; index < ratios.length; index += 1) {
    const ratio = ratios[index] ?? 0
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestIndex = index
    }
  }

  return { index: bestIndex, progress: bestRatio }
}

/** Scroll-step refs + intersection observers (call once in setup). */
export function useScrollySteps() {
  const store = useCommuteDataStore()
  const { copy } = useStoryStepCopy()
  const stepRefs: Ref<HTMLElement | null>[] = Array.from({ length: SCROLL_STEP_COUNT }, () =>
    ref<HTMLElement | null>(null),
  )
  const visibilityRatios = ref<number[]>(Array.from({ length: SCROLL_STEP_COUNT }, () => 0))

  function syncActiveStep() {
    const { index, progress } = resolveActiveStep(visibilityRatios.value)
    if (progress <= 0) return
    store.setActiveStep(index)
    store.setStepScrollProgress(progress)
  }

  stepRefs.forEach((stepRef, index) => {
    useIntersectionObserver(
      stepRef,
      ([entry]) => {
        const next = [...visibilityRatios.value]
        next[index] = entry?.isIntersecting ? entry.intersectionRatio : 0
        visibilityRatios.value = next
        syncActiveStep()
      },
      {
        threshold: [...VISIBILITY_THRESHOLDS],
        rootMargin: '-42% 0px -42% 0px',
      },
    )
  })

  function setStepRef(index: number, element: HTMLElement | null) {
    if (index >= 0 && index < stepRefs.length) {
      stepRefs[index].value = element
    }
  }

  return {
    stepRefs,
    setStepRef,
    copy,
    stepCount: SCROLL_STEP_COUNT,
  }
}
