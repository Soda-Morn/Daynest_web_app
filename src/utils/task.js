import { addDays, diffDays, timeToMinutes } from './date'
import { occurrencesInRange } from './recurrence'

/* ---------- Instances ---------- */

// Instances are cached per Task object. Tasks are immutable (every update
// replaces the object), so a cached instance is valid exactly as long as its
// Task object is alive — identity stays stable and components don't re-render.
const oneOffCache = new WeakMap()
const occurrenceCache = new WeakMap()

export function seriesStart(task) {
  return task.startDate ?? task.dueDate
}

/** Length of the task in extra days (0 = single day). */
export function spanDays(task) {
  if (!task.startDate || !task.dueDate) return 0
  return Math.max(0, diffDays(task.startDate, task.dueDate))
}

export function oneOffInstance(task) {
  let inst = oneOffCache.get(task)
  if (!inst) {
    inst = {
      key: task.id,
      task,
      occurrence: null,
      title: task.title,
      description: task.description,
      startDate: task.startDate ?? task.dueDate,
      dueDate: task.dueDate ?? task.startDate,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      status: task.status,
      subtasks: task.subtasks,
      completedAt: task.completedAt,
    }
    oneOffCache.set(task, inst)
  }
  return inst
}

export function occurrenceInstance(task, original) {
  let byDate = occurrenceCache.get(task)
  if (!byDate) {
    byDate = new Map()
    occurrenceCache.set(task, byDate)
  }
  let inst = byDate.get(original)
  if (!inst) {
    const o = task.overrides[original] ?? {}
    const start = o.date ?? original
    // Status of an occurrence is independent of the series; "cancelled" on
    // the series itself is respected though.
    const status = o.status ?? (task.status === 'cancelled' ? 'cancelled' : task.status === 'in_progress' ? 'in_progress' : 'todo')
    inst = {
      key: `${task.id}@${original}`,
      task,
      occurrence: original,
      title: o.title ?? task.title,
      description: o.description ?? task.description,
      startDate: start,
      dueDate: addDays(start, spanDays(task)),
      startTime: o.startTime !== undefined ? o.startTime : task.startTime,
      endTime: o.endTime !== undefined ? o.endTime : task.endTime,
      priority: o.priority ?? task.priority,
      status,
      subtasks: o.subtasks ?? task.subtasks.map((s) => (s.done ? { ...s, done: false } : s)),
      completedAt: o.completedAt ?? null,
    }
    byDate.set(original, inst)
  }
  return inst
}

/** All instances of `task` that touch [rangeStart, rangeEnd]. */
export function expandTask(task, rangeStart, rangeEnd) {
  const start = seriesStart(task)
  if (!task.recurrence) {
    if (!start) return []
    const inst = oneOffInstance(task)
    return inst.startDate <= rangeEnd && inst.dueDate >= rangeStart ? [inst] : []
  }
  if (!start) return []
  const span = spanDays(task)
  const out = []
  // Include occurrences that started before the range but still span into it.
  for (const d of occurrencesInRange(start, task.recurrence, addDays(rangeStart, -span), rangeEnd)) {
    const o = task.overrides[d]
    if (o?.deleted) continue
    if (o?.date && (o.date > rangeEnd || addDays(o.date, span) < rangeStart)) continue
    out.push(occurrenceInstance(task, d))
  }
  // Occurrences moved *into* the range from elsewhere.
  for (const [orig, o] of Object.entries(task.overrides)) {
    if (!o.date || o.deleted) continue
    if (orig >= addDays(rangeStart, -span) && orig <= rangeEnd) continue // handled above
    if (o.date <= rangeEnd && addDays(o.date, span) >= rangeStart && occurrencesInRange(start, task.recurrence, orig, orig).length) {
      out.push(occurrenceInstance(task, orig))
    }
  }
  return out
}

/* ---------- Status helpers ---------- */

export const isDone = (s) => s === 'completed' || s === 'cancelled'

export function isOverdue(inst, today) {
  return !isDone(inst.status) && !!inst.dueDate && inst.dueDate < today
}

export function isAllDay(inst) {
  return !inst.startTime
}

export function isMultiDay(inst) {
  return !!inst.startDate && !!inst.dueDate && inst.dueDate > inst.startDate
}

export function durationMinutes(inst) {
  if (!inst.startTime) return 0
  if (!inst.endTime) return 30
  return Math.max(15, timeToMinutes(inst.endTime) - timeToMinutes(inst.startTime))
}

/* ---------- Sorting ---------- */

export const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

/** Open first; then timed by time; then all-day by priority; then manual order. */
export function compareInstances(a, b) {
  const da = isDone(a.status) ? 1 : 0
  const db = isDone(b.status) ? 1 : 0
  if (da !== db) return da - db
  if (a.startTime && b.startTime && a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1
  if (!!a.startTime !== !!b.startTime) return a.startTime ? -1 : 1
  const pa = PRIORITY_RANK[a.priority]
  const pb = PRIORITY_RANK[b.priority]
  if (pa !== pb) return pa - pb
  if (a.task.order !== b.task.order) return a.task.order - b.task.order
  return a.task.createdAt < b.task.createdAt ? -1 : 1
}

/** Manual order first (used by reorderable lists). */
export function compareByOrder(a, b) {
  const da = isDone(a.status) ? 1 : 0
  const db = isDone(b.status) ? 1 : 0
  if (da !== db) return da - db
  if (a.task.order !== b.task.order) return a.task.order - b.task.order
  return compareInstances(a, b)
}

export function compareByDate(a, b) {
  const ka = a.startDate ?? '9999'
  const kb = b.startDate ?? '9999'
  if (ka !== kb) return ka < kb ? -1 : 1
  return compareInstances(a, b)
}

/* ---------- Search ---------- */

const searchCache = new WeakMap()

/** Lower-cased searchable text, cached per immutable Task object. */
export function searchText(task, calendarName = '', listName = '') {
  let s = searchCache.get(task)
  if (s === undefined) {
    s = [task.title, task.description, task.subtasks.map((x) => x.title).join(' ')].join('\n').toLowerCase()
    searchCache.set(task, s)
  }
  return calendarName || listName ? `${s}\n${calendarName.toLowerCase()}\n${listName.toLowerCase()}` : s
}

/* ---------- Validation ---------- */

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 10_000
