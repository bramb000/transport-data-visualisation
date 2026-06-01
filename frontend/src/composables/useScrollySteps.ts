import { useIntersectionObserver } from '@vueuse/core'
import { ref, type Ref } from 'vue'
import { useCommuteDataStore } from '../stores/commuteDataStore'
import { SCROLL_STEP_COUNT } from '../types/commuteData'

export interface ScrollyStepCopy {
  kicker: string
  headline: string
  body: string
}

export const SCROLL_STEP_COPY: ScrollyStepCopy[] = [
  {
    kicker: '[Section 01]',
    headline: '[Insert Hook Here]',
    body: '[Data Insight to follow]',
  },
  {
    kicker: '[Section 02]',
    headline: '[Trend Narrative Placeholder]',
    body: '[Data Insight to follow]',
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
]

/** Scroll-step refs + intersection observers (call once in setup). */
export function useScrollySteps() {
  const store = useCommuteDataStore()
  const stepRefs: Ref<HTMLElement | null>[] = Array.from({ length: SCROLL_STEP_COUNT }, () =>
    ref<HTMLElement | null>(null),
  )

  stepRefs.forEach((stepRef, index) => {
    useIntersectionObserver(
      stepRef,
      ([entry]) => {
        if (!entry?.isIntersecting) return
        store.setActiveStep(index)
        store.setStepScrollProgress(entry.intersectionRatio)
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '-35% 0px -35% 0px',
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
    copy: SCROLL_STEP_COPY,
    stepCount: SCROLL_STEP_COUNT,
  }
}
