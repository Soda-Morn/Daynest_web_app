<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

/**
 * Anchored floating panel (menus, pickers). Positions itself with fixed
 * coordinates, flips/clamps to stay on screen, closes on outside click or
 * Escape and supports arrow-key navigation between items.
 */
const props = withDefaults(defineProps<{ placement?: 'bottom-start' | 'bottom-end'; width?: number; label?: string }>(), {
  placement: 'bottom-start',
  width: 0,
  label: '',
})
const emit = defineEmits<{ open: []; close: [] }>()

const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0, maxHeight: 400 })

function place() {
  const el = trigger.value?.firstElementChild as HTMLElement | null
  if (!el || !panel.value) return
  const r = el.getBoundingClientRect()
  const pw = panel.value.offsetWidth
  const ph = panel.value.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = props.placement === 'bottom-end' ? r.right - pw : r.left
  left = Math.max(8, Math.min(left, vw - pw - 8))
  let top = r.bottom + 6
  const below = vh - top - 8
  if (ph > below && r.top - 6 - ph > 8) top = r.top - 6 - ph
  pos.value = { top: Math.max(8, top), left, maxHeight: Math.max(160, Math.max(below, r.top - 14)) }
}

function items(): HTMLElement[] {
  return panel.value ? [...panel.value.querySelectorAll<HTMLElement>('[role^="menuitem"], [data-menu-item]')] : []
}

async function show() {
  if (open.value) return
  open.value = true
  emit('open')
  await nextTick()
  place()
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  const auto = panel.value?.querySelector<HTMLElement>('[data-autofocus]')
  ;(auto ?? items()[0] ?? panel.value)?.focus({ preventScroll: true })
}

function close(returnFocus = true) {
  if (!open.value) return
  open.value = false
  emit('close')
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
  if (returnFocus === true) (trigger.value?.firstElementChild as HTMLElement | null)?.focus?.({ preventScroll: true })
}

function toggle() {
  if (open.value) close()
  else void show()
}

function onOutside(e: PointerEvent) {
  const t = e.target as Node
  if (panel.value?.contains(t) || trigger.value?.contains(t)) return
  close(false)
}

function onResize() {
  close(false)
}

function onScroll(e: Event) {
  if (panel.value && panel.value.contains(e.target as Node)) return
  close(false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const list = items()
  if (!list.length) return
  e.preventDefault()
  const i = list.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
  list[next].focus()
}

onBeforeUnmount(() => close(false))

defineExpose({ open: show, close, toggle })
</script>

<template>
  <span ref="trigger" class="dd-trigger">
    <slot name="trigger" :toggle="toggle" :open="open" />
  </span>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="open"
        ref="panel"
        class="dd-panel"
        role="menu"
        :aria-label="label || undefined"
        tabindex="-1"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', maxHeight: pos.maxHeight + 'px', width: width ? width + 'px' : undefined }"
        @keydown="onKeydown"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dd-trigger { display: contents; }
.dd-panel {
  position: fixed;
  z-index: 80;
  min-width: 200px;
  max-width: calc(100vw - 16px);
  overflow-y: auto;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  outline: none;
}
</style>

<style>
/* Shared menu item styles (unscoped so slot content can use them). */
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--text-base);
  text-align: left;
}
.menu-item:hover, .menu-item:focus-visible { background: var(--surface-hover); outline: none; }
.menu-item svg { width: var(--icon); height: var(--icon); color: var(--text-3); flex-shrink: 0; }
.menu-item .hint { margin-left: auto; color: var(--text-3); font-size: var(--text-sm); }
.menu-item.danger, .menu-item.danger svg { color: var(--danger); }
.menu-item[aria-checked='true'] { color: var(--primary-text); font-weight: var(--weight-medium); }
.menu-sep { height: 1px; margin: 6px 4px; background: var(--border); }
.menu-label { padding: 6px 10px 4px; font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
@media (pointer: coarse) { .menu-item { min-height: 44px; } }
</style>
