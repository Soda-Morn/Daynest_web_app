<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { DateKey } from '@/types/models'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { addDays, formatDate, startOfWeek } from '@/utils/date'
import { isDone } from '@/utils/task'

/**
 * Week strip for the Day planner: month heading, then the seven days of the
 * selected week as name + number. Tap a day to plan it; swipe (or use the
 * arrows) to move a week. Days with open tasks get a small dot.
 */
const ui = useUiStore()
const settings = useSettingsStore()
const store = useTaskStore()
const collections = useCollectionsStore()

const start = computed(() => startOfWeek(ui.selectedDate, settings.settings.weekStartsOn))
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(start.value, i)))
const heading = computed(() => `${formatDate(ui.selectedDate, { month: 'long' })}, ${ui.selectedDate.slice(0, 4)}`)

/** Up to three category colours per day, from one range query. */
const dots = computed(() => {
  const map = store.dayMap(days.value[0], days.value[6], collections.visibleCalendarIds)
  const out = new Map<DateKey, string[]>()
  for (const [d, list] of map) {
    const colors: string[] = []
    for (const i of list) {
      if (isDone(i.status)) continue
      const c = collections.colorOf(i.task.calendarId)
      if (!colors.includes(c)) colors.push(c)
      if (colors.length === 3) break
    }
    out.set(d, colors)
  }
  return out
})

function shift(weeks: number) {
  ui.selectedDate = addDays(ui.selectedDate, weeks * 7)
}

let sx = 0
let sy = 0
function onTouchStart(e: TouchEvent) {
  sx = e.touches[0].clientX
  sy = e.touches[0].clientY
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - sx
  const dy = e.changedTouches[0].clientY - sy
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1)
}

function onKey(e: KeyboardEvent, d: DateKey) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    ui.selectedDate = addDays(d, e.key === 'ArrowRight' ? 1 : -1)
    requestAnimationFrame(() => (document.querySelector('.ws-day[aria-selected="true"]') as HTMLElement | null)?.focus())
  }
}
</script>

<template>
  <div class="ws" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <div class="ws-head">
      <h2 class="ws-month">{{ heading }}</h2>
      <div class="ws-nav">
        <button v-if="ui.selectedDate !== ui.today" type="button" class="btn btn-soft btn-sm" @click="ui.selectedDate = ui.today">Today</button>
        <button type="button" class="icon-btn sm" aria-label="Previous week" @click="shift(-1)"><ChevronLeft /></button>
        <button type="button" class="icon-btn sm" aria-label="Next week" @click="shift(1)"><ChevronRight /></button>
      </div>
    </div>
    <Transition name="ws-fade" mode="out-in">
      <div :key="start" class="ws-days" role="tablist" aria-label="Days of the week">
        <button
          v-for="d in days"
          :key="d"
          type="button"
          role="tab"
          class="ws-day"
          :class="{ today: d === ui.today, selected: d === ui.selectedDate }"
          :aria-selected="d === ui.selectedDate"
          :tabindex="d === ui.selectedDate ? 0 : -1"
          :aria-label="formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' }) + (d === ui.today ? ', today' : '')"
          @click="ui.selectedDate = d"
          @keydown="onKey($event, d)"
        >
          <span class="ws-name">{{ formatDate(d, { weekday: 'short' }) }}</span>
          <span class="ws-num">{{ +d.slice(8) }}</span>
          <span class="ws-dots" aria-hidden="true">
            <span v-for="c in dots.get(d) ?? []" :key="c" class="dot" :style="{ '--c': c }" />
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ws { padding: var(--space-5) var(--space-5) var(--space-3); }
.ws-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.ws-month { font-size: var(--text-xl); font-weight: var(--weight-semibold); letter-spacing: -0.01em; color: var(--text); }
.ws-nav { display: flex; align-items: center; gap: 2px; }
.ws-nav .btn { margin-right: 6px; }
.ws-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.ws-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 0 8px;
  border: 0;
  border-radius: var(--radius-xl);
  background: transparent;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.ws-day:hover { background: var(--surface-hover); }
.ws-day:active { transform: scale(0.96); }
.ws-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-3); }
.ws-num { font-size: var(--text-lg); font-weight: var(--weight-bold); font-variant-numeric: tabular-nums; line-height: 1; }
.ws-dots { display: flex; gap: 3px; height: 5px; }
.ws-dots .dot { width: 5px; height: 5px; }
.today .ws-name, .today .ws-num { color: var(--primary-text); }
.today:not(.selected) .ws-num { text-decoration: underline 2px var(--accent); text-underline-offset: 5px; }
.selected, .selected:hover { background: var(--primary); }
.selected .ws-name, .selected .ws-num { color: var(--primary-contrast); }
.selected .ws-name { opacity: 0.85; }
.ws-fade-enter-active, .ws-fade-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.ws-fade-enter-from, .ws-fade-leave-to { opacity: 0; }
@media (max-width: 767px) {
  .ws { padding: var(--space-2) var(--space-3) var(--space-2); }
  .ws-head { margin-bottom: var(--space-3); padding: 0 var(--space-1); }
  .ws-name { font-size: var(--text-xs); }
  .ws-day { padding: 8px 0 7px; gap: 5px; }
}
</style>
