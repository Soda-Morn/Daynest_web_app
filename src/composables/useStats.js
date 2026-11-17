import { computed } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { addDays, startOfMonth, startOfWeek, toKey } from '@/utils/date'
import { useSettingsStore } from '@/stores/settings'

/**
 * Lightweight productivity numbers derived from completion timestamps
 * (one-off tasks and individual recurring occurrences). One pass over the
 * tasks, recomputed only when tasks change.
 */
export function useStats() {
  const store = useTaskStore()
  const ui = useUiStore()
  const settings = useSettingsStore()

  const completionsByDay = computed(() => {
    const map = new Map()
    const bump = (iso) => {
      if (!iso) return
      const k = toKey(new Date(iso))
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    for (const t of store.byId.values()) {
      if (t.recurrence) {
        for (const o of Object.values(t.overrides)) if (o.status === 'completed') bump(o.completedAt)
      } else if (t.status === 'completed') bump(t.completedAt)
    }
    return map
  })

  function sumRange(start, end) {
    let n = 0
    for (let d = start; d <= end; d = addDays(d, 1)) n += completionsByDay.value.get(d) ?? 0
    return n
  }

  const week = computed(() => {
    const start = startOfWeek(ui.today, settings.settings.weekStartsOn)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    const counts = days.map((d) => completionsByDay.value.get(d) ?? 0)
    const total = counts.reduce((a, b) => a + b, 0)
    const lastWeek = sumRange(addDays(start, -7), addDays(start, -1))
    return { days, counts, total, lastWeek }
  })

  const month = computed(() => {
    const start = startOfMonth(ui.today)
    return { total: sumRange(start, ui.today) }
  })

  /** Consecutive days (ending today, or yesterday if nothing yet today) with a completion. */
  const streak = computed(() => {
    let d = completionsByDay.value.get(ui.today) ? ui.today : addDays(ui.today, -1)
    let n = 0
    while ((completionsByDay.value.get(d) ?? 0) > 0 && n < 3650) {
      n++
      d = addDays(d, -1)
    }
    return n
  })

  return { completionsByDay, week, month, streak }
}
