<script setup lang="ts" generic="T extends string">
defineProps<{ modelValue: T; options: { value: T; label: string }[]; label: string }>()
defineEmits<{ 'update:modelValue': [T] }>()
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.value"
      class="seg-btn"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: var(--radius-sm); background: var(--surface-sunken); }
.seg-btn {
  height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent;
  color: var(--text-2); font-size: var(--text-sm); font-weight: var(--weight-medium);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.seg-btn:hover { color: var(--text); }
.seg-btn[aria-checked='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
@media (pointer: coarse) { .seg-btn { height: 34px; } }
</style>
