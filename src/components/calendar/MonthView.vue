<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import EventChip from './EventChip.vue'
import DayListModal from './DayListModal.vue'
import SunnyMascot from '@/components/brand/SunnyMascot.vue'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { dragState } from '@/composables/useDragTask'
import { useCalendarNav } from '@/composables/useCalendarNav'
import { layoutWeekRow } from '@/utils/calendarLayout'
import { addDays, formatDate, isSameMonth, monthGrid, weekday, weekdayNames } from '@/utils/date'

/**
 * Month grid in a clean, line-free style: centred day numbers (Sunday rose,
 * Saturday blue), faded days outside the month, and small pastel pills with
 * a coloured edge — multi-day tasks span across the days they cover.
 * Instances for the visible weeks are fetched once and laid out per week
 * row; the number of lanes adapts to the cell height ("+N" for overflow).
 * Click or tap a day to see its tasks in a popup (with a quick add).
 */
const emit = defineEmits(['openDay'])
const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()
const settings = useSettingsStore()
const isMobile = useIsMobile()

const LANE_H = computed(() => (isMobile.value ? 22 : 24))
const HEADER_H = computed(() => (isMobile.value ? 30 : 34))

const weeks = computed(() => monthGrid(ui.selectedDate, settings.settings.weekStartsOn))
const names = computed(() => {
  const short = weekdayNames(settings.settings.weekStartsOn, 'short')
  // Weekday index of each column, for Sunday/Saturday colouring.
  return short.map((label, i) => ({ label, wd: (i + settings.settings.weekStartsOn) % 7 }))
})
const range = computed(() => ({ start: weeks.value[0][0], end: weeks.value[weeks.value.length - 1][6] }))

/** Only the visible range, only visible calendars. */
const instances = computed(() => store.instancesInRange(range.value.start, range.value.end, collections.visibleCalendarIds))

const gridEl = ref(null)
const gridHeight = ref(600)
let ro = null
onMounted(() => {
  if (!gridEl.value) return
  ro = new ResizeObserver(([e]) => (gridHeight.value = e.contentRect.height))
  ro.observe(gridEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

const maxLanes = computed(() => {
  const rowH = gridHeight.value / weeks.value.length
  return Math.max(1, Math.floor((rowH - HEADER_H.value - 4) / LANE_H.value))
})

const rows = computed(() =>
  weeks.value.map((week) => {
    const first = week[0]
    const last = week[6]
    const inWeek = instances.value.filter((i) => i.startDate <= last && i.dueDate >= first)
    return { week, layout: layoutWeekRow(week, inWeek, maxLanes.value) }
  }),
)

const dayModal = shallowRef(null)

/** Click (or tap) a day: show that day's tasks, with a way to add one. */
function activateDay(d) {
  ui.selectedDate = d
  dayModal.value = d
}

function onCellClick(d, e) {
  if (e.target.closest('button')) return
  activateDay(d)
}

function onCellKey(d, e) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter') activateDay(d)
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (step[e.key]) {
    e.preventDefault()
    ui.selectedDate = addDays(d, step[e.key])
    requestAnimationFrame(() => document.querySelector(`.month .cell[data-drop-date="${ui.selectedDate}"]`)?.focus())
  }
}

function openDayView(d) {
  dayModal.value = null
  emit('openDay', d)
}

/* Phone: swipe left/right to change month. */
const nav = useCalendarNav()
let sx = 0
let sy = 0
function onTouchStart(e) {
  sx = e.touches[0].clientX
  sy = e.touches[0].clientY
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - sx
  const dy = e.changedTouches[0].clientY - sy
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? nav.next : nav.prev)()
}

const dropDate = computed(() => dragState.value?.overDate ?? null)
const dragKey = computed(() => dragState.value?.inst.key ?? null)
const fullLabel = (d) => formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })
</script>

<template>
  <div class="month" :class="{ phone: isMobile }" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <div class="dow-row" aria-hidden="true">
      <span v-for="n in names" :key="n.wd" class="dow" :class="{ sun: n.wd === 0, sat: n.wd === 6 }">{{ n.label }}</span>
    </div>
    <div ref="gridEl" class="grid-wrap">
      <Transition name="cal-fade" mode="out-in">
        <div :key="weeks[0][0]" class="grid" :style="{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }" role="grid" :aria-label="formatDate(ui.selectedDate, { month: 'long', year: 'numeric' })">
          <div v-for="row in rows" :key="row.week[0]" class="week" role="row">
            <div
              v-for="d in row.week"
              :key="d"
              class="cell"
              role="gridcell"
              :tabindex="d === ui.selectedDate ? 0 : -1"
              :aria-label="fullLabel(d)"
              :aria-selected="d === ui.selectedDate"
              :data-drop-date="d"
              :class="{
                out: !isSameMonth(d, ui.selectedDate),
                today: d === ui.today,
                selected: d === ui.selectedDate,
                sun: weekday(d) === 0,
                sat: weekday(d) === 6,
                'drop-target': dropDate === d,
              }"
              @click="onCellClick(d, $event)"
              @keydown="onCellKey(d, $event)"
            >
              <button type="button" class="num" :aria-label="`Show tasks for ${fullLabel(d)}`" tabindex="-1" @click.stop="activateDay(d)">
                {{ +d.slice(8) }}
              </button>
              <!-- Sunny marks today (one still drawing, no animation). -->
              <span v-if="d === ui.today" class="today-sunny" title="Today"><SunnyMascot no-nest /></span>
            </div>
            <div
              v-for="seg in row.layout.segments"
              :key="seg.inst.key"
              class="seg"
              :class="{ ghosted: dragKey === seg.inst.key }"
              :style="{
                left: `calc(${(seg.col / 7) * 100}% + ${isMobile ? 2 : 4}px)`,
                width: `calc(${(seg.span / 7) * 100}% - ${isMobile ? 4 : 8}px)`,
                top: `${HEADER_H + seg.lane * LANE_H}px`,
              }"
            >
              <EventChip :inst="seg.inst" pill :compact="isMobile" :draggable="!isMobile" :continues-before="seg.continuesBefore" :continues-after="seg.continuesAfter" />
            </div>
            <template v-for="(n, col) in row.layout.hidden" :key="'more' + col">
              <button
                v-if="n > 0"
                type="button"
                class="more"
                :style="{ left: `calc(${(col / 7) * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)`, top: `${HEADER_H + (maxLanes - 1) * LANE_H}px` }"
                @click.stop="dayModal = row.week[col]"
              >
                +{{ n }}<span v-if="!isMobile"> more</span>
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </div>
    <DayListModal :date="dayModal" @close="dayModal = null" @open-day="openDayView" />
  </div>
</template>

<style scoped>
.month { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: var(--space-2) var(--space-2) var(--space-3); }
.dow-row { display: grid; grid-template-columns: repeat(7, 1fr); padding: var(--space-2) 0 var(--space-1); }
.dow { text-align: center; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-3); }
.dow.sun { color: var(--danger-text); }
.dow.sat { color: var(--info-text); }
.grid-wrap { flex: 1; min-height: 0; }
.grid { height: 100%; display: grid; min-height: 0; }
.week { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); min-height: 0; }
.cell {
  position: relative;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 4px;
  border-radius: var(--radius);
  cursor: pointer;
  outline-offset: -2px;
  transition: background var(--dur-fast) var(--ease);
}
.cell:hover { background: color-mix(in srgb, var(--primary-soft) 45%, transparent); }
.cell.drop-target { background: color-mix(in srgb, var(--primary) 12%, transparent); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent); }
.num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
  color: var(--text);
  transition: background var(--dur-fast) var(--ease);
}
.sun .num { color: var(--danger-text); }
.sat .num { color: var(--info-text); }
.out .num { opacity: 0.4; }
.selected .num { background: var(--primary-soft); }
.today .num { background: var(--primary); color: var(--primary-contrast); font-weight: var(--weight-semibold); opacity: 1; }
/* Peeks out just to the right of today's number. */
.today-sunny { position: absolute; top: 1px; left: calc(50% + 15px); width: 26px; pointer-events: none; }
.phone .today-sunny { width: 16px; top: -1px; left: calc(50% + 10px); }
.seg { position: absolute; height: 20px; z-index: 1; transition: opacity var(--dur) var(--ease); }
.seg.ghosted { opacity: 0.35; }
.more {
  position: absolute;
  z-index: 1;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: var(--weight-semibold);
  text-align: center;
}
.more:hover { background: var(--surface-hover); color: var(--text); }
.cal-fade-enter-active, .cal-fade-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.cal-fade-enter-from, .cal-fade-leave-to { opacity: 0; }

/* Phone: tighter cells, smaller numbers, still no lines. */
.phone { padding: var(--space-1) 2px var(--space-2); }
.phone .dow { font-size: var(--text-xs); }
.phone .cell { border-radius: var(--radius-sm); padding-top: 2px; }
.phone .num { width: 26px; height: 26px; font-size: var(--text-sm); }
.phone .more { font-size: 11px; padding: 0; }
</style>
