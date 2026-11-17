<script setup>
import { X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

function runAction(t) {
  t.action?.run()
  dismiss(t.id)
}
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone">
        <span class="msg">{{ t.message }}</span>
        <button v-if="t.action" type="button" class="action" @click="runAction(t)">{{ t.action.label }}</button>
        <button type="button" class="close" aria-label="Dismiss" @click="dismiss(t.id)"><X /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: var(--space-6);
  z-index: 90;
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100vw - 32px);
  pointer-events: none;
}
@media (max-width: 767px) {
  .toasts { bottom: calc(var(--bottom-nav-height) + 16px + env(safe-area-inset-bottom)); }
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  max-width: 100%;
  padding: 6px 6px 6px 16px;
  border-radius: var(--radius);
  background: var(--toast-bg);
  color: var(--toast-text);
  box-shadow: var(--shadow-lg);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  pointer-events: auto;
}
.toast.error { background: var(--danger); color: var(--plum); }
.msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action {
  height: 32px; padding: 0 12px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--toast-action); font-weight: var(--weight-semibold);
}
.action:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; opacity: 0.6; }
.close:hover { opacity: 1; }
.close svg { width: 16px; height: 16px; }
.toast-enter-active, .toast-leave-active { transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease-out); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px) scale(0.97); }
</style>
