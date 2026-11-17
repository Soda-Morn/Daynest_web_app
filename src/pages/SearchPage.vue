<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import FilterBar from '@/components/task/FilterBar.vue'
import GroupedTaskList from '@/components/task/GroupedTaskList.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useDebounced } from '@/composables/useDebounced'
import { emptyFilter, isFilterActive, makePredicate } from '@/utils/filters'
import { compareByDate } from '@/utils/task'

/**
 * Global search. The query lives in the URL (?q=) so it survives reloads and
 * back/forward. Typing is debounced; filtering is a single pass with a
 * pre-built predicate.
 */
const route = useRoute()
const router = useRouter()
const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()
const isMobile = useIsMobile()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = useDebounced(input, 120)
const filter = ref(emptyFilter())
const inputEl = ref(null)

watch(
  () => route.query.q,
  (q) => {
    if (typeof q === 'string' && q !== input.value) input.value = q
  },
)
watch(query, (q) => router.replace({ query: { ...route.query, q: q || undefined } }))
onMounted(() => isMobile.value && inputEl.value?.focus())

const names = {
  calendar: (id) => collections.calendarById.get(id)?.name ?? '',
  list: (id) => (id ? (collections.listById.get(id)?.name ?? '') : ''),
}

const results = computed(() => {
  const f = { ...filter.value, query: query.value }
  if (!isFilterActive(f)) return []
  const pred = makePredicate(f, ui.today, names)
  return store.listInstances(ui.today).filter(pred).sort(compareByDate)
})
const groups = computed(() => [{ id: 'r', label: '', items: results.value }])
const active = computed(() => isFilterActive({ ...filter.value, query: query.value }))
</script>

<template>
  <div class="page">
    <div class="page-inner">
      <div v-if="isMobile" class="m-search">
        <Search class="s-ic" />
        <input ref="inputEl" v-model="input" type="search" class="input" placeholder="Search tasks, notes, lists…" aria-label="Search tasks" />
      </div>
      <FilterBar v-model="filter" class="fb" />
      <p v-if="active" class="count" aria-live="polite">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</p>
      <GroupedTaskList :groups="groups" />
      <EmptyState v-if="active && !results.length" mood="sad" title="No matches" text="Try a different word or remove a filter." />
      <EmptyState v-if="!active" mood="curious" title="Search your tasks" text="Titles, notes, subtasks, calendars and lists are all searchable." />
    </div>
  </div>
</template>

<style scoped>
.m-search { position: relative; margin-bottom: var(--space-3); }
.m-search .input { padding-left: 40px; }
.s-ic { position: absolute; left: 12px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--text-3); }
.fb { margin-bottom: var(--space-4); }
.count { font-size: var(--text-sm); color: var(--text-3); margin-bottom: var(--space-2); }
</style>
