<script setup>
import SunnyMascot from '@/components/brand/SunnyMascot.vue'

/**
 * Friendly empty state. With `mood`, Sunny (the Daynest mascot) appears
 * instead of the icon badge — a still drawing with a one-time pop-in,
 * so it costs nothing after it appears.
 */
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  text: { type: String, default: '' },
  mood: { type: String, default: '' },
})
</script>

<template>
  <div class="empty">
    <div v-if="mood" class="sunny-wrap"><SunnyMascot :mood="mood" /></div>
    <div v-else-if="icon" class="badge"><component :is="icon" /></div>
    <p class="title">{{ title }}</p>
    <p v-if="text" class="text">{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty { display: grid; justify-items: center; gap: 6px; padding: var(--space-10) var(--space-4); text-align: center; }
.badge {
  display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 6px;
  border-radius: 16px; background: var(--primary-soft); color: var(--primary-text);
}
.badge svg { width: 24px; height: 24px; }
.sunny-wrap {
  width: 112px;
  margin-bottom: var(--space-1);
  animation: sunny-in 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.title { font-weight: var(--weight-semibold); font-size: var(--text-md); }
.text { color: var(--text-3); max-width: 320px; font-size: var(--text-sm); }
@keyframes sunny-in {
  from { opacity: 0; transform: translateY(10px) scale(0.85); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .sunny-wrap { animation: none; } }
</style>
