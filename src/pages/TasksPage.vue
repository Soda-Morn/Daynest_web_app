<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ListTodo } from 'lucide-vue-next'
import FilterBar from '@/components/task/FilterBar.vue'
import GroupedTaskList from '@/components/task/GroupedTaskList.vue'
import type { TaskGroup } from '@/types/ui'
import InlineAdd from '@/components/task/InlineAdd.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { emptyFilter, makePredicate, type QuickFilter, type TaskFilter } from '@/utils/filters'
import { compareByDate, compareInstances } from '@/utils/task'

/** My Tasks: every task, grouped by list. `?list=<id>` narrows to one list. */
const route = useRoute()
const router = useRouter()
const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()

const listId = computed(() => (typeof route.query.list === 'string' ? route.query.list : null))
const activeList = computed(() => (listId.value ? collections.listById.get(listId.value) : undefined))

const filter = ref<TaskFilter>({ ...emptyFilter(), quick: (route.query.filter as QuickFilter) || 'all' })
watch(
  () => route.query.filter,
  (f) => (filter.value = { ...filter.value, quick: (f as QuickFilter) || 'all' }),
)
watch(
  () => filter.value.quick,
  (q) => {
    if ((route.query.filter ?? 'all') !== q) router.replace({ query: { ...route.query, filter: q === 'all' ? undefined : q } })
  },
)

const names = {
  calendar: (id: string) => collections.calendarById.get(id)?.name ?? '',
  list: (id: string | null) => (id ? (collections.listById.get(id)?.name ?? '') : ''),
}

const matched = computed(() => {
  const f: TaskFilter = { ...filter.value, listIds: listId.value ? [listId.value] : filter.value.listIds }
  const pred = makePredicate(f, ui.today, names)
  const all = store.listInstances(ui.today)
  // "All" hides finished tasks; the Completed filter shows them.
  return all.filter((i) => (f.quick === 'all' ? i.status !== 'completed' && i.status !== 'cancelled' : true) && pred(i))
})

const groups = computed<TaskGroup[]>(() => {
  const sort = (a: Parameters<typeof compareByDate>[0], b: Parameters<typeof compareByDate>[0]) =>
    a.startDate || b.startDate ? compareByDate(a, b) : compareInstances(a, b)
  if (listId.value) return [{ id: 'list', label: '', items: [...matched.value].sort(sort) }]
  const byList = new Map<string, typeof matched.value>()
  for (const i of matched.value) {
    const k = i.task.listId && collections.listById.has(i.task.listId) ? i.task.listId : ''
    const arr = byList.get(k) ?? []
    arr.push(i)
    byList.set(k, arr)
  }
  const out: TaskGroup[] = collections.sortedLists.map((l) => ({ id: l.id, label: l.name, items: (byList.get(l.id) ?? []).sort(sort) }))
  out.push({ id: 'none', label: 'No list', items: (byList.get('') ?? []).sort(sort) })
  return out
})

const addDefaults = computed(() => ({ listId: listId.value }))
</script>

<template>
  <div class="page">
    <div class="page-inner">
      <header class="ph">
        <h1 v-if="activeList" class="pt"><span class="dot" :style="{ '--c': activeList.color }" />{{ activeList.name }}</h1>
        <p class="sub">{{ matched.length }} task{{ matched.length === 1 ? '' : 's' }}</p>
      </header>
      <FilterBar v-model="filter" :hide-lists="!!listId" class="fb" />
      <InlineAdd :defaults="addDefaults" :placeholder="activeList ? `Add to ${activeList.name}` : 'Add a task'" class="ia" />
      <GroupedTaskList :groups="groups" :show-list="false" />
      <EmptyState v-if="!matched.length" :icon="ListTodo" title="No tasks here" text="Add a task above, or change the filters." />
    </div>
  </div>
</template>

<style scoped>
.ph { display: flex; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-3); }
.pt { display: flex; align-items: center; gap: 10px; font-size: var(--text-2xl); font-weight: var(--weight-bold); }
.pt .dot { width: 12px; height: 12px; }
.sub { color: var(--text-3); font-size: var(--text-sm); }
.fb { margin-bottom: var(--space-4); }
.ia { margin-bottom: var(--space-5); }
</style>
