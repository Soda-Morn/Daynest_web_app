<script setup>
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { Check, Repeat } from 'lucide-vue-next'
import EventChip from './EventChip.vue'
import { HOUR_HEIGHT, SNAP_MINUTES } from '@/constants'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useTaskActions } from '@/composables/useTaskActions'
import { dragState, startTaskDrag, wasDragging } from '@/composables/useDragTask'
import { layoutTimed, layoutWeekRow } from '@/utils/calendarLayout'
import { formatDate, formatHourLabel, formatTime, minutesToTime, timeToMinutes } from '@/utils/date'
import { isDone, isMultiDay } from '@/utils/task'

/**
 * Week and day views: an all-day lane on top and a scrollable 24h grid.
 * Click or drag on empty space to create, drag blocks to move, drag the
 * bottom edge to resize. All positions are computed from the shared
 * HOUR_HEIGHT so nothing is measured during render.
 */
const props = defineProps({
  days: { type: Array, required: true },
  variant: { type: String, default: 'grid' },
  hourHeight: { type: Number, default: HOUR_HEIGHT },
})
const emit = defineEmits(['openDay'])

const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()
const settings = useSettingsStore()
const actions = useTaskActions()

const HH = computed(() => props.hourHeight)
const DAY_PX = computed(() => HH.value * 24)
const cards = computed(() => props.variant === 'cards')
const ALLDAY_LANES = 3
const hours = Array.from({ length: 24 }, (_, h) => h)
const fmt = computed(() => settings.settings.timeFormat)

const range = computed(() => ({ start: props.days[0], end: props.days[props.days.length - 1] }))
const instances = computed(() => store.instancesInRange(range.value.start, range.value.end, collections.visibleCalendarIds))

/** All-day + multi-day items share the top lane. */
const allDay = computed(() => {
  const items = instances.value.filter((i) => !i.startTime || isMultiDay(i))
  const full = layoutWeekRow(props.days, items, 99)
  const lanes = full.segments.reduce((m, s) => Math.max(m, s.lane + 1), 0)
  if (lanes <= ALLDAY_LANES || expanded.value) return { ...full, lanes }
  const capped = layoutWeekRow(props.days, items, ALLDAY_LANES)
  return { ...capped, lanes: ALLDAY_LANES }
})
const expanded = ref(false)

/** Timed single-day blocks per column. */
const columns = computed(() => {
  const byDay = new Map()
  for (const i of instances.value) {
    if (!i.startTime || isMultiDay(i)) continue
    const arr = byDay.get(i.startDate) ?? []
    arr.push(i)
    byDay.set(i.startDate, arr)
  }
  return props.days.map((d) => ({ date: d, blocks: layoutTimed(byDay.get(d) ?? []) }))
})

/* ---- Now indicator (driven by the shared clock) ---- */
const nowTop = computed(() => ((ui.now.getHours() * 60 + ui.now.getMinutes()) / 1440) * DAY_PX.value)

/* ---- Initial scroll ---- */
const scroller = ref(null)
function scrollToWorkday() {
  const el = scroller.value
  if (!el) return
  const showsToday = props.days.includes(ui.today)
  const target = showsToday ? Math.max(0, nowTop.value - el.clientHeight / 3) : 7 * HH.value
  el.scrollTop = target
}
onMounted(() => nextTick(scrollToWorkday))
watch(
  () => props.days[0],
  () => nextTick(scrollToWorkday),
)

/* ---- Create by click / drag-select on empty space ---- */
const selection = shallowRef(null)

function minutesAt(e, col) {
  const r = col.getBoundingClientRect()
  return Math.max(0, Math.min(1440, ((e.clientY - r.top) / r.height) * 1440))
}

function onColumnDown(e, date) {
  if (e.button !== 0 || e.target.closest('.block')) return
  const col = e.currentTarget
  const start = Math.floor(minutesAt(e, col) / 30) * 30
  if (e.pointerType === 'touch') {
    // On touch, a tap creates (dragging must stay free for scrolling).
    const y0 = e.clientY
    const up = (ev) => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (Math.abs(ev.clientY - y0) < 8) create(date, start, start + 60)
    }
    const cancel = () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return
  }
  selection.value = { date, a: start, b: start + 30 }
  const move = (ev) => {
    const m = Math.round(minutesAt(ev, col) / SNAP_MINUTES) * SNAP_MINUTES
    selection.value = { date, a: Math.min(start, m), b: Math.max(start + SNAP_MINUTES, m) }
  }
  const end = (ev) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    const s = selection.value
    selection.value = null
    if (s && ev.type === 'pointerup') create(s.date, s.a, s.b - s.a < 30 ? s.a + 60 : s.b)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

function create(date, a, b) {
  ui.selectedDate = date
  ui.openQuickAdd({ startDate: date, startTime: minutesToTime(a), endTime: minutesToTime(Math.min(b, 1439)) })
}

/* ---- Blocks ---- */
function blockStyle(b) {
  const top = (b.start / 1440) * DAY_PX.value
  const gap = cards.value ? 6 : 2
  const height = Math.max(cards.value ? 34 : 20, ((b.end - b.start) / 1440) * DAY_PX.value - gap)
  const w = 100 / b.columns
  const inset = cards.value ? 4 : 2
  return {
    top: `${top + gap / 2}px`,
    height: `${height}px`,
    left: `calc(${b.column * w}% + ${inset}px)`,
    width: `calc(${w}% - ${inset * 2 + (cards.value ? 4 : 2)}px)`,
  }
}

function onBlockDown(e, inst) {
  startTaskDrag(e, inst, actions.move)
}
function onResizeDown(e, inst) {
  startTaskDrag(e, inst, actions.move, 'resize')
}
function onBlockClick(inst) {
  if (!wasDragging()) ui.openTask(inst)
}

/** How much fits in a card: title only, + time, + description. */
function cardSize(b) {
  const px = ((b.end - b.start) / 1440) * DAY_PX.value
  return px < 52 ? 'xs' : px < 88 ? 'sm' : 'lg'
}

/** Ghost of the dragged block at its prospective position. */
const preview = computed(() => {
  const s = dragState.value
  if (!s || s.overMinutes === null || !s.overDate || !props.days.includes(s.overDate)) return null
  if (s.mode === 'resize') {
    const start = s.inst.startTime ? timeToMinutes(s.inst.startTime) : 0
    return { date: s.overDate, start, end: s.overMinutes }
  }
  return { date: s.overDate, start: s.overMinutes, end: Math.min(1440, s.overMinutes + s.duration) }
})
const draggingKey = computed(() => dragState.value?.inst.key ?? null)

const blockTime = (i) =>
  i.endTime ? `${formatTime(i.startTime, fmt.value)} – ${formatTime(i.endTime, fmt.value)}` : formatTime(i.startTime, fmt.value)
const colorOf = (i) => collections.colorOf(i.task.calendarId)
const isSingle = computed(() => props.days.length === 1)
</script>

<template>
  <div class="tg" :class="{ single: isSingle, cards }">
    <!-- Day headers (the Day planner shows a week strip instead) -->
    <div v-if="!cards" class="head-row">
      <div class="gutter" />
      <button
        v-for="d in days"
        :key="d"
        type="button"
        class="day-head"
        :class="{ today: d === ui.today, selected: d === ui.selectedDate && !isSingle }"
        :aria-label="`Open ${formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}`"
        @click="emit('openDay', d)"
      >
        <span class="dname">{{ formatDate(d, { weekday: 'short' }) }}</span>
        <span class="dnum">{{ +d.slice(8) }}</span>
      </button>
    </div>

    <!-- All-day lane -->
    <div class="allday-row">
      <div class="gutter allday-label">
        <span>All day</span>
        <button v-if="allDay.hidden.some((h) => h > 0) || expanded" type="button" class="expand" @click="expanded = !expanded">
          {{ expanded ? 'Less' : 'More' }}
        </button>
      </div>
      <div class="allday" :style="{ height: `${Math.max(1, allDay.lanes) * 24 + 8}px` }">
        <div v-for="d in days" :key="d" class="allday-cell" :data-drop-date="d" :class="{ 'drop-target': dragState?.overDate === d && dragState?.overMinutes === null }" @click.self="ui.openQuickAdd({ startDate: d })" />
        <div
          v-for="seg in allDay.segments"
          :key="seg.inst.key"
          class="seg"
          :style="{ left: `calc(${(seg.col / days.length) * 100}% + 3px)`, width: `calc(${(seg.span / days.length) * 100}% - 6px)`, top: `${4 + seg.lane * 24}px` }"
        >
          <EventChip :inst="seg.inst" :continues-before="seg.continuesBefore" :continues-after="seg.continuesAfter" />
        </div>
        <template v-for="(n, col) in allDay.hidden" :key="'h' + col">
          <button v-if="n > 0" type="button" class="more" :style="{ left: `calc(${(col / days.length) * 100}% + 3px)`, top: `${4 + (ALLDAY_LANES - 1) * 24}px`, width: `calc(${100 / days.length}% - 6px)` }" @click="expanded = true">
            +{{ n }} more
          </button>
        </template>
      </div>
    </div>

    <!-- Time grid -->
    <div ref="scroller" class="scroller">
      <div class="body" :style="{ height: DAY_PX + 'px' }">
        <div class="gutter hours" aria-hidden="true">
          <span v-for="h in hours" :key="h" class="hour" :style="{ top: h * HH + 'px' }">{{ h === 0 ? '' : formatHourLabel(h, fmt) }}</span>
        </div>
        <div class="cols">
          <div class="lines" aria-hidden="true">
            <div v-for="h in hours" :key="h" class="line" :style="{ top: h * HH + 'px' }" />
          </div>
          <div
            v-for="col in columns"
            :key="col.date"
            class="col"
            :class="{ today: col.date === ui.today }"
            :data-drop-date="col.date"
            data-drop-time
            @pointerdown="onColumnDown($event, col.date)"
          >
            <div
              v-for="b in col.blocks"
              :key="b.inst.key"
              class="block tinted"
              :class="[cards ? `card-${cardSize(b)}` : '', { done: isDone(b.inst.status), ghosted: draggingKey === b.inst.key, short: !cards && b.end - b.start <= 30, selected: ui.detailKey === b.inst.key }]"
              :style="{ ...blockStyle(b), '--c': colorOf(b.inst) }"
              role="button"
              tabindex="0"
              :aria-label="`${b.inst.title}, ${blockTime(b.inst)}`"
              @pointerdown.stop="onBlockDown($event, b.inst)"
              @click.stop="onBlockClick(b.inst)"
              @keydown.enter="ui.openTask(b.inst)"
            >
              <span class="b-title">
                <Check v-if="b.inst.status === 'completed'" class="b-ic" :stroke-width="3" />
                {{ b.inst.title }}
                <Repeat v-if="b.inst.task.recurrence" class="b-ic rep" />
              </span>
              <span v-if="cards && cardSize(b) === 'lg' && b.inst.description" class="b-desc">{{ b.inst.description }}</span>
              <span v-if="!cards || cardSize(b) !== 'xs'" class="b-time">{{ blockTime(b.inst) }}</span>
              <span class="resize" aria-hidden="true" @pointerdown.stop="onResizeDown($event, b.inst)" />
            </div>

            <div
              v-if="selection && selection.date === col.date"
              class="selection"
              :style="{ top: (selection.a / 1440) * DAY_PX + 'px', height: ((selection.b - selection.a) / 1440) * DAY_PX + 'px' }"
            >
              {{ formatTime(minutesToTime(selection.a), fmt) }} – {{ formatTime(minutesToTime(Math.min(selection.b, 1439)), fmt) }}
            </div>

            <div
              v-if="preview && preview.date === col.date"
              class="preview"
              :style="{ top: (preview.start / 1440) * DAY_PX + 'px', height: Math.max(18, ((preview.end - preview.start) / 1440) * DAY_PX) + 'px', '--c': colorOf(dragState.inst) }"
            >
              {{ formatTime(minutesToTime(preview.start), fmt) }} – {{ formatTime(minutesToTime(Math.min(preview.end, 1439)), fmt) }}
            </div>

            <div v-if="col.date === ui.today" class="now" :style="{ top: nowTop + 'px' }" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tg { display: flex; flex-direction: column; height: 100%; min-height: 0; --gutter: 60px; }
.gutter { width: var(--gutter); flex-shrink: 0; }
.head-row { display: flex; border-bottom: 1px solid var(--border); overflow-y: hidden; scrollbar-gutter: stable; }
.day-head {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
}
.day-head:hover { background: var(--surface-hover); }
.single .day-head { align-items: flex-start; flex-direction: row; gap: 8px; padding-left: 12px; }
.dname { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }
.single .dname { align-self: center; }
.dnum { display: grid; place-items: center; min-width: 32px; height: 32px; border-radius: 50%; font-size: var(--text-lg); font-weight: var(--weight-medium); }
.today .dnum { background: var(--primary); color: var(--primary-contrast); }
.today .dname { color: var(--primary-text); }
.selected .dnum { background: var(--primary-soft); color: var(--primary-text); }

.allday-row { display: flex; border-bottom: 1px solid var(--border); overflow-y: hidden; scrollbar-gutter: stable; }
.allday-label { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px; padding-right: 8px; font-size: 11px; color: var(--text-3); }
.expand { border: 0; background: none; padding: 0; color: var(--primary-text); font-size: 11px; font-weight: var(--weight-semibold); }
.allday { position: relative; flex: 1; display: flex; min-height: 32px; transition: height var(--dur) var(--ease); }
.allday-cell { flex: 1; border-left: 1px solid var(--border); }
.allday-cell.drop-target { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.seg { position: absolute; height: 22px; z-index: 1; }
.more { position: absolute; height: 22px; border: 0; background: none; text-align: left; padding: 0 6px; font-size: 12px; font-weight: var(--weight-semibold); color: var(--text-2); border-radius: 6px; z-index: 1; }
.more:hover { background: var(--surface-hover); }

.scroller { flex: 1; overflow-y: auto; overscroll-behavior: contain; min-height: 0; scrollbar-gutter: stable; }
.body { position: relative; display: flex; }
.hours { position: relative; }
.hour { position: absolute; right: 10px; transform: translateY(-50%); font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cols { position: relative; flex: 1; display: flex; }
.lines { position: absolute; inset: 0; pointer-events: none; }
.line { position: absolute; left: 0; right: 0; border-top: 1px solid var(--border); }
.line::after { content: ''; position: absolute; left: 0; right: 0; top: 26px; border-top: 1px dashed color-mix(in srgb, var(--border) 60%, transparent); }
.col { position: relative; flex: 1; min-width: 0; border-left: 1px solid var(--border); touch-action: pan-y; }
.col.today { background: color-mix(in srgb, var(--primary) 3%, transparent); }

.block {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 8px;
  border-radius: 8px;
  border-left: 3px solid var(--c);
  overflow: hidden;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.3;
  touch-action: manipulation;
  box-shadow: 0 0 0 1px var(--surface);
  transition: box-shadow var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
  outline-offset: 1px;
}
.block:hover { box-shadow: 0 0 0 1px var(--surface), var(--shadow-sm); z-index: 3; }
.block.selected { box-shadow: 0 0 0 2px var(--c); }
.block.short { flex-direction: row; align-items: center; gap: 6px; padding-top: 1px; padding-bottom: 1px; }
.block.ghosted { opacity: 0.3; }
.block.done { opacity: 0.55; }
.block.done .b-title { text-decoration: line-through; }
.b-title { display: flex; align-items: center; gap: 4px; font-weight: var(--weight-semibold); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
.b-time { opacity: 0.8; font-variant-numeric: tabular-nums; white-space: nowrap; }
.short .b-time { order: -1; flex-shrink: 0; }
.b-ic { width: 11px; height: 11px; flex-shrink: 0; }
.rep { opacity: 0.6; }
.resize { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; cursor: ns-resize; touch-action: none; }
.resize::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 18px; height: 3px; margin-left: -9px; border-radius: 2px; background: currentColor; opacity: 0; transition: opacity var(--dur-fast) var(--ease); }
.block:hover .resize::after { opacity: 0.35; }

.selection, .preview {
  position: absolute;
  left: 2px;
  right: 4px;
  z-index: 4;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: var(--weight-semibold);
  pointer-events: none;
}
.selection { background: color-mix(in srgb, var(--primary) 18%, transparent); border: 1.5px solid var(--primary); color: var(--primary-text); }
.preview { background: color-mix(in srgb, var(--c) 22%, var(--surface)); border: 1.5px dashed var(--c); color: color-mix(in srgb, var(--c), var(--chip-ink) var(--chip-ink-mix)); }

.now { position: absolute; left: -1px; right: 0; z-index: 5; height: 2px; background: var(--danger); pointer-events: none; }
.now::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--danger); }

/* ---------- Day planner cards ---------- */
.cards { --gutter: 64px; }
.cards .allday-row { border-bottom: 0; padding: 4px 0 8px; }
.cards .allday-cell { border-left: 0; }
.cards .allday-label { font-size: var(--text-xs); font-weight: var(--weight-medium); }
.cards .hour { right: 14px; font-size: var(--text-xs); font-weight: var(--weight-medium); }
.cards .line { border-top: 1px dashed var(--border-strong); opacity: 0.7; }
.cards .line::after { display: none; }
.cards .col { border-left: 0; }
.cards .col.today { background: transparent; }
.cards .block {
  gap: 4px;
  padding: 10px 16px;
  border-left: 0;
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--c) 24%, var(--surface));
  color: var(--text);
  box-shadow: none;
  line-height: 1.35;
}
.cards .block:hover { box-shadow: var(--shadow-sm); }
.cards .block.selected { box-shadow: 0 0 0 2px var(--c); }
.cards .b-title { font-size: var(--text-md); font-weight: var(--weight-semibold); }
.cards .b-time { order: 3; margin-top: auto; font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--text-2); opacity: 1; }
.cards .b-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--text-sm);
  color: var(--text-2);
}
.cards .card-xs { flex-direction: row; align-items: center; padding: 0 14px; border-radius: var(--radius-lg); }
.cards .card-sm { padding: 8px 14px; }
.cards .now { left: 0; }

@media (max-width: 767px) {
  .tg { --gutter: 48px; }
  .cards { --gutter: 56px; }
  .hour { right: 6px; font-size: 10px; }
}
</style>
