<script setup>
import { computed, watch } from 'vue'
import { CalendarDays, SlidersHorizontal } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'
import SunnyMascot from '@/components/brand/SunnyMascot.vue'
import TaskItem from '@/components/task/TaskItem.vue'
import InlineAdd from '@/components/task/InlineAdd.vue'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useIsMobile } from '@/composables/useMediaQuery'
import { formatDate, relativeDayLabel } from '@/utils/date'
import { isDone } from '@/utils/task'

/**
 * One day's tasks, opened by clicking a day in the month view. Lists the
 * tasks (tap one for details), and lets you add a task for that day.
 */
const props = defineProps({
  date: { type: [String, null], required: true },
})
const emit = defineEmits(['close', 'openDay'])
const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()
const isMobile = useIsMobile()

const items = computed(() =>
  props.date ? (store.dayMap(props.date, props.date, collections.visibleCalendarIds).get(props.date) ?? []) : [],
)
const title = computed(() => (props.date ? formatDate(props.date, { weekday: 'long', month: 'long', day: 'numeric' }) : ''))
const relative = computed(() => {
  if (!props.date) return ''
  const r = relativeDayLabel(props.date, ui.today)
  // Only when it adds something; a weekday name would repeat the title.
  return ['Today', 'Tomorrow', 'Yesterday'].includes(r) ? r : ''
})
const summary = computed(() => {
  const open = items.value.filter((i) => !isDone(i.status) && i.status !== 'cancelled').length
  const done = items.value.filter((i) => i.status === 'completed').length
  if (!items.value.length) return 'Nothing planned'
  const parts = [`${items.value.length} task${items.value.length === 1 ? '' : 's'}`]
  if (done) parts.push(`${done} done`)
  if (open && done) parts.push(`${open} left`)
  return parts.join(' · ')
})
const defaults = computed(() => ({ startDate: props.date }))

function moreOptions() {
  const d = props.date
  emit('close')
  ui.openQuickAdd({ startDate: d })
}

// On a computer the task details open as a side panel, which this dialog
// would cover: step aside when a task is opened from the list.
watch(
  () => ui.detailKey,
  (key) => {
    if (key && props.date && !isMobile.value) emit('close')
  },
)
</script>

<template>
  <Modal :open="!!date" :title="title" size="sm" @close="emit('close')">
    <template #header-actions>
      <button type="button" class="btn btn-ghost btn-sm" title="Open this day in Day view" @click="emit('openDay', date)">
        <CalendarDays />Day view
      </button>
    </template>

    <p class="summary">
      <span v-if="relative" class="rel">{{ relative }}</span>
      {{ summary }}
    </p>

    <div v-if="items.length" class="list">
      <TaskItem v-for="i in items" :key="i.key" :inst="i" :show-date="false" />
    </div>
    <div v-else class="empty">
      <div class="empty-sunny"><SunnyMascot mood="sleepy" /></div>
      <p>No tasks on this day yet.</p>
    </div>

    <div class="add">
      <InlineAdd :defaults="defaults" placeholder="Add a task for this day" />
      <button type="button" class="btn btn-ghost btn-sm more" title="Add with time, calendar, repeat…" @click="moreOptions">
        <SlidersHorizontal />More options
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: calc(var(--space-1) * -1) 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-3);
}
.rel {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.list {
  display: grid;
  max-height: min(50vh, 420px);
  overflow-y: auto;
  margin: 0 calc(var(--space-2) * -1) var(--space-3);
  overscroll-behavior: contain;
}
.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-3);
  margin-bottom: var(--space-3);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: var(--text-sm);
  text-align: center;
}
.empty-sunny { width: 84px; }
.add { display: grid; gap: var(--space-1); }
.more { justify-self: start; color: var(--text-3); }
</style>
