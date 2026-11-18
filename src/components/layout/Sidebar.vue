<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { CalendarDays, CalendarRange, CircleCheckBig, Download, ListTodo, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-vue-next'
import CollectionsPanel from './CollectionsPanel.vue'
import DaynestLogo from '@/components/brand/DaynestLogo.vue'
import SyncStatus from './SyncStatus.vue'
import { canInstall, promptInstall } from '@/pwa/pwa'
import { useToast } from '@/composables/useToast'
import TaskCheck from '@/components/ui/TaskCheck.vue'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useTaskActions } from '@/composables/useTaskActions'
import { addDays, relativeDayLabel } from '@/utils/date'
import { isDone } from '@/utils/task'

const settings = useSettingsStore()
const ui = useUiStore()
const store = useTaskStore()
const collections = useCollectionsStore()
const actions = useTaskActions()

/**
 * Wide screens: the user's collapse preference. Tablets (< 1024px): an icon
 * rail by default that opens as an overlay, so content keeps its width.
 */
const narrow = useMediaQuery('(max-width: 1023px)')
const overlayOpen = computed(() => narrow.value && ui.mobileSidebarOpen)
const collapsed = computed(() => (narrow.value ? !ui.mobileSidebarOpen : settings.settings.sidebarCollapsed))
function toggle() {
  if (narrow.value) ui.mobileSidebarOpen = !ui.mobileSidebarOpen
  else settings.update({ sidebarCollapsed: !collapsed.value })
}
const route = useRoute()
const toast = useToast()
async function install() {
  if (await promptInstall()) toast.show('Daynest is installed. You can open it from your apps.')
}
watch(
  () => route.fullPath,
  () => (ui.mobileSidebarOpen = false),
)
watch(narrow, () => (ui.mobileSidebarOpen = false))

const todayCount = computed(() => (store.dayMap(ui.today, ui.today).get(ui.today) ?? []).filter((i) => !isDone(i.status)).length)
const overdueCount = computed(() => store.overdueInstances(ui.today).length)

/** Next open tasks after today, by date (cheap: two weeks of the index). */
const upcoming = computed(() => {
  const map = store.dayMap(addDays(ui.today, 1), addDays(ui.today, 14))
  const seen = new Set()
  const out = []
  for (const d of [...map.keys()].sort()) {
    for (const i of map.get(d)) {
      if (isDone(i.status) || seen.has(i.key)) continue
      seen.add(i.key)
      out.push(i)
      if (out.length === 6) return out
    }
  }
  return out
})

const nav = computed(() => [
  { to: '/today', label: 'Today', icon: Sun, count: todayCount.value + overdueCount.value },
  { to: '/tasks', label: 'My Tasks', icon: ListTodo, count: 0 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, count: 0 },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarRange, count: 0 },
  { to: '/completed', label: 'Completed', icon: CircleCheckBig, count: 0 },
])
</script>

<template>
  <div class="slot" :class="{ narrow }">
  <div v-if="overlayOpen" class="scrim" aria-hidden="true" @click="ui.mobileSidebarOpen = false" />
  <nav class="sidebar" :class="{ collapsed, overlay: overlayOpen }" aria-label="Main" @keydown.esc="ui.mobileSidebarOpen = false">
    <div class="brand">
      <DaynestLogo :size="28" :wordmark="!collapsed" class="brand-logo" />
      <button
        type="button"
        class="icon-btn sm collapse"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="toggle"
      >
        <PanelLeftOpen v-if="collapsed" />
        <PanelLeftClose v-else />
      </button>
    </div>

    <ul class="nav">
      <li v-for="n in nav" :key="n.to">
        <RouterLink :to="n.to" class="nav-link" :title="collapsed ? n.label : undefined">
          <component :is="n.icon" class="nav-ic" />
          <span class="lbl">{{ n.label }}</span>
          <span v-if="n.count" class="badge">{{ n.count }}</span>
        </RouterLink>
      </li>
    </ul>

    <div v-if="!collapsed" class="scroll">
      <CollectionsPanel />

      <section v-if="upcoming.length" class="up" aria-labelledby="sec-up">
        <h2 id="sec-up" class="section-title up-title">Upcoming</h2>
        <ul>
          <li v-for="i in upcoming" :key="i.key" class="up-row">
            <TaskCheck size="sm" :checked="i.status === 'completed'" :priority="i.priority" :label="`Complete ${i.title}`" @toggle="actions.toggleComplete(i)" />
            <button type="button" class="up-btn" @click="ui.openTask(i)">
              <span class="up-title-text">{{ i.title }}</span>
              <span class="up-meta"><span class="dot" :style="{ '--c': collections.colorOf(i.task.calendarId) }" />{{ relativeDayLabel(i.startDate, ui.today) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <div v-else class="flex-spacer" />

    <footer class="foot">
      <button v-if="canInstall && !collapsed" type="button" class="install" @click="install"><Download />Install Daynest</button>
      <SyncStatus :compact="collapsed" />
    </footer>
  </nav>
  </div>
</template>

<style scoped>
.slot { position: relative; height: 100%; flex-shrink: 0; }
/* On tablets the slot keeps the rail's width; the open sidebar floats over content. */
.slot.narrow { width: var(--sidebar-collapsed); }
.sidebar.overlay { position: absolute; left: 0; top: 0; z-index: 50; box-shadow: var(--shadow-lg); }
.scrim { position: fixed; inset: 0; z-index: 49; background: var(--scrim); }
.flex-spacer { flex: 1; }
.foot { display: grid; gap: 6px; padding: var(--space-2) 6px 0; border-top: 1px solid var(--border); }
.collapsed .foot { justify-items: center; padding-left: 0; padding-right: 0; }
.install {
  display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border: 0; border-radius: var(--radius-sm);
  background: var(--accent-soft); color: var(--accent-text); font-size: var(--text-sm); font-weight: var(--weight-medium);
}
.install:hover { background: color-mix(in srgb, var(--accent) 30%, transparent); }
.install svg { width: 15px; height: 15px; }
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: var(--sidebar-width);
  height: 100%;
  padding: var(--space-4) var(--space-3) var(--space-3);
  border-right: 1px solid var(--border);
  background: var(--bg-sidebar);
  transition: width var(--dur-slow) var(--ease-out);
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar.collapsed { width: var(--sidebar-collapsed); }
.brand { display: flex; align-items: center; gap: 10px; height: 36px; padding-left: 6px; }
.brand-logo { flex: 1; min-width: 0; white-space: nowrap; }
.collapsed .brand { flex-direction: column; height: auto; gap: var(--space-2); padding-left: 0; }
.collapsed .brand-logo { flex: none; }
.collapsed .lbl, .collapsed .badge { display: none; }
.nav { display: grid; gap: 2px; }
.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.nav-link:hover { background: var(--surface-hover); color: var(--text); }
.nav-link.router-link-active { background: var(--primary-soft); color: var(--primary-text); }
.collapsed .nav-link { justify-content: center; padding: 0; }
.nav-ic { width: 18px; height: 18px; flex-shrink: 0; }
.badge { margin-left: auto; font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--text-3); font-variant-numeric: tabular-nums; }
.router-link-active .badge { color: var(--primary-text); }
.scroll { flex: 1; min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: var(--space-5); padding-top: var(--space-3); margin: 0 calc(var(--space-3) * -1); padding-left: var(--space-3); padding-right: var(--space-3); }
.up { display: grid; gap: 2px; }
.up-title { padding: 0 12px 4px; }
.up-row { display: flex; align-items: center; gap: 10px; padding: 0 0 0 14px; border-radius: var(--radius-sm); }
.up-row:hover { background: var(--surface-hover); }
.up-btn { flex: 1; min-width: 0; display: grid; padding: 5px 8px 5px 0; border: 0; background: none; text-align: left; }
.up-title-text { font-size: var(--text-sm); font-weight: var(--weight-medium); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.up-meta { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--text-3); }
.up-meta .dot { width: 6px; height: 6px; }
</style>
