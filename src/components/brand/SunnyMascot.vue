<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * "Sunny", the sun from the Daynest logo, sitting in its nest.
 *
 * Moods: idle · look (down at the form) · shy (covers eyes) · peek ·
 * happy (^^) · sad · sleepy (closed eyes, z) · curious (glances aside).
 *
 * Performance:
 *  - By default Sunny is a still drawing: no running animations, no timers.
 *    Mood changes are short CSS transitions. Safe to use anywhere in the app.
 *  - `animated` (sign-in pages only) adds gentle bobbing, turning rays and
 *    blinking. The endless parts move whole HTML layers with `transform`
 *    (GPU-composited, no redraw); blinking is a class toggle every few seconds.
 *  - Everything respects "reduce motion".
 */
const props = defineProps({
  mood: { type: String, default: 'idle' },
  animated: { type: Boolean, default: false },
  /** Hide the nest (small badge use). */
  noNest: { type: Boolean, default: false },
})
const INK = '#443750'
const rays = Array.from({ length: 8 }, (_, i) => i * 45)

const blink = ref(false)
let timer = null
function scheduleBlink() {
  timer = setTimeout(() => {
    blink.value = true
    timer = setTimeout(() => {
      blink.value = false
      scheduleBlink()
    }, 140)
  }, 2800 + Math.random() * 3200)
}
onMounted(() => {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (props.animated && !reduce) scheduleBlink()
})
onBeforeUnmount(() => clearTimeout(timer))

const closedEyes = (m) => m === 'happy' || m === 'sleepy'
/** Without the nest, crop tightly around the sun so small badges stay readable. */
const box = props.noNest ? '28 8 84 84' : '0 0 140 118'
</script>

<template>
  <div class="sunny" :class="[`m-${mood}`, { blink, animated, 'no-nest': noNest }]" aria-hidden="true">
    <div class="bob">
      <svg class="rays" :viewBox="box">
        <rect v-for="a in rays" :key="a" x="66.5" y="10" width="7" height="13" rx="3.5" fill="#E6C477" :transform="`rotate(${a} 70 56)`" />
      </svg>

      <svg class="art" :viewBox="box">
        <g class="body">
          <circle cx="70" cy="56" r="30" fill="#F2D27F" :stroke="INK" stroke-width="2.6" />
          <ellipse cx="59" cy="40" rx="7" ry="4.5" fill="#fff" opacity="0.45" transform="rotate(-25 59 40)" />

          <g class="face">
            <!-- eyes -->
            <g v-if="mood === 'happy'">
              <path d="M55 56 q5 -6 10 0" fill="none" :stroke="INK" stroke-width="2.6" stroke-linecap="round" />
              <path d="M75 56 q5 -6 10 0" fill="none" :stroke="INK" stroke-width="2.6" stroke-linecap="round" />
            </g>
            <g v-else-if="mood === 'sleepy'">
              <path d="M55 54 q5 4 10 0" fill="none" :stroke="INK" stroke-width="2.6" stroke-linecap="round" />
              <path d="M75 54 q5 4 10 0" fill="none" :stroke="INK" stroke-width="2.6" stroke-linecap="round" />
            </g>
            <g v-if="!closedEyes(mood)" class="eyes">
              <ellipse cx="60" cy="54" rx="3.4" ry="4.2" :fill="INK" />
              <ellipse cx="80" cy="54" rx="3.4" ry="4.2" :fill="INK" />
              <circle cx="61.2" cy="52.4" r="1.2" fill="#fff" />
              <circle cx="81.2" cy="52.4" r="1.2" fill="#fff" />
            </g>
            <!-- blush -->
            <ellipse cx="52" cy="63" rx="4.6" ry="2.6" fill="#D68C91" opacity="0.55" />
            <ellipse cx="88" cy="63" rx="4.6" ry="2.6" fill="#D68C91" opacity="0.55" />
            <!-- mouth -->
            <path v-if="mood === 'happy'" d="M63 63 q7 9 14 0 z" :fill="INK" />
            <path v-else-if="mood === 'sad'" d="M64 68 q6 -5 12 0" fill="none" :stroke="INK" stroke-width="2.4" stroke-linecap="round" />
            <path v-else-if="mood === 'shy' || mood === 'peek'" d="M66 66 q2 -2 4 0 t4 0" fill="none" :stroke="INK" stroke-width="2.2" stroke-linecap="round" />
            <ellipse v-else-if="mood === 'sleepy' || mood === 'curious'" cx="70" cy="66" rx="2.6" ry="2.2" :fill="INK" />
            <path v-else d="M64 63 q6 6 12 0" fill="none" :stroke="INK" stroke-width="2.4" stroke-linecap="round" />
          </g>
        </g>

        <!-- sleepy z's -->
        <g v-if="mood === 'sleepy'" :fill="INK" font-weight="800" font-family="inherit">
          <text x="100" y="34" font-size="13">z</text>
          <text x="110" y="22" font-size="9" opacity="0.7">z</text>
        </g>

        <template v-if="!noNest">
          <!-- nest -->
          <path d="M18 74 C34 81 106 81 122 74 C121 97 100 112 70 112 S19 97 18 74Z" fill="#F7F4FA" :stroke="INK" stroke-width="2.6" stroke-linejoin="round" />
          <path d="M30 88 C50 95 90 95 110 88" fill="none" stroke="#B9A3D1" stroke-width="3" stroke-linecap="round" />
          <path d="M42 100 C56 105 84 105 98 100" fill="none" stroke="#B9A3D1" stroke-width="3" stroke-linecap="round" />

          <!-- paws -->
          <g class="paw paw-l">
            <ellipse cx="44" cy="77" rx="9.5" ry="8" fill="#EBC45F" :stroke="INK" stroke-width="2.6" />
            <path d="M40 72.5 v3.5 M44 71.5 v4 M48 72.5 v3.5" :stroke="INK" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
          </g>
          <g class="paw paw-r">
            <ellipse cx="96" cy="77" rx="9.5" ry="8" fill="#EBC45F" :stroke="INK" stroke-width="2.6" />
            <path d="M92 72.5 v3.5 M96 71.5 v4 M100 72.5 v3.5" :stroke="INK" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
          </g>
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.sunny { position: relative; width: 100%; aspect-ratio: 140 / 118; }
.bob { position: absolute; inset: 0; }
.rays, .art { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rays { transform-origin: 50% 47.46%; } /* sun centre (70, 56) of 140 × 118 */
.no-nest { aspect-ratio: 1; }
.no-nest .rays { transform-origin: 50% 57.14%; } /* (70, 56) in the 84 × 84 crop */

/* Living version (sign-in pages): GPU-composited layers only. */
.animated .bob { animation: bob 3.2s ease-in-out infinite; will-change: transform; }
.animated .rays { animation: spin 24s linear infinite; will-change: transform; }

/* Inside the drawing: only short transitions on mood changes / blinks. */
.face { transition: transform 260ms var(--ease-out); }
.eyes { transform-box: fill-box; transform-origin: center; transition: transform 70ms ease; }
.blink .eyes { transform: scaleY(0.1); }
.paw { transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.body { transform-box: view-box; transform-origin: 70px 80px; }

.m-look .face { transform: translate(0, 3px); }
.m-curious .face { transform: translate(4px, -1px); }
.m-shy .paw-l { transform: translate(17px, -22px); }
.m-shy .paw-r { transform: translate(-17px, -22px); }
.m-peek .paw-l { transform: translate(17px, -22px); }
.m-peek .paw-r { transform: translate(-8px, -4px); }
.m-sad .face { transform: translate(0, 2px); }
.animated.m-happy .body { animation: hop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.animated.m-sad .body { animation: shake 0.45s ease-in-out; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes hop { 0% { transform: translateY(0); } 40% { transform: translateY(-10px) scale(1.03); } 100% { transform: translateY(0); } }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

@media (prefers-reduced-motion: reduce) {
  .animated .bob, .animated .rays, .animated.m-happy .body, .animated.m-sad .body { animation: none; }
  .face, .paw, .eyes { transition: none; }
}
</style>
