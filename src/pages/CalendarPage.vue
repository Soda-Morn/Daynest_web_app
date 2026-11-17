<script setup>
import { computed, defineAsyncComponent, watch } from 'vue'
import MonthView from '@/components/calendar/MonthView.vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useCalendarNav } from '@/composables/useCalendarNav'
import { addDays } from '@/utils/date'

// Views other than the default month view are loaded on demand.
const TimeGridView = defineAsyncComponent(() => import('@/components/calendar/TimeGridView.vue'))
const AgendaView = defineAsyncComponent(() => import('@/components/calendar/AgendaView.vue'))
const DayPlanner = defineAsyncComponent(() => import('@/components/calendar/DayPlanner.vue'))

const ui = useUiStore()
const settings = useSettingsStore()
const isMobile = useIsMobile()
const nav = useCalendarNav()

const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(nav.weekStart.value, i)))

// Phone and desktop each open in their own remembered view.
watch(isMobile, (m) => (ui.calendarView = m ? settings.settings.calendarViewMobile : settings.settings.calendarView), { immediate: true })

function openDay(d) {
  ui.selectedDate = d
  nav.setView('day')
}
</script>

<template>
  <div class="cal-page" :class="{ mobile: isMobile }">
    <template v-if="isMobile">
      <div v-if="ui.calendarView === 'month'" class="month-phone"><MonthView @open-day="openDay" /></div>
      <div v-else-if="ui.calendarView === 'week' || ui.calendarView === 'day'" class="surface flush"><DayPlanner /></div>
      <AgendaView v-else />
    </template>
    <template v-else>
      <AgendaView v-if="ui.calendarView === 'agenda'" />
      <div v-else class="surface">
        <MonthView v-if="ui.calendarView === 'month'" @open-day="openDay" />
        <TimeGridView v-else-if="ui.calendarView === 'week'" :days="weekDays" @open-day="openDay" />
        <DayPlanner v-else />
      </div>
    </template>
  </div>
</template>

<style scoped>
.cal-page { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.surface {
  flex: 1;
  min-height: 0;
  margin: 0 var(--space-6) var(--space-6);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}
.surface.flush { margin: 0; border-radius: 0; border-left: 0; border-right: 0; padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom)); }
@media (max-width: 1023px) { .surface { margin: 0 var(--space-3) var(--space-3); } }
/* Phone month: a soft white card on the cream page, above the bottom bar. */
.month-phone {
  flex: 1;
  min-height: 0;
  margin: var(--space-1) var(--space-2) calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + var(--space-2));
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
</style>
