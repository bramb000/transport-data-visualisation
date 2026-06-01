<script setup lang="ts">
defineProps<{
  message?: string
}>()
</script>

<template>
  <section class="tl-section" aria-labelledby="map-skeleton-heading">
    <h2 id="map-skeleton-heading" class="tl-h2">A-to-B map explorer</h2>
    <div
      class="tl-map-frame flex min-h-[min(68vh,520px)] items-center justify-center p-8"
      role="status"
      aria-live="polite"
    >
      <p class="tl-body-muted text-center">{{ message ?? 'Loading map explorer…' }}</p>
    </div>
  </section>
</template>
