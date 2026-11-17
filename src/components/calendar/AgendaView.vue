<script setup>
import { computed, ref } from 'vue'
import { CalendarCheck2 } from 'lucide-vue-next'
import TaskItem from '@/components/task/TaskItem.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { addDays, formatDate, relativeDayLabel, startOfWeek } from '@/utils/date'
import { useIncremental } from '@/composables/useIncremental'

/**
 * Chronological list grouped into Today / Tomorrow / This week / Next week /
 * Later. Loads 60 days at a time ("Show more" extends the range).
 */
const store = useTaskStore()
const collections = useCollectionsStore()
const ui = useUiStore()
const settings = useSettingsStore()

const days = ref(60)
const end = computed(() => addDays(ui.today, days.value - 1))
const map = computed(() => store.dayMap(ui.today, end.value, collections.visibleCalendarIds))

const groups = computed(() => {
  const today = ui.today
  const tomorrow = addDays(today, 1)
  const weekStart = startOfWeek(today, settings.settings.weekStartsOn)
  const thisWeekEnd = addDays(weekStart, 6)
  const nextWeekEnd = addDays(weekStart, 13)
  const buckets = [
    { id: 'today', label: 'Today', days: [] },
    { id: 'tomorrow', label: 'Tomorrow', days: [] },
    { id: 'week', label: 'This week', days: [] },
    { id: 'next', label: 'Next week', days: [] },
    { id: 'later', label: 'Later', days: [] },
  ]
  const seen = new Set()
  const keys = [...map.value.keys()].sort()
  for (const d of keys) {
    // Show multi-day tasks once, on their first visible day.
    const items = map.value.get(d).filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    if (!items.length) continue
    const b = d === today ? 0 : d === tomorrow ? 1 : d <= thisWeekEnd ? 2 : d <= nextWeekEnd ? 3 : 4
    buckets[b].days.push({ date: d, items })
  }
  return buckets.filter((b) => b.days.length)
})

/** Flattened rows so long ranges render incrementally (bounded DOM size). */
const rows = computed(() => {
  const out = []
  for (const g of groups.value) {
    out.push({ kind: 'group', key: 'g:' + g.id, label: g.label })
    for (const day of g.days) {
      if (g.id !== 'today' && g.id !== 'tomorrow') out.push({ kind: 'day', key: 'd:' + day.date, label: dayLabel(day.date) })
      for (const inst of day.items) out.push({ kind: 'item', key: day.date + ':' + inst.key, inst })
    }
  }
  return out
})
const { visible, hasMore, sentinel, more } = useIncremental(rows, 80)
const setSentinel = (el) => (sentinel.value = el ?? null)

function dayLabel(d) {
  return d === ui.today || d === addDays(ui.today, 1)
    ? formatDate(d, { weekday: 'long', month: 'short', day: 'numeric' })
    : relativeDayLabel(d, ui.today) + ' · ' + formatDate(d, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="agenda page">
    <div class="page-inner">
      <EmptyState v-if="!groups.length" :icon="CalendarCheck2" title="Nothing scheduled" text="Tasks with a date in the next weeks will appear here." />
      <div class="rows">
        <template v-for="r in visible" :key="r.key">
          <h2 v-if="r.kind === 'group'" class="g-title">{{ r.label }}</h2>
          <h3 v-else-if="r.kind === 'day'" class="d-title">{{ r.label }}</h3>
          <TaskItem v-else :inst="r.inst" :show-date="false" />
        </template>
      </div>
      <div v-if="hasMore" :ref="setSentinel" class="more-wrap">
        <button type="button" class="btn btn-ghost btn-sm" @click="more">Show more</button>
      </div>
      <div v-else class="more-wrap">
        <button type="button" class="btn btn-secondary btn-sm" @click="days += 60">Show more · until {{ formatDate(addDays(end, 60), { month: 'short', day: 'numeric' }) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rows { display: grid; }
.g-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: var(--space-6) 0 var(--space-1); }
.g-title:first-child { margin-top: 0; }
.d-title { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-2); margin: var(--space-3) 0 var(--space-1) var(--space-4); }
.more-wrap { display: flex; justify-content: center; padding: var(--space-4); }
</style>
