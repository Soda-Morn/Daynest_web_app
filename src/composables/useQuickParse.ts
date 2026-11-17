import { computed, type Ref } from 'vue'
import type { TaskDraft } from '@/types/models'
import { parseQuickAdd } from '@/utils/nlp'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'

/**
 * Turns quick-add text into a TaskDraft: natural-language parsing plus
 * `#calendar` / `@list` matching against the user's own names.
 * Explicit `overrides` (chips the user picked) win over parsed values,
 * which win over `defaults` (e.g. the date that was clicked in the calendar).
 */
export function useQuickParse(text: Ref<string>, defaults: Ref<Partial<TaskDraft>>, overrides: Ref<Partial<TaskDraft>>) {
  const collections = useCollectionsStore()
  const ui = useUiStore()

  const parsed = computed(() => parseQuickAdd(text.value, ui.today))

  const matchedCalendar = computed(() => {
    const tag = parsed.value.tag?.toLowerCase()
    if (!tag) return null
    return collections.sortedCalendars.find((c) => c.name.toLowerCase().replace(/\s+/g, '').startsWith(tag)) ?? null
  })

  const matchedList = computed(() => {
    const name = (parsed.value.list ?? (!matchedCalendar.value ? parsed.value.tag : null))?.toLowerCase()
    if (!name) return null
    return collections.sortedLists.find((l) => l.name.toLowerCase().replace(/\s+/g, '').startsWith(name)) ?? null
  })

  const draft = computed<TaskDraft>(() => {
    const p = parsed.value
    const o = overrides.value
    const d = defaults.value
    const pick = <K extends keyof TaskDraft>(k: K, parsedVal: TaskDraft[K] | null | undefined): TaskDraft[K] | undefined =>
      k in o ? o[k] : parsedVal != null ? parsedVal : (d[k] as TaskDraft[K] | undefined)

    const date = pick('startDate', p.date)
    const startTime = date ? pick('startTime', p.startTime) ?? null : null
    let endTime = date && startTime ? pick('endTime', p.endTime) ?? null : null
    if (startTime && endTime && endTime <= startTime) endTime = null
    const due = pick('dueDate', null)
    return {
      ...d,
      title: p.title,
      startDate: date ?? null,
      dueDate: date ? (due && due >= date ? due : date) : null,
      startTime,
      endTime,
      priority: pick('priority', p.priority) ?? 'medium',
      calendarId: pick('calendarId', matchedCalendar.value?.id) ?? collections.defaultCalendarId,
      listId: pick('listId', matchedList.value?.id) ?? null,
      recurrence: date ? pick('recurrence', p.recurrence) ?? null : null,
    }
  })

  return { parsed, draft, matchedCalendar, matchedList }
}
