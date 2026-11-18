<script setup>
import { CalendarDays, CalendarRange, Ellipsis, ListTodo, Plus, Sun } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()

/** Pre-fill the date the user is looking at. */
function addTask() {
  ui.openQuickAddFor(route.name)
}
const items = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarRange },
  { to: '/more', label: 'More', icon: Ellipsis },
]
</script>

<template>
  <!-- Hidden on the month calendar, which stays clean like a paper calendar
       (tap a day, or "•••" → New task). -->
  <button v-if="!(route.name === 'calendar' && ui.calendarView === 'month')" type="button" class="fab" aria-label="New task" @click="addTask">
    <Plus :stroke-width="2.5" />
  </button>
  <nav class="bottom" aria-label="Main">
    <RouterLink v-for="i in items" :key="i.to" :to="i.to" class="tab">
      <component :is="i.icon" class="ic" />
      <span>{{ i.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: var(--weight-semibold);
  -webkit-tap-highlight-color: transparent;
  transition: color var(--dur-fast) var(--ease);
}
.ic { width: 22px; height: 22px; transition: transform var(--dur) var(--ease-out); }
.tab.router-link-active { color: var(--primary-text); }
.tab.router-link-active .ic { transform: translateY(-1px); }
.tab:active .ic { transform: scale(0.9); }
.fab {
  position: fixed;
  right: 18px;
  bottom: calc(var(--bottom-nav-height) + 16px + env(safe-area-inset-bottom));
  z-index: 41;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 16px;
  background: var(--primary);
  color: var(--primary-contrast);
  box-shadow: var(--shadow);
  transition: transform var(--dur) var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.fab:active { transform: scale(0.92); }
.fab svg { width: 26px; height: 26px; }
</style>
