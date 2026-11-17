<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CloudCheck, CloudOff, HardDriveDownload, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import { saveStatus, persistence } from '@/services/persistence'
import { cloudEnabled } from '@/services/supabase'
import { syncStatus } from '@/services/sync'
import { currentSync } from '@/composables/useBootstrap'
import { online } from '@/pwa/pwa'

/**
 * Where your changes are. Local-only mode: saved on this device. Signed in:
 * also whether they've reached your account (offline never blocks work —
 * changes wait on the device and sync later).
 */
defineProps({
  compact: { type: Boolean, default: false },
})

// Normal saves finish in milliseconds; only show "Saving…" if one lingers,
// so the label doesn't flicker on every keystroke.
const slow = ref(false)
let timer = null
watch(
  () => saveStatus.value.state,
  (st) => {
    if (timer) clearTimeout(timer)
    if (st === 'saving') timer = setTimeout(() => (slow.value = true), 600)
    else slow.value = false
  },
)
onBeforeUnmount(() => timer && clearTimeout(timer))

const view = computed(() => {
  const s = saveStatus.value
  if (s.state === 'error')
    return {
      tone: 'error',
      icon: TriangleAlert,
      label: 'Couldn’t save — retrying',
      hint: `${s.pending} change${s.pending === 1 ? '' : 's'} waiting. Retrying automatically.`,
    }
  if (s.state === 'saving' && slow.value)
    return { tone: 'busy', icon: LoaderCircle, label: 'Saving…', hint: 'Saving your changes on this device.' }
  if (cloudEnabled) {
    const c = syncStatus.value
    const waiting = c.pending ? ` · ${c.pending} waiting` : ''
    if (!online.value || c.state === 'offline')
      return {
        tone: 'offline',
        icon: CloudOff,
        label: `Offline${waiting}`,
        hint: 'You can keep working. Changes are saved on this device and sync when you’re back online.',
      }
    if (c.state === 'error')
      return { tone: 'error', icon: TriangleAlert, label: 'Sync problem', hint: c.error ?? 'Some changes couldn’t sync.' }
    if (c.state === 'syncing' || c.pending)
      return { tone: 'busy', icon: RefreshCw, label: `Syncing${waiting}`, hint: 'Sending your changes to your account.' }
    return { tone: 'ok', icon: CloudCheck, label: 'Synced', hint: 'All changes are saved to your Daynest account.' }
  }
  if (!online.value)
    return {
      tone: 'offline',
      icon: CloudOff,
      label: 'Offline · saved on this device',
      hint: 'You can keep working. Everything is stored on this device.',
    }
  return {
    tone: 'ok',
    icon: HardDriveDownload,
    label: 'Saved on this device',
    hint: 'All changes are stored on this device and shared with your other Daynest windows.',
  }
})
</script>

<template>
  <div class="sync" :class="[view.tone, { compact }]" role="status" :title="view.hint" aria-live="polite">
    <component :is="view.icon" class="ic" :class="{ spin: view.tone === 'busy' }" aria-hidden="true" />
    <span class="lbl">{{ view.label }}</span>
    <button v-if="view.tone === 'error' && !compact" type="button" class="retry" @click="cloudEnabled ? currentSync()?.push() : persistence.flush()">Retry now</button>
  </div>
</template>

<style scoped>
.sync { display: flex; align-items: center; gap: 8px; min-height: 28px; font-size: var(--text-xs); color: var(--text-3); }
.ic { width: 14px; height: 14px; flex-shrink: 0; }
.ok .ic { color: var(--success); }
.offline { color: var(--warning-text); }
.error { color: var(--danger-text); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retry { margin-left: auto; border: 0; background: none; padding: 2px 4px; color: inherit; font-weight: var(--weight-semibold); text-decoration: underline; font-size: var(--text-xs); }
.compact .lbl { display: none; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
