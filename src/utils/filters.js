import { isDone, isOverdue, searchText } from './task'

export const emptyFilter = () => ({ quick: 'all', priorities: [], calendarIds: [], listIds: [], query: '' })

export function isFilterActive(f) {
  return f.quick !== 'all' || !!f.priorities.length || !!f.calendarIds.length || !!f.listIds.length || !!f.query.trim()
}

/**
 * Builds a predicate once (sets, lower-cased terms) so filtering thousands of
 * instances is a tight loop with no per-item allocations.
 */
export function makePredicate(f, today, names) {
  const pr = f.priorities.length ? new Set(f.priorities) : null
  const cal = f.calendarIds.length ? new Set(f.calendarIds) : null
  const lst = f.listIds.length ? new Set(f.listIds) : null
  const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean)

  return (i) => {
    switch (f.quick) {
      case 'today':
        if (isDone(i.status) || !i.startDate || i.startDate > today || (i.dueDate ?? i.startDate) < today) return false
        break
      case 'upcoming':
        if (isDone(i.status) || !i.startDate || i.startDate <= today) return false
        break
      case 'overdue':
        if (!isOverdue(i, today)) return false
        break
      case 'completed':
        if (i.status !== 'completed') return false
        break
      case 'unscheduled':
        if (isDone(i.status) || i.startDate) return false
        break
    }
    if (pr && !pr.has(i.priority)) return false
    if (cal && !cal.has(i.task.calendarId)) return false
    if (lst && !lst.has(i.task.listId ?? '')) return false
    if (terms.length) {
      const hay = searchText(i.task, names.calendar(i.task.calendarId), names.list(i.task.listId))
      const own = i.title !== i.task.title ? i.title.toLowerCase() + '\n' : ''
      for (const t of terms) if (!hay.includes(t) && !own.includes(t)) return false
    }
    return true
  }
}
