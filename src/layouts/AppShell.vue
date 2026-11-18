<script setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { applyUpdate, online, updateReady } from '@/pwa/pwa'
import { useToast } from '@/composables/useToast'
import Sidebar from '@/components/layout/Sidebar.vue'
import TopBar from '@/components/layout/TopBar.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import TaskDetail from '@/components/task/TaskDetail.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import DialogHost from '@/components/ui/DialogHost.vue'
import DragLayer from '@/components/calendar/DragLayer.vue'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useShortcuts } from '@/composables/useShortcuts'
import { useReminders } from '@/composables/useReminders'
import { useUiStore } from '@/stores/ui'

// Dialogs that aren't needed for first paint are split out.
const loadQuickAdd = () => import('@/components/task/QuickAdd.vue')
const QuickAdd = defineAsyncComponent(loadQuickAdd)
const SettingsDialog = defineAsyncComponent(() => import('@/components/layout/SettingsDialog.vue'))
const CollectionDialog = defineAsyncComponent(() => import('@/components/layout/CollectionDialog.vue'))

const isMobile = useIsMobile()
const ui = useUiStore()
const topbar = ref(null)

useShortcuts(() => topbar.value?.focusSearch())
useReminders()
onMounted(() => {
  ui.startClock()
  // Fetch the "new task" dialog once the app is idle, so the first tap on + is instant.
  const preload = () => void loadQuickAdd().catch(() => {})
  if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 3000 })
  else setTimeout(preload, 1500)
})
onBeforeUnmount(() => ui.stopClock())

/* ---- PWA: updates, connectivity, home-screen shortcut ---- */
const toast = useToast()
watch(
  updateReady,
  (ready) => {
    if (ready) toast.show('A new version of Daynest is ready.', { action: { label: 'Reload', run: applyUpdate }, timeout: 24 * 3600_000 })
  },
  { immediate: true },
)
watch(online, (on) => {
  if (!on) toast.show('You’re offline. Keep going — changes are saved on this device.', { timeout: 5000 })
})
const currentRoute = useRoute()
const router = useRouter()
watch(
  () => currentRoute.query.new,
  (n) => {
    if (n === undefined) return
    ui.openQuickAddFor(currentRoute.name)
    const { new: _drop, ...rest } = currentRoute.query
    void router.replace({ query: rest })
  },
  { immediate: true },
)
</script>

<template>
  <div class="shell" :class="{ mobile: isMobile }">
    <a href="#main" class="skip">Skip to content</a>
    <Sidebar v-if="!isMobile" />
    <div class="main-col">
      <TopBar ref="topbar" />
      <div class="work">
        <main id="main" class="main" tabindex="-1">
          <RouterView v-slot="{ Component, route }">
            <Transition name="page">
              <component :is="Component" :key="route.name" />
            </Transition>
          </RouterView>
        </main>
        <TaskDetail />
      </div>
    </div>
    <BottomNav v-if="isMobile" />
    <QuickAdd />
    <SettingsDialog />
    <CollectionDialog />
    <DialogHost />
    <ToastHost />
    <DragLayer />
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100%; height: 100dvh; overflow: hidden; }
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.work { position: relative; flex: 1; min-height: 0; display: flex; }
.main { flex: 1; min-width: 0; min-height: 0; outline: none; }
.skip { position: absolute; left: -999px; top: 8px; z-index: 100; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow); }
.skip:focus { left: 8px; }
/* The new page appears at once and fades in; the old page is removed
   immediately (hidden so it never pushes the new one down). */
.page-enter-active { transition: opacity 140ms var(--ease), transform 140ms var(--ease); }
.page-enter-from { opacity: 0; transform: translateY(4px); }
.page-leave-active { display: none; }
</style>
