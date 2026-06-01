import { onScopeDispose, ref, watch, type Ref } from 'vue'

interface TallyOptions {
  durationMs?: number
  decimals?: number
}

function formatValue(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Rapid, jittery count-up/down for hand-drawn metric cards. */
export function useTallyAnimation(
  target: Ref<number | null>,
  options: TallyOptions = {},
) {
  const { durationMs = 520, decimals = 1 } = options
  const displayValue = ref<number | null>(target.value)
  const isAnimating = ref(false)

  let frameId = 0
  let timeoutIds: ReturnType<typeof setTimeout>[] = []

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function clearTimers() {
    cancelAnimationFrame(frameId)
    for (const id of timeoutIds) clearTimeout(id)
    timeoutIds = []
  }

  function animateTo(next: number | null) {
    clearTimers()

    if (next === null) {
      displayValue.value = null
      isAnimating.value = false
      return
    }

    if (prefersReducedMotion) {
      displayValue.value = formatValue(next, decimals)
      isAnimating.value = false
      return
    }

    const from = displayValue.value ?? 0
    const delta = next - from
    const stepCount = 10 + Math.floor(Math.random() * 8)
    const stepMs = durationMs / stepCount
    isAnimating.value = true

    for (let step = 1; step <= stepCount; step += 1) {
      const id = setTimeout(() => {
        if (step === stepCount) {
          displayValue.value = formatValue(next, decimals)
          isAnimating.value = false
          return
        }

        const progress = step / stepCount
        const jitter = (Math.random() - 0.5) * delta * 0.35
        const chaotic = from + delta * progress + jitter
        displayValue.value = formatValue(chaotic, decimals)
      }, step * stepMs)
      timeoutIds.push(id)
    }
  }

  watch(target, (value) => animateTo(value), { immediate: true })

  onScopeDispose(() => {
    clearTimers()
    isAnimating.value = false
  })

  return { displayValue, isAnimating }
}
