<script setup>
/**
 * One cute die-cut sticker (white edge + soft shadow). Decorative only.
 * Floating motion and position come from the parent through CSS variables:
 *   --x, --y (position), --r (tilt), --dur, --delay, --size
 */
defineProps({
  name: { type: String, required: true },
})
const INK = '#443750'
const today = new Date().getDate()
// Die-cut look: a thick white outline painted under each shape.
const cut = { stroke: '#fff', 'stroke-width': 5, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }
</script>

<template>
  <span class="sticker" aria-hidden="true">
    <span class="float">
      <svg viewBox="0 0 64 64">
        <template v-if="name === 'check'">
          <circle cx="32" cy="32" r="24" fill="#8BAF91" v-bind="cut" />
          <path d="M21 33 l7.5 7.5 L44 24" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />
        </template>

        <template v-else-if="name === 'star'">
          <path d="M32 8 L39.1 24.3 L56.7 26 L43.4 37.7 L47.3 55 L32 46 L16.7 55 L20.6 37.7 L7.3 26 L24.9 24.3 Z" fill="#E6C477" v-bind="cut" />
          <circle cx="28" cy="33" r="1.9" :fill="INK" />
          <circle cx="36" cy="33" r="1.9" :fill="INK" />
          <path d="M29.5 37.5 q2.5 2.6 5 0" fill="none" :stroke="INK" stroke-width="1.8" stroke-linecap="round" />
        </template>

        <template v-else-if="name === 'heart'">
          <path d="M32 54 C14 42 8 32 8 23 C8 15 14 10 21 10 C26 10 30 13 32 17 C34 13 38 10 43 10 C50 10 56 15 56 23 C56 32 50 42 32 54Z" fill="#D68C91" v-bind="cut" />
          <ellipse cx="20" cy="21" rx="4" ry="2.6" fill="#fff" opacity="0.6" transform="rotate(-35 20 21)" />
        </template>

        <template v-else-if="name === 'calendar'">
          <rect x="10" y="12" width="44" height="42" rx="8" fill="#F7F4FA" v-bind="cut" />
          <path d="M10 20 a8 8 0 0 1 8 -8 h28 a8 8 0 0 1 8 8 v6 h-44 z" fill="#8B72A8" />
          <rect x="20" y="7" width="5" height="10" rx="2.5" :fill="INK" />
          <rect x="39" y="7" width="5" height="10" rx="2.5" :fill="INK" />
          <text x="32" y="47" text-anchor="middle" font-size="19" font-weight="800" :fill="INK" font-family="inherit">{{ today }}</text>
        </template>

        <template v-else-if="name === 'cloud'">
          <path d="M18 47 C10 47 6 41 8 35 C10 29 16 27 20 29 C21 21 28 16 35 18 C41 19 45 24 45 29 C51 28 57 32 57 39 C57 44 53 47 48 47 Z" fill="#C9DCEB" v-bind="cut" />
          <circle cx="27" cy="37" r="1.9" :fill="INK" />
          <circle cx="38" cy="37" r="1.9" :fill="INK" />
          <path d="M30 41 q2.5 2.4 5 0" fill="none" :stroke="INK" stroke-width="1.8" stroke-linecap="round" />
          <ellipse cx="23" cy="41" rx="2.6" ry="1.5" fill="#D68C91" opacity="0.6" />
          <ellipse cx="42" cy="41" rx="2.6" ry="1.5" fill="#D68C91" opacity="0.6" />
        </template>

        <template v-else-if="name === 'cup'">
          <path d="M44 31 h3 a7 7 0 0 1 0 14 h-3" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" />
          <path d="M44 31 h3 a7 7 0 0 1 0 14 h-3" fill="none" stroke="#B9A3D1" stroke-width="4.5" stroke-linecap="round" />
          <path d="M13 26 h32 v16 a10 10 0 0 1 -10 10 h-12 a10 10 0 0 1 -10 -10 z" fill="#E8DFF2" v-bind="cut" />
          <path d="M29 33 c-2.2 -2.8 -6.5 -0.6 -4.5 2.6 l4.5 4.4 l4.5 -4.4 c2 -3.2 -2.3 -5.4 -4.5 -2.6z" fill="#D68C91" />
          <path class="steam" d="M23 20 c-3 -4 3 -6 0 -10 M33 20 c-3 -4 3 -6 0 -10" fill="none" stroke="#B9A3D1" stroke-width="2.6" stroke-linecap="round" />
        </template>

        <template v-else-if="name === 'sparkle'">
          <path d="M32 6 C34 24 40 30 58 32 C40 34 34 40 32 58 C30 40 24 34 6 32 C24 30 30 24 32 6Z" fill="#B9A3D1" v-bind="cut" />
        </template>

        <template v-else-if="name === 'flower'">
          <circle cx="32" cy="19" r="10" fill="#F2C6CF" v-bind="cut" />
          <circle cx="44.4" cy="28" r="10" fill="#F2C6CF" v-bind="cut" />
          <circle cx="39.6" cy="42.5" r="10" fill="#F2C6CF" v-bind="cut" />
          <circle cx="24.4" cy="42.5" r="10" fill="#F2C6CF" v-bind="cut" />
          <circle cx="19.6" cy="28" r="10" fill="#F2C6CF" v-bind="cut" />
          <circle cx="32" cy="32" r="7.5" fill="#E6C477" />
        </template>
      </svg>
    </span>
  </span>
</template>

<style scoped>
.sticker {
  position: absolute;
  left: var(--x, 0);
  top: var(--y, 0);
  width: var(--size, 64px);
  height: var(--size, 64px);
  pointer-events: none;
  animation: pop-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: var(--delay, 0ms);
}
.float {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(var(--r, 0deg));
  animation: drift var(--dur, 6s) ease-in-out infinite;
  animation-delay: var(--delay, 0ms);
  /* Own GPU layer: the shadowed drawing is painted once, then only moved. */
  will-change: transform;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 3px 5px rgba(68, 55, 80, 0.18));
}
.steam { opacity: 0.7; }

@keyframes pop-in {
  from { opacity: 0; transform: scale(0.3) rotate(-20deg); }
  to { opacity: 1; transform: none; }
}
@keyframes drift {
  0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
  50% { transform: translateY(-9px) rotate(calc(var(--r, 0deg) + 5deg)); }
}
@media (prefers-reduced-motion: reduce) {
  .sticker, .float { animation: none; }
}
</style>
