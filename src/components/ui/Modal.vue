<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useIsMobile } from '@/composables/useMediaQuery'

/**
 * Accessible dialog. Centered card on desktop, bottom sheet on mobile
 * (swipe the handle down to dismiss). Traps focus and restores it on close.
 */
const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  hideHeader: { type: Boolean, default: false },
  top: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const isMobile = useIsMobile()
const panel = ref(null)
const dragY = ref(0)
let lastFocus = null

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Tab' && panel.value) {
    const els = [...panel.value.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (!els.length) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocus = document.activeElement
      document.addEventListener('keydown', onKeydown, true)
      await nextTick()
      const auto = panel.value?.querySelector('[autofocus], [data-autofocus]')
      ;(auto ?? panel.value)?.focus({ preventScroll: true })
    } else {
      document.removeEventListener('keydown', onKeydown, true)
      dragY.value = 0
      lastFocus?.focus?.({ preventScroll: true })
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))

/* Swipe-to-dismiss for the mobile sheet handle */
let startY = 0
function onHandleDown(e) {
  if (!isMobile.value) return
  startY = e.clientY
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onHandleMove(e) {
  if (!startY) return
  dragY.value = Math.max(0, e.clientY - startY)
}
function onHandleUp() {
  if (dragY.value > 90) emit('close')
  dragY.value = 0
  startY = 0
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-root" :class="{ mobile: isMobile, top }">
        <div class="scrim" aria-hidden="true" @click="emit('close')" />
        <div
          ref="panel"
          class="panel"
          :class="[`size-${size}`]"
          role="dialog"
          aria-modal="true"
          :aria-label="title || undefined"
          tabindex="-1"
          :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined"
        >
          <div
            v-if="isMobile"
            class="handle-zone"
            @pointerdown="onHandleDown"
            @pointermove="onHandleMove"
            @pointerup="onHandleUp"
            @pointercancel="onHandleUp"
          >
            <span class="handle" />
          </div>
          <header v-if="!hideHeader" class="head">
            <h2 class="title">{{ title }}</h2>
            <slot name="header-actions" />
            <button class="icon-btn sm" type="button" aria-label="Close" @click="emit('close')"><X /></button>
          </header>
          <div class="body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--space-6);
}
.modal-root.top { place-items: start center; padding-top: 12vh; }
.scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}
.panel {
  position: relative;
  width: 100%;
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  outline: none;
  overflow: hidden;
}
.size-sm { max-width: 400px; }
.size-md { max-width: 520px; }
.size-lg { max-width: 680px; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
}
.title { flex: 1; font-size: var(--text-lg); font-weight: var(--weight-semibold); }
.body { padding: var(--space-2) var(--space-5) var(--space-5); overflow-y: auto; overscroll-behavior: contain; }
.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

/* Mobile bottom sheet */
.mobile { padding: 0; place-items: end stretch; }
.mobile.top { padding-top: 0; place-items: end stretch; }
.mobile .panel {
  max-width: none;
  max-height: 92dvh;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  border-bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
  transition: transform var(--dur) var(--ease-out);
}
.handle-zone { display: grid; place-items: center; padding: 10px 0 2px; touch-action: none; cursor: grab; }
.handle { width: 36px; height: 4px; border-radius: 4px; background: var(--border-strong); }
.mobile .head { padding-top: var(--space-2); }

/* Transitions: transform + opacity only */
.modal-enter-active, .modal-leave-active { transition: opacity var(--dur) var(--ease); }
/* A closing dialog must never swallow the next click. */
.modal-leave-active { pointer-events: none; }
.modal-enter-active .panel { transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur) var(--ease); }
.modal-leave-active .panel { transition: transform var(--dur) var(--ease), opacity var(--dur-fast) var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .panel, .modal-leave-to .panel { transform: translateY(8px) scale(0.98); opacity: 0; }
.mobile.modal-enter-from .panel, .mobile.modal-leave-to .panel { transform: translateY(100%); opacity: 1; }
/* Phones: snappier sheet so tapping feels instant. */
.mobile.modal-enter-active, .mobile.modal-leave-active { transition-duration: 150ms; }
.mobile.modal-enter-active .panel { transition: transform 180ms var(--ease-out); }
.mobile.modal-leave-active .panel { transition: transform 150ms var(--ease); }
</style>
