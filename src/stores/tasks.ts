import { defineStore } from 'pinia'
import { computed, shallowRef, triggerRef } from 'vue'
import type {
  DateKey,
  OccurrenceOverride,
  RecurringEditScope,
  Task,
  TaskDraft,
  TaskInstance,
  TaskPatch,
} from '@/types/models'
import { persistence } from '@/services/persistence'
import { addDays, diffDays, eachDay } from '@/utils/date'
import { nextOccurrence } from '@/utils/recurrence'
import {
  compareByDate,
  compareInstances,
  expandTask,
  isDone,
  occurrenceInstance,
  oneOffInstance,
  seriesStart,
  spanDays,
} from '@/utils/task'
import { normalizeTask, uid } from '@/utils/validation'

/** Fields an instance edit may change. */
export type InstancePatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'startDate'
    | 'dueDate'
    | 'startTime'
    | 'endTime'
    | 'priority'
    | 'status'
    | 'subtasks'
    | 'calendarId'
    | 'listId'
    | 'recurrence'
    | 'reminders'
  >
>

/** Previous versions of touched tasks (undefined = did not exist). Used for undo. */
export type TaskSnapshot = Map<string, Task | undefined>

const OVERRIDABLE = ['title', 'description', 'priority', 'startTime', 'endTime', 'subtasks', 'status'] as const
const MAX_INDEXED_SPAN = 400 // days; guards against absurd multi-year spans

export const useTaskStore = defineStore('tasks', () => {
  /**
   * All tasks by id. A shallowRef around a Map: Vue tracks the Map as a
   * whole (we call triggerRef after each change) instead of making every
   * task deeply reactive, which keeps memory and reactivity overhead flat
   * with thousands of tasks. Task objects are treated as immutable.
   */
  const byId = shallowRef(new Map<string, Task>())

  /* ---------------- Index ---------------- */

  /**
   * Date index, rebuilt once per change (O(n)). Views then read only the days
   * they show, instead of filtering every task on every render.
   */
  const index = computed(() => {
    const byDay = new Map<DateKey, Task[]>()
    const recurring: Task[] = []
    const unscheduled: Task[] = []
    for (const t of byId.value.values()) {
      const start = seriesStart(t)
      if (!start) {
        unscheduled.push(t)
        continue
      }
      if (t.recurrence) {
        recurring.push(t)
        continue
      }
      const end = t.dueDate ?? start
      const span = Math.min(diffDays(start, end), MAX_INDEXED_SPAN)
      let d = start
      for (let i = 0; i <= span; i++) {
        let arr = byDay.get(d)
        if (!arr) byDay.set(d, (arr = []))
        arr.push(t)
        d = addDays(d, 1)
      }
    }
    return { byDay, recurring, unscheduled }
  })

  const count = computed(() => byId.value.size)
  const tasks = computed(() => [...byId.value.values()])

  function get(id: string): Task | undefined {
    return byId.value.get(id)
  }

  /** Unique instances that touch [start, end], optionally limited to some calendars. */
  function instancesInRange(start: DateKey, end: DateKey, calendarFilter?: Set<string> | null): TaskInstance[] {
    const { byDay, recurring } = index.value
    const seen = new Set<string>()
    const out: TaskInstance[] = []
    const allow = (t: Task) => !calendarFilter || calendarFilter.has(t.calendarId)
    for (const day of eachDay(start, end)) {
      const list = byDay.get(day)
      if (!list) continue
      for (const t of list) {
        if (seen.has(t.id) || !allow(t)) continue
        seen.add(t.id)
        out.push(oneOffInstance(t))
      }
    }
    for (const t of recurring) if (allow(t)) out.push(...expandTask(t, start, end))
    return out
  }

  /** Instances grouped per day (multi-day items appear on each day), each day sorted. */
  function dayMap(start: DateKey, end: DateKey, calendarFilter?: Set<string> | null): Map<DateKey, TaskInstance[]> {
    const map = new Map<DateKey, TaskInstance[]>()
    for (const inst of instancesInRange(start, end, calendarFilter)) {
      const s = inst.startDate! < start ? start : inst.startDate!
      const e = inst.dueDate! > end ? end : inst.dueDate!
      for (let d = s; d <= e; d = addDays(d, 1)) {
        let arr = map.get(d)
        if (!arr) map.set(d, (arr = []))
        arr.push(inst)
      }
    }
    for (const arr of map.values()) arr.sort(compareInstances)
    return map
  }

  /**
   * One instance per task for list pages: one-off tasks as themselves,
   * recurring series as their next open occurrence (from `today`).
   */
  function listInstances(today: DateKey): TaskInstance[] {
    const out: TaskInstance[] = []
    for (const t of byId.value.values()) {
      if (!t.recurrence) {
        out.push(oneOffInstance(t))
        continue
      }
      const start = seriesStart(t)!
      let from = today < start ? start : today
      // Skip already-completed/deleted occurrences (bounded look-ahead).
      for (let i = 0; i < 60; i++) {
        const next = nextOccurrence(start, t.recurrence, from)
        if (!next) break
        const o = t.overrides[next]
        if (!o?.deleted && !(o?.status && isDone(o.status))) {
          out.push(occurrenceInstance(t, next))
          break
        }
        from = addDays(next, 1)
      }
    }
    return out
  }

  /** Unfinished one-off tasks whose due date is before `today`, oldest first. */
  function overdueInstances(today: DateKey): TaskInstance[] {
    const out: TaskInstance[] = []
    for (const t of byId.value.values()) {
      if (t.recurrence || isDone(t.status) || !t.dueDate || t.dueDate >= today) continue
      out.push(oneOffInstance(t))
    }
    return out.sort(compareByDate)
  }

  /** Re-resolves an instance after its task changed (keeps panels in sync). */
  function resolveInstance(key: string): TaskInstance | null {
    const at = key.indexOf('@')
    const id = at === -1 ? key : key.slice(0, at)
    const t = byId.value.get(id)
    if (!t) return null
    if (at === -1) return t.recurrence ? null : oneOffInstance(t)
    const occ = key.slice(at + 1)
    if (!t.recurrence || t.overrides[occ]?.deleted) return null
    return occurrenceInstance(t, occ)
  }

  /* ---------------- Low-level writes ---------------- */

  function put(t: Task, snap?: TaskSnapshot) {
    const prev = byId.value.get(t.id)
    if (snap && !snap.has(t.id)) snap.set(t.id, prev)
    // Every saved change bumps the revision; persistence uses `prev` to
    // detect and merge edits made in another window meanwhile.
    const next = { ...t, rev: (prev?.rev ?? t.rev ?? 0) + 1 }
    byId.value.set(t.id, next)
    persistence.saveTask(next, prev)
  }

  function drop(id: string, snap?: TaskSnapshot) {
    const prev = byId.value.get(id)
    if (snap && !snap.has(id)) snap.set(id, prev)
    byId.value.delete(id)
    persistence.deleteTask(id, prev)
  }

  /**
   * Applies records that are already saved (changed by another window, or
   * the result of a merge). Updates memory only — never writes back.
   */
  function applyExternal(tasks: Task[], deletedIds: string[] = []) {
    let changed = false
    for (const raw of tasks) {
      try {
        // Records come straight from storage, so they are the current truth.
        // A still-unsaved local edit for the same task is merged on its flush.
        const t = normalizeTask(raw)
        byId.value.set(t.id, t)
        changed = true
      } catch {
        /* ignore invalid record */
      }
    }
    for (const id of deletedIds) if (byId.value.delete(id)) changed = true
    if (changed) commit()
  }

  const commit = () => triggerRef(byId)

  function nextOrder(): number {
    let max = 0
    for (const t of byId.value.values()) if (t.order > max) max = t.order
    return max + 1000
  }

  /* ---------------- Public mutations (all optimistic) ---------------- */

  function hydrate(list: Task[]) {
    const map = new Map<string, Task>()
    for (const raw of list) {
      try {
        const t = normalizeTask(raw)
        map.set(t.id, t)
      } catch {
        // Skip corrupt records instead of failing the whole load.
      }
    }
    byId.value = map
  }

  function createTask(draft: TaskDraft, defaultCalendarId: string): { task: Task; snapshot: TaskSnapshot } {
    const now = new Date().toISOString()
    const task = normalizeTask({
      description: '',
      startDate: null,
      dueDate: null,
      startTime: null,
      endTime: null,
      priority: 'medium',
      listId: null,
      status: 'todo',
      subtasks: [],
      recurrence: null,
      overrides: {},
      reminders: [],
      completedAt: null,
      ...draft,
      calendarId: draft.calendarId || defaultCalendarId,
      id: uid(),
      order: draft.order ?? nextOrder(),
      createdAt: now,
      updatedAt: now,
    } as Task)
    const snapshot: TaskSnapshot = new Map()
    put(task, snapshot)
    commit()
    return { task, snapshot }
  }

  function updateTask(id: string, patch: TaskPatch, snap: TaskSnapshot = new Map()): TaskSnapshot {
    const prev = byId.value.get(id)
    if (!prev) return snap
    const next = normalizeTask({ ...prev, ...patch, id, updatedAt: new Date().toISOString() })
    if (patch.status === 'completed' && prev.status !== 'completed') next.completedAt = new Date().toISOString()
    put(next, snap)
    commit()
    return snap
  }

  function setOverride(task: Task, occurrence: DateKey, o: OccurrenceOverride, snap: TaskSnapshot) {
    const merged: OccurrenceOverride = { ...task.overrides[occurrence], ...o }
    put({ ...task, overrides: { ...task.overrides, [occurrence]: merged }, updatedAt: new Date().toISOString() }, snap)
  }

  /** Converts an instance-level date edit into series/task fields. */
  function shiftedDates(inst: TaskInstance, patch: InstancePatch, base: Task) {
    const out: TaskPatch = {}
    if (patch.startDate === undefined && patch.dueDate === undefined) return out
    const instStart = inst.startDate
    const newStart = patch.startDate !== undefined ? patch.startDate : instStart
    const newDue = patch.dueDate !== undefined ? patch.dueDate : newStart && inst.dueDate && instStart
      ? addDays(newStart, diffDays(instStart, inst.dueDate))
      : newStart
    if (!base.recurrence) {
      out.startDate = newStart
      out.dueDate = newDue
      return out
    }
    // Shift the whole series by the same delta.
    const start = seriesStart(base)!
    if (!newStart) {
      out.recurrence = null
      out.startDate = null
      out.dueDate = null
      return out
    }
    const delta = instStart ? diffDays(instStart, newStart) : 0
    out.startDate = addDays(start, delta)
    out.dueDate = addDays(out.startDate, newDue && newStart ? Math.max(0, diffDays(newStart, newDue)) : spanDays(base))
    return out
  }

  /**
   * Edits an instance. For recurring tasks `scope` decides whether the
   * change applies to this occurrence, this-and-following, or the series.
   */
  function updateInstance(inst: TaskInstance, patch: InstancePatch, scope: RecurringEditScope = 'this'): TaskSnapshot {
    const snap: TaskSnapshot = new Map()
    const task = byId.value.get(inst.task.id)
    if (!task) return snap

    if (!task.recurrence || !inst.occurrence) {
      return updateTask(task.id, { ...patch, ...shiftedDates(inst, patch, task) }, snap)
    }

    const occ = inst.occurrence
    if (scope === 'future' && occ === seriesStart(task)) scope = 'all'

    if (scope === 'this') {
      const o: OccurrenceOverride = {}
      for (const k of OVERRIDABLE) if (patch[k] !== undefined) (o as Record<string, unknown>)[k] = patch[k]
      if (patch.status !== undefined) o.completedAt = patch.status === 'completed' ? new Date().toISOString() : null
      if (patch.startDate) o.date = patch.startDate
      const seriesPatch: TaskPatch = {}
      for (const k of ['calendarId', 'listId', 'reminders'] as const) if (patch[k] !== undefined) (seriesPatch as Record<string, unknown>)[k] = patch[k]
      setOverride(task, occ, o, snap)
      if (Object.keys(seriesPatch).length) updateTask(task.id, seriesPatch, snap)
      commit()
      return snap
    }

    const { status: _ignored, ...seriesFields } = patch
    if (scope === 'all') {
      return updateTask(task.id, { ...seriesFields, ...shiftedDates(inst, patch, task) }, snap)
    }

    // scope === 'future': end the current series the day before and start a new one.
    const before: Record<DateKey, OccurrenceOverride> = {}
    const after: Record<DateKey, OccurrenceOverride> = {}
    for (const [d, o] of Object.entries(task.overrides)) (d < occ ? before : after)[d] = o
    updateTask(task.id, { recurrence: { ...task.recurrence, until: addDays(occ, -1), count: null }, overrides: before }, snap)
    const span = spanDays(task)
    const tail: Task = {
      ...task,
      id: uid(),
      startDate: occ,
      dueDate: task.dueDate ? addDays(occ, span) : null,
      recurrence: { ...task.recurrence, count: null },
      overrides: after,
      createdAt: new Date().toISOString(),
    }
    const tailInst = occurrenceInstance(tail, occ)
    const created = normalizeTask({ ...tail, ...seriesFields, ...shiftedDates(tailInst, patch, tail), updatedAt: new Date().toISOString() })
    put(created, snap)
    commit()
    return snap
  }

  function setCompleted(inst: TaskInstance, done: boolean): TaskSnapshot {
    return updateInstance(inst, { status: done ? 'completed' : 'todo' }, 'this')
  }

  function deleteInstance(inst: TaskInstance, scope: RecurringEditScope = 'all'): TaskSnapshot {
    const snap: TaskSnapshot = new Map()
    const task = byId.value.get(inst.task.id)
    if (!task) return snap
    const occ = inst.occurrence
    if (!task.recurrence || !occ || scope === 'all' || (scope === 'future' && occ === seriesStart(task))) {
      drop(task.id, snap)
    } else if (scope === 'this') {
      setOverride(task, occ, { deleted: true }, snap)
    } else {
      const before = Object.fromEntries(Object.entries(task.overrides).filter(([d]) => d < occ))
      updateTask(task.id, { recurrence: { ...task.recurrence, until: addDays(occ, -1), count: null }, overrides: before }, snap)
    }
    commit()
    return snap
  }

  function deleteTasks(ids: string[]): TaskSnapshot {
    const snap: TaskSnapshot = new Map()
    for (const id of ids) if (byId.value.has(id)) drop(id, snap)
    commit()
    return snap
  }

  /** Moves an instance to a new start date (and optionally new times), keeping its length. */
  function moveInstance(
    inst: TaskInstance,
    newStart: DateKey,
    times?: { startTime: string | null; endTime: string | null },
  ): TaskSnapshot {
    const patch: InstancePatch = { startDate: newStart }
    if (inst.startDate && inst.dueDate) patch.dueDate = addDays(newStart, diffDays(inst.startDate, inst.dueDate))
    if (times) {
      patch.startTime = times.startTime
      patch.endTime = times.endTime
    }
    return updateInstance(inst, patch, 'this')
  }

  function duplicateInstance(inst: TaskInstance): { task: Task; snapshot: TaskSnapshot } {
    const t = inst.task
    return createTask(
      {
        title: inst.title,
        description: inst.description,
        startDate: inst.startDate,
        dueDate: inst.dueDate,
        startTime: inst.startTime,
        endTime: inst.endTime,
        priority: inst.priority,
        calendarId: t.calendarId,
        listId: t.listId,
        subtasks: inst.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
        recurrence: t.recurrence,
        reminders: t.reminders,
        order: t.order + 1,
      },
      t.calendarId,
    )
  }

  /** Persists a manual order for the given instances (in display order). */
  function reorder(instances: TaskInstance[]): TaskSnapshot {
    const snap: TaskSnapshot = new Map()
    const orders = instances.map((i) => i.task.order).sort((a, b) => a - b)
    // Reuse the existing order values so other lists keep their relative order.
    const unique = new Set(orders).size === orders.length
    instances.forEach((inst, i) => {
      const t = byId.value.get(inst.task.id)
      if (!t) return
      const order = unique ? orders[i] : (i + 1) * 1000
      if (t.order !== order) put({ ...t, order, updatedAt: new Date().toISOString() }, snap)
    })
    commit()
    return snap
  }

  /** Re-assigns every task in a calendar (used when a calendar is deleted). */
  function reassignCalendar(fromId: string, toId: string) {
    for (const t of [...byId.value.values()]) if (t.calendarId === fromId) put({ ...t, calendarId: toId })
    commit()
  }

  function clearList(listId: string) {
    for (const t of [...byId.value.values()]) if (t.listId === listId) put({ ...t, listId: null })
    commit()
  }

  function restore(snap: TaskSnapshot) {
    for (const [id, t] of snap) {
      if (t) put(t)
      else drop(id)
    }
    commit()
  }

  /** Bulk insert (import / performance testing). */
  function replaceAll(list: Task[]) {
    hydrate(list)
  }

  return {
    byId,
    tasks,
    count,
    index,
    get,
    instancesInRange,
    dayMap,
    listInstances,
    overdueInstances,
    resolveInstance,
    hydrate,
    applyExternal,
    createTask,
    updateTask,
    updateInstance,
    setCompleted,
    deleteInstance,
    deleteTasks,
    moveInstance,
    duplicateInstance,
    reorder,
    reassignCalendar,
    clearList,
    restore,
    replaceAll,
  }
})
