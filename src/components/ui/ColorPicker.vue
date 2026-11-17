<script setup>
import { Check } from 'lucide-vue-next'
import { PALETTE } from '@/constants'

defineProps({
  modelValue: { type: String, required: true },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="swatches" role="radiogroup" aria-label="Colour">
    <button
      v-for="c in PALETTE"
      :key="c.value"
      type="button"
      class="swatch"
      role="radio"
      :aria-checked="modelValue === c.value"
      :aria-label="c.name"
      :title="c.name"
      :style="{ '--c': c.value }"
      @click="$emit('update:modelValue', c.value)"
    >
      <Check v-if="modelValue === c.value" :stroke-width="3" />
    </button>
  </div>
</template>

<style scoped>
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 0;
  background: var(--c);
  color: #fff;
  transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.swatch:hover { transform: scale(1.1); }
.swatch[aria-checked='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--c); }
.swatch svg { width: 14px; height: 14px; }
@media (pointer: coarse) { .swatch { width: 36px; height: 36px; } }
</style>
