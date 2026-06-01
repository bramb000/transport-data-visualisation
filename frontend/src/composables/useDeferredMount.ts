import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** Mount heavy UI (e.g. MapLibre) only when a section enters the viewport. */
export function useDeferredMount(
  targetRef: Ref<HTMLElement | null>,
  options: IntersectionObserverInit = { rootMargin: '200px 0px' },
) {
  const isReady = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    const element = targetRef.value
    if (!element) {
      isReady.value = true
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      isReady.value = true
      return
    }

    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        isReady.value = true
        observer?.disconnect()
        observer = null
      }
    }, options)

    observer.observe(element)
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { isReady }
}
