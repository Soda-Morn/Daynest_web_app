<script setup>
import { Check } from 'lucide-vue-next'

/** Round completion checkbox. Ring colour hints at priority. */
defineProps({
  checked: { type: Boolean, required: true },
  priority: { type: String, default: undefined },
  label: { type: String, required: true },
  size: { type: String, default: undefined },
})
defineEmits(['toggle'])
</script>

<template>
  <button
    type="button"
    class="check"
    :class="[`p-${priority ?? 'medium'}`, size ?? 'md', { checked }]"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="label"
    @click.stop="$emit('toggle')"
    @pointerdown.stop
  >
    <span class="ring"><Check class="tick" :stroke-width="3.2" /></span>
  </button>
</template>

<style scoped>
.check {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -4px;
  padding: 0;
  border: 0;
  background: transparent;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.check.sm { width: 22px; height: 22px; margin: -3px; }
@media (pointer: coarse) { .check { width: 36px; height: 36px; margin: -8px; } }
.ring {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.75px solid var(--ring);
  background: color-mix(in srgb, var(--ring) 8%, transparent);
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), transform var(--dur) var(--ease-out);
}
.sm .ring { width: 15px; height: 15px; border-width: 1.5px; }
.p-low { --ring: var(--prio-low); }
.p-medium { --ring: var(--prio-medium); }
.p-high { --ring: var(--prio-high); }
.p-urgent { --ring: var(--prio-urgent); }
.tick { width: 11px; height: 11px; color: var(--plum); opacity: 0; transform: scale(0.4); transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease-out); }
.sm .tick { width: 9px; height: 9px; }
.check:hover .ring { background: color-mix(in srgb, var(--ring) 18%, transparent); }
.check:hover .tick { opacity: 0.5; transform: scale(0.85); color: var(--ring); }
.checked .ring { background: var(--success); border-color: var(--success); animation: pop var(--dur-slow) var(--ease-out); }
.checked .tick, .check.checked:hover .tick { opacity: 1; transform: scale(1); color: var(--plum); }
@keyframes pop {
  0% { transform: scale(0.8); }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
</style>
