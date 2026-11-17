import type { CalendarCategory, Priority, RecurrenceRule, Task, TaskList, TaskStatus } from '@/types/models'
import { isValidKey, isValidTime, timeToMinutes } from './date'
import { DESCRIPTION_MAX, TITLE_MAX } from './task'

/**
 * Centralised validation/normalisation. Every task that enters the store —
 * from the UI, an import file, or the database — passes through here, so the
 * rest of the app can trust the shape of its data.
 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'completed', 'cancelled']

export class ValidationError extends Error {}

function normalizeRule(r: unknown): RecurrenceRule | null {
  if (!r || typeof r !== 'object') return null
  const rule = r as Partial<RecurrenceRule>
  if (!rule.freq || !['daily', 'weekly', 'monthly', 'yearly'].includes(rule.freq)) return null
  return {
    freq: rule.freq,
    interval: Math.min(999, Math.max(1, Math.floor(Number(rule.interval) || 1))),
    byWeekday: Array.isArray(rule.byWeekday) ? rule.byWeekday.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : undefined,
    lastDayOfMonth: rule.freq === 'monthly' && rule.lastDayOfMonth ? true : undefined,
    until: isValidKey(rule.until) ? rule.until : null,
    count: rule.count && rule.count > 0 ? Math.floor(rule.count) : null,
  }
}

/** Returns a clean copy of the task or throws ValidationError. */
export function normalizeTask(input: Task): Task {
  const title = String(input.title ?? '').trim().slice(0, TITLE_MAX)
  if (!title) throw new ValidationError('Task title is required')
  let startDate = isValidKey(input.startDate) ? input.startDate : null
  let dueDate = isValidKey(input.dueDate) ? input.dueDate : null
  if (startDate && dueDate && dueDate < startDate) [startDate, dueDate] = [dueDate, startDate]
  const startTime = (startDate || dueDate) && isValidTime(input.startTime) ? input.startTime : null
  let endTime = startTime && isValidTime(input.endTime) ? input.endTime : null
  if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime) && !(startDate && dueDate && dueDate > startDate)) endTime = null
  const status = STATUSES.includes(input.status) ? input.status : 'todo'
  const recurrence = startDate || dueDate ? normalizeRule(input.recurrence) : null
  return {
    id: input.id || uid(),
    title,
    description: String(input.description ?? '').slice(0, DESCRIPTION_MAX),
    startDate,
    dueDate,
    startTime,
    endTime,
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    calendarId: String(input.calendarId ?? ''),
    listId: input.listId ? String(input.listId) : null,
    status,
    subtasks: Array.isArray(input.subtasks)
      ? input.subtasks
          .filter((s) => s && String(s.title ?? '').trim())
          .map((s) => ({ id: s.id || uid(), title: String(s.title).trim().slice(0, TITLE_MAX), done: !!s.done }))
      : [],
    recurrence,
    overrides: recurrence && input.overrides && typeof input.overrides === 'object' ? input.overrides : {},
    reminders: Array.isArray(input.reminders) ? [...new Set(input.reminders.filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b) : [],
    order: Number.isFinite(input.order) ? input.order : Date.now(),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    completedAt: status === 'completed' ? input.completedAt || new Date().toISOString() : null,
    rev: Number.isFinite(input.rev) && input.rev! > 0 ? Math.floor(input.rev!) : 0,
  }
}

export function normalizeName(name: string, existing: { id: string; name: string }[], selfId?: string): string {
  const clean = String(name ?? '').trim().slice(0, 60)
  if (!clean) throw new ValidationError('Name is required')
  if (existing.some((e) => e.id !== selfId && e.name.toLowerCase() === clean.toLowerCase())) {
    throw new ValidationError(`"${clean}" already exists`)
  }
  return clean
}

export function isCalendar(x: unknown): x is CalendarCategory {
  const c = x as CalendarCategory
  return !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.color === 'string'
}

export function isList(x: unknown): x is TaskList {
  const l = x as TaskList
  return !!l && typeof l.id === 'string' && typeof l.name === 'string'
}
