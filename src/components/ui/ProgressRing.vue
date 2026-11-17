<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, required: true },
  total: { type: Number, required: true },
  size: { type: Number, default: 76 },
  stroke: { type: Number, default: 8 },
})
const r = computed(() => (props.size - props.stroke) / 2)
const circ = computed(() => 2 * Math.PI * r.value)
const pct = computed(() => (props.total ? Math.min(1, props.value / props.total) : 0))
</script>

<template>
  <div class="ring" :style="{ width: size + 'px', height: size + 'px' }" role="img" :aria-label="`${value} of ${total} tasks completed`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <circle :cx="size / 2" :cy="size / 2" :r="r" class="track" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        class="bar"
        :stroke-width="stroke"
        :stroke-dasharray="circ"
        :stroke-dashoffset="circ * (1 - pct)"
      />
    </svg>
    <span class="label">{{ Math.round(pct * 100) }}<small>%</small></span>
  </div>
</template>

<style scoped>
.ring { position: relative; display: grid; place-items: center; flex-shrink: 0; }
svg { position: absolute; inset: 0; transform: rotate(-90deg); }
circle { fill: none; stroke-linecap: round; }
.track { stroke: var(--surface-sunken); }
.bar { stroke: var(--primary); transition: stroke-dashoffset var(--dur-slow) var(--ease-out); }
.label { font-size: var(--text-lg); font-weight: var(--weight-bold); letter-spacing: -0.02em; }
small { font-size: 0.65em; color: var(--text-3); font-weight: var(--weight-semibold); }
</style>
