<script setup>
import { computed } from 'vue'
import GroupedTaskList from '@/components/task/GroupedTaskList.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { useStats } from '@/composables/useStats'
import { relativeDayLabel, toKey } from '@/utils/date'
import { occurrenceInstance, oneOffInstance } from '@/utils/task'

/** Completed tasks (and recurring occurrences), newest first, grouped by day. */
const store = useTaskStore()
const ui = useUiStore()
const stats = useStats()

const completed = computed(() => {
  const out = []
  for (const t of store.byId.values()) {
    if (!t.recurrence) {
      if (t.status === 'completed') out.push(oneOffInstance(t))
      continue
    }
    for (const [d, o] of Object.entries(t.overrides)) if (o.status === 'completed' && !o.deleted) out.push(occurrenceInstance(t, d))
  }
  return out.sort((a, b) => ((b.completedAt ?? '') > (a.completedAt ?? '') ? 1 : -1))
})

const groups = computed(() => {
  const map = new Map()
  for (const i of completed.value) {
    const k = i.completedAt ? toKey(new Date(i.completedAt)) : 'unknown'
    const arr = map.get(k) ?? []
    arr.push(i)
    map.set(k, arr)
  }
  return [...map].map(([k, items]) => ({
    id: k,
    label: k === 'unknown' ? 'Earlier' : relativeDayLabel(k, ui.today),
    items,
  }))
})
</script>

<template>
  <div class="page">
    <div class="page-inner">
      <dl class="ledger summary" aria-label="Productivity summary">
        <div><dt>This week</dt><dd>{{ stats.week.value.total }}</dd></div>
        <div><dt>This month</dt><dd>{{ stats.month.value.total }}</dd></div>
        <div><dt>Day streak</dt><dd>{{ stats.streak.value }}</dd></div>
        <div><dt>All time</dt><dd>{{ completed.length }}</dd></div>
      </dl>
      <GroupedTaskList :groups="groups" />
      <EmptyState v-if="!completed.length" mood="look" title="Nothing completed yet" text="Finished tasks collect here so you can look back on your progress." />
    </div>
  </div>
</template>

<style scoped>
.summary { margin-bottom: var(--space-6); }
</style>
