<script setup>
import { computed, ref } from 'vue'
import { CalendarRange } from 'lucide-vue-next'
import GroupedTaskList from '@/components/task/GroupedTaskList.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { addDays, formatDate, relativeDayLabel } from '@/utils/date'
import { isDone } from '@/utils/task'

/** Overdue, then every upcoming day with tasks. Loads 30 days at a time. */
const store = useTaskStore()
const ui = useUiStore()
const days = ref(30)
const end = computed(() => addDays(ui.today, days.value - 1))

const groups = computed(() => {
  const out = []
  const overdue = store.overdueInstances(ui.today)
  if (overdue.length) out.push({ id: 'overdue', label: 'Overdue', tone: 'late', items: overdue })
  const map = store.dayMap(ui.today, end.value)
  const seen = new Set()
  for (const d of [...map.keys()].sort()) {
    const items = map.get(d).filter((i) => !isDone(i.status) && !seen.has(i.key) && (seen.add(i.key), true))
    if (!items.length) continue
    const label =
      d === ui.today || d === addDays(ui.today, 1)
        ? relativeDayLabel(d, ui.today)
        : formatDate(d, { weekday: 'short', month: 'long', day: 'numeric' })
    out.push({ id: d, label, items })
  }
  return out
})
const count = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))
</script>

<template>
  <div class="page">
    <div class="page-inner">
      <p class="sub">{{ count }} open task{{ count === 1 ? '' : 's' }} in the next {{ days }} days</p>
      <GroupedTaskList :groups="groups" :show-date="false" />
      <EmptyState v-if="!count" :icon="CalendarRange" title="All clear ahead" text="Tasks with upcoming dates will show up here." />
      <div class="more">
        <button type="button" class="btn btn-secondary btn-sm" @click="days += 30">Look further ahead</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sub { color: var(--text-3); font-size: var(--text-sm); margin-bottom: var(--space-4); }
.more { display: flex; justify-content: center; padding: var(--space-5); }
</style>
