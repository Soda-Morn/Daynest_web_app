import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { CalendarCategory, TaskList } from '@/types/models'
import { DEFAULT_CALENDARS, DEFAULT_LISTS, LEGACY_COLOR_MAP, PALETTE } from '@/constants'
import { persistence } from '@/services/persistence'
import { normalizeName, uid, ValidationError } from '@/utils/validation'
import { useTaskStore } from './tasks'
import { useSettingsStore } from './settings'

/** Calendars (colour-coded categories) and custom task lists. */
export const useCollectionsStore = defineStore('collections', () => {
  const calendars = shallowRef<CalendarCategory[]>([])
  const lists = shallowRef<TaskList[]>([])

  const sortedCalendars = computed(() => [...calendars.value].sort((a, b) => a.order - b.order))
  const sortedLists = computed(() => [...lists.value].sort((a, b) => a.order - b.order))
  const calendarById = computed(() => new Map(calendars.value.map((c) => [c.id, c])))
  const listById = computed(() => new Map(lists.value.map((l) => [l.id, l])))
  /** Ids of calendars currently shown (null-free Set for fast lookups). */
  const visibleCalendarIds = computed(() => new Set(calendars.value.filter((c) => c.visible).map((c) => c.id)))

  const defaultCalendarId = computed(() => {
    const pref = useSettingsStore().settings.defaultCalendarId
    if (pref && calendarById.value.has(pref)) return pref
    return sortedCalendars.value[0]?.id ?? ''
  })

  function colorOf(calendarId: string): string {
    return calendarById.value.get(calendarId)?.color ?? PALETTE[PALETTE.length - 1].value
  }

  function hydrate(c: CalendarCategory[], l: TaskList[]) {
    // One-time migration: recolour items still using the pre-Daynest palette.
    const remap = <T extends { color: string }>(item: T, save: (x: T) => void): T => {
      const next = LEGACY_COLOR_MAP[item.color.toLowerCase()]
      if (!next) return item
      const updated = { ...item, color: next }
      save(updated)
      return updated
    }
    calendars.value = c.map((x) => remap(x, persistence.saveCalendar))
    lists.value = l.map((x) => remap(x, persistence.saveList))
  }

  /** First launch: create a small set of editable defaults. */
  function seedDefaults() {
    const now = new Date().toISOString()
    calendars.value = DEFAULT_CALENDARS.map((c, i) => ({ id: uid(), name: c.name, color: c.color, visible: true, order: i, createdAt: now }))
    lists.value = DEFAULT_LISTS.map((l, i) => ({ id: uid(), name: l.name, color: l.color, order: i, createdAt: now }))
    calendars.value.forEach(persistence.saveCalendar)
    lists.value.forEach(persistence.saveList)
  }

  /* ---- Calendars ---- */

  function createCalendar(name: string, color: string): CalendarCategory {
    const cal: CalendarCategory = {
      id: uid(),
      name: normalizeName(name, calendars.value),
      color,
      visible: true,
      order: calendars.value.reduce((m, c) => Math.max(m, c.order), -1) + 1,
      createdAt: new Date().toISOString(),
    }
    calendars.value = [...calendars.value, cal]
    persistence.saveCalendar(cal)
    return cal
  }

  function updateCalendar(id: string, patch: Partial<Pick<CalendarCategory, 'name' | 'color' | 'visible'>>) {
    const prev = calendarById.value.get(id)
    if (!prev) return
    const next = { ...prev, ...patch }
    if (patch.name !== undefined) next.name = normalizeName(patch.name, calendars.value, id)
    calendars.value = calendars.value.map((c) => (c.id === id ? next : c))
    persistence.saveCalendar(next)
  }

  function toggleCalendar(id: string) {
    const c = calendarById.value.get(id)
    if (c) updateCalendar(id, { visible: !c.visible })
  }

  /** Deletes a calendar; its tasks move to another calendar (never silently lost). */
  function deleteCalendar(id: string) {
    if (calendars.value.length <= 1) throw new ValidationError('You need at least one calendar')
    const fallback = sortedCalendars.value.find((c) => c.id !== id)!
    useTaskStore().reassignCalendar(id, fallback.id)
    calendars.value = calendars.value.filter((c) => c.id !== id)
    persistence.deleteCalendar(id)
    return fallback
  }

  /* ---- Lists ---- */

  function createList(name: string, color: string): TaskList {
    const list: TaskList = {
      id: uid(),
      name: normalizeName(name, lists.value),
      color,
      order: lists.value.reduce((m, l) => Math.max(m, l.order), -1) + 1,
      createdAt: new Date().toISOString(),
    }
    lists.value = [...lists.value, list]
    persistence.saveList(list)
    return list
  }

  function updateList(id: string, patch: Partial<Pick<TaskList, 'name' | 'color'>>) {
    const prev = listById.value.get(id)
    if (!prev) return
    const next = { ...prev, ...patch }
    if (patch.name !== undefined) next.name = normalizeName(patch.name, lists.value, id)
    lists.value = lists.value.map((l) => (l.id === id ? next : l))
    persistence.saveList(next)
  }

  /** Deletes a list; its tasks are kept and simply leave the list. */
  function deleteList(id: string) {
    useTaskStore().clearList(id)
    lists.value = lists.value.filter((l) => l.id !== id)
    persistence.deleteList(id)
  }

  return {
    calendars,
    lists,
    sortedCalendars,
    sortedLists,
    calendarById,
    listById,
    visibleCalendarIds,
    defaultCalendarId,
    colorOf,
    hydrate,
    seedDefaults,
    createCalendar,
    updateCalendar,
    toggleCalendar,
    deleteCalendar,
    createList,
    updateList,
    deleteList,
  }
})
