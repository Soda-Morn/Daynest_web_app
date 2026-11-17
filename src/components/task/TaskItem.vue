<script setup lang="ts">
import { computed } from 'vue'
import { AlignLeft, CalendarClock, GripVertical, ListChecks, Repeat } from 'lucide-vue-next'
import type { TaskInstance } from '@/types/models'
import TaskCheck from '@/components/ui/TaskCheck.vue'
import DateMenu from './DateMenu.vue'
import PriorityFlag from './PriorityFlag.vue'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useTaskActions } from '@/composables/useTaskActions'
import { formatTime, relativeDayLabel } from '@/utils/date'
import { isDone, isOverdue } from '@/utils/task'

/**
 * A task row used by every list page. Pure presentation + quick actions;
 * all mutations go through useTaskActions.
 */
const props = withDefaults(
  defineProps<{ inst: TaskInstance; showDate?: boolean; showList?: boolean; reorderable?: boolean; dragging?: boolean }>(),
  { showDate: true, showList: true, reorderable: false, dragging: false },
)
const emit = defineEmits<{ grab: [PointerEvent]; nudge: [-1 | 1] }>()

const collections = useCollectionsStore()
const ui = useUiStore()
const settings = useSettingsStore()
const actions = useTaskActions()

const cal = computed(() => collections.calendarById.get(props.inst.task.calendarId))
const list = computed(() => (props.inst.task.listId ? collections.listById.get(props.inst.task.listId) : undefined))
const done = computed(() => isDone(props.inst.status))
const overdue = computed(() => isOverdue(props.inst, ui.today))
const subDone = computed(() => props.inst.subtasks.filter((s) => s.done).length)

const when = computed(() => {
  const i = props.inst
  const parts: string[] = []
  if (props.showDate && i.startDate) {
    parts.push(relativeDayLabel(i.startDate, ui.today))
    if (i.dueDate && i.dueDate !== i.startDate) parts[0] += ` – ${relativeDayLabel(i.dueDate, ui.today)}`
  }
  if (i.startTime) {
    const f = settings.settings.timeFormat
    parts.push(i.endTime ? `${formatTime(i.startTime, f)} – ${formatTime(i.endTime, f)}` : formatTime(i.startTime, f))
  }
  return parts.join(' · ')
})

function open() {
  ui.openTask(props.inst)
}

function onKey(e: KeyboardEvent) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter') open()
  else if (e.key === ' ') {
    e.preventDefault()
    actions.toggleComplete(props.inst)
  } else if (props.reorderable && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    emit('nudge', e.key === 'ArrowUp' ? -1 : 1)
  }
}
</script>

<template>
  <div
    class="task"
    :class="{ done, overdue, dragging, cancelled: inst.status === 'cancelled' }"
    :style="{ '--c': cal?.color }"
    :data-reorder-key="inst.key"
    tabindex="0"
    role="button"
    :aria-label="`${inst.title}${when ? ', ' + when : ''}${done ? ', completed' : ''}`"
    @click="open"
    @keydown="onKey"
  >
    <button
      v-if="reorderable"
      type="button"
      class="grip"
      aria-label="Drag to reorder (Alt + arrow keys)"
      tabindex="-1"
      @pointerdown.prevent="emit('grab', $event)"
      @click.stop
    >
      <GripVertical />
    </button>
    <TaskCheck :checked="inst.status === 'completed'" :priority="inst.priority" :label="`Complete ${inst.title}`" @toggle="actions.toggleComplete(inst)" />
    <div class="body">
      <div class="title-row">
        <span class="title">{{ inst.title }}</span>
        <PriorityFlag v-if="inst.priority === 'high' || inst.priority === 'urgent'" :priority="inst.priority" />
      </div>
      <div class="meta">
        <span v-if="when" class="when" :class="{ late: overdue }">{{ when }}</span>
        <Repeat v-if="inst.task.recurrence" class="mi" aria-label="Recurring" />
        <span v-if="inst.subtasks.length" class="sub"><ListChecks class="mi" />{{ subDone }}/{{ inst.subtasks.length }}</span>
        <AlignLeft v-if="inst.description" class="mi" aria-label="Has notes" />
        <span v-if="cal" class="tag"><span class="dot" />{{ cal.name }}</span>
        <span v-if="showList && list" class="tag list">{{ list.name }}</span>
      </div>
    </div>
    <DateMenu v-if="!done" :model-value="inst.startDate" :allow-clear="!inst.occurrence" placement="bottom-end" @pick="(d) => actions.move(inst, d)">
      <template #default="{ toggle }">
        <button type="button" class="icon-btn sm resched" aria-label="Reschedule" title="Reschedule" @click.stop="toggle">
          <CalendarClock />
        </button>
      </template>
    </DateMenu>
  </div>
</template>

<style scoped>
.task {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: 12px var(--space-3) 12px var(--space-4);
  border-bottom: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
  outline-offset: -2px;
}
.task:hover { background: color-mix(in srgb, var(--surface) 70%, transparent); }
.task.dragging { box-shadow: var(--shadow); z-index: 2; background: var(--surface); border-radius: var(--radius); }
.task > :deep(.check) { margin-top: -1px; }
.body { flex: 1; min-width: 0; display: grid; gap: 2px; }
.title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-medium);
  font-size: var(--text-md);
  transition: color var(--dur) var(--ease);
}
.done .title { color: var(--text-3); text-decoration: line-through; text-decoration-color: var(--border-strong); }
.cancelled .title { text-decoration-style: dotted; }
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--text-3);
  font-size: var(--text-sm);
}
.meta:empty { display: none; }
.when.late { color: var(--overdue); font-weight: var(--weight-medium); }
.mi { width: 13px; height: 13px; }
.sub { display: inline-flex; align-items: center; gap: 3px; font-variant-numeric: tabular-nums; }
.tag { display: inline-flex; align-items: center; gap: 5px; }
.tag .dot { width: 7px; height: 7px; }
.tag.list::before { content: '·'; margin-right: 2px; }
.resched { opacity: 0; margin: -4px -4px -4px 0; }
.task:hover .resched, .task:focus-within .resched { opacity: 1; }
@media (pointer: coarse) { .resched { opacity: 0.45; } }
.grip {
  position: absolute;
  left: -2px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 18px;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-3);
  transform: translateY(-50%);
  opacity: 0;
  cursor: grab;
  touch-action: none;
}
.grip svg { width: 14px; height: 14px; }
.task:hover .grip, .task.dragging .grip { opacity: 1; }
@media (pointer: coarse) { .grip { opacity: 0.6; width: 24px; left: -6px; } }
</style>
