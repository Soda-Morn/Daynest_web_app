<script setup>
import { computed } from 'vue'
import { Check, Repeat } from 'lucide-vue-next'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useTaskActions } from '@/composables/useTaskActions'
import { startTaskDrag, wasDragging } from '@/composables/useDragTask'
import { formatTime } from '@/utils/date'
import { isDone, isMultiDay } from '@/utils/task'

/**
 * A task inside a month cell or the all-day row. Draggable.
 * `pill` = the month-view style: a small pastel tag with a coloured left
 * edge (timed tasks too); `compact` hides times and centres the label (phones).
 */
const props = defineProps({
  inst: { type: Object, required: true },
  continuesBefore: { type: Boolean, default: false },
  continuesAfter: { type: Boolean, default: false },
  draggable: { type: Boolean, default: true },
  pill: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const collections = useCollectionsStore()
const settings = useSettingsStore()
const ui = useUiStore()
const actions = useTaskActions()

const color = computed(() => collections.colorOf(props.inst.task.calendarId))
const done = computed(() => isDone(props.inst.status))
const time = computed(() => (props.inst.startTime ? formatTime(props.inst.startTime, settings.settings.timeFormat) : ''))
const bar = computed(() => props.pill || isMultiDay(props.inst) || !props.inst.startTime)
const showTime = computed(() => !!time.value && (props.pill ? !props.compact && !isMultiDay(props.inst) : !bar.value))
const selected = computed(() => ui.detailKey === props.inst.key)

function onClick() {
  if (wasDragging()) return
  ui.openTask(props.inst)
}
function onPointerDown(e) {
  if (props.draggable) startTaskDrag(e, props.inst, actions.move)
}
</script>

<template>
  <button
    type="button"
    class="ev"
    :class="{ bar, pill, compact, done, selected, 'cont-l': continuesBefore, 'cont-r': continuesAfter, tinted: bar }"
    :style="{ '--c': color }"
    :aria-label="`${inst.title}${time ? ' at ' + time : ''}${done ? ', completed' : ''}`"
    @click.stop="onClick"
    @pointerdown="onPointerDown"
  >
    <span v-if="!bar" class="dot" />
    <Check v-if="inst.status === 'completed'" class="done-ic" :stroke-width="3" />
    <span v-if="showTime" class="time">{{ time }}</span>
    <span class="label">{{ inst.title }}</span>
    <Repeat v-if="inst.task.recurrence && !compact" class="rep" />
  </button>
</template>

<style scoped>
.ev {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: var(--weight-medium);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  touch-action: manipulation;
  transition: background var(--dur-fast) var(--ease), opacity var(--dur) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.ev:hover { background: var(--surface-hover); }
/* Scoped .ev beats the global .tinted helper, so restate the tint here. */
.ev.bar, .ev.bar:hover {
  background: color-mix(in srgb, var(--c) var(--chip-mix), var(--surface));
  color: color-mix(in srgb, var(--c), var(--chip-ink) var(--chip-ink-mix));
}
.ev.bar:hover { filter: brightness(0.97); }
[data-theme='dark'] .ev.bar:hover { filter: brightness(1.12); }
.ev.selected { box-shadow: 0 0 0 1.5px var(--c); }
.ev.cont-l { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.ev.cont-r { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.dot { width: 7px; height: 7px; }
.time { color: var(--text-3); font-variant-numeric: tabular-nums; font-weight: var(--weight-regular); flex-shrink: 0; }
.label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.done { opacity: 0.55; }
.done .label { text-decoration: line-through; }
.done-ic { width: 11px; height: 11px; flex-shrink: 0; color: var(--success); }
.bar .done-ic { color: inherit; }
.rep { width: 11px; height: 11px; flex-shrink: 0; margin-left: auto; opacity: 0.6; }

/* ---------- Month pills: pastel tag with a coloured left edge ---------- */
.ev.pill {
  height: 20px;
  padding: 0 6px 0 5px;
  border-left: 3px solid var(--c);
  border-radius: 4px;
  font-size: 11.5px;
}
.ev.pill.cont-l { border-left-color: transparent; }
.ev.pill .time { color: inherit; opacity: 0.75; }
.ev.pill.compact { justify-content: center; gap: 3px; padding: 0 3px 0 2px; font-size: 11px; }
.ev.pill.compact .done-ic { width: 9px; height: 9px; }
</style>
