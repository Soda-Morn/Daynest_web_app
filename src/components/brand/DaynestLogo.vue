<script setup>
import { APP_NAME } from '@/constants/brand'

/**
 * Daynest mark (a sun resting in a woven nest) with optional wordmark.
 * The tile colours are fixed brand colours (Soft Purple, Soft Cream, Muted Lilac, Warm Yellow) so the mark looks identical to the
 * favicon and installed app icon in both themes.
 */
defineProps({
  size: { type: Number, default: 30 },
  wordmark: { type: Boolean, default: true },
})
</script>

<template>
  <span class="logo" :aria-label="APP_NAME" role="img">
    <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="mark">
      <rect width="64" height="64" rx="15" fill="#8B72A8" />
      <circle cx="32" cy="29" r="11.5" fill="#E6C477" />
      <path d="M9 33C17.5 36 46.5 36 55 33C54.5 45 45 53 32 53S9.5 45 9 33Z" fill="#F7F4FA" />
      <path d="M16 41.5C24 44 40 44 48 41.5" fill="none" stroke="#B9A3D1" stroke-width="2.6" stroke-linecap="round" />
    </svg>
    <span v-if="wordmark" class="word" aria-hidden="true">{{ APP_NAME }}</span>
  </span>
</template>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 10px; }
.mark { flex-shrink: 0; display: block; }
.word {
  font-size: 1.2rem;
  font-weight: var(--weight-bold);
  letter-spacing: -0.03em;
  color: var(--brand-ink);
  line-height: 1;
}
</style>
