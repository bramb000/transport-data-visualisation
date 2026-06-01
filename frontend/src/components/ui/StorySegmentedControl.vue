<script setup lang="ts" generic="T extends string">
export interface SegmentOption<V extends string = string> {
  value: V
  label: string
}

const model = defineModel<T>({ required: true })

defineProps<{
  options: SegmentOption<T>[]
  groupLabel: string
}>()
</script>

<template>
  <div class="tl-segment" role="group" :aria-label="groupLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="tl-segment__item"
      :class="{ 'tl-segment__item--active': model === option.value }"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
