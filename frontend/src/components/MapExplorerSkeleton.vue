<script setup lang="ts">
defineProps<{
  message?: string
}>()
</script>

<template>
  <div
    class="story-map-shell flex min-h-[min(68vh,520px)] items-center justify-center p-8"
    role="status"
    aria-live="polite"
  >
    <p class="story-label text-center normal-case">
      {{ message ?? 'Sketching the map explorer…' }}
    </p>
  </div>
</template>
