import { DEFAULT_SETTINGS } from '@/constants'

/**
 * Converts between the app's data model and database rows.
 * `user_id` is never sent: the database fills it from the signed-in user
 * (default auth.uid()) and RLS rejects anything else.
 */

/* ---------- tasks ---------- */

/** Columns read from the server (no user_id, no generated columns). */
export const TASK_COLUMNS =
  'id,list_id,category_id,title,description,start_date,due_date,start_time,end_time,priority,status,completed_at,position,subtasks,recurrence,overrides,reminder_offsets,rev,created_at,updated_at,deleted_at'

const hhmm = (t) => (t ? t.slice(0, 5) : null)

export function taskToRow(t) {
  return {
    id: t.id,
    list_id: t.listId,
    category_id: t.calendarId || null,
    title: t.title,
    description: t.description,
    start_date: t.startDate,
    due_date: t.dueDate,
    start_time: t.startTime,
    end_time: t.endTime,
    priority: t.priority,
    status: t.status,
    completed_at: t.completedAt,
    position: t.order,
    subtasks: t.subtasks,
    recurrence: t.recurrence,
    overrides: t.overrides,
    reminder_offsets: t.reminders,
    rev: t.rev ?? 1,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

export function rowToTask(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    startDate: r.start_date,
    dueDate: r.due_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    priority: r.priority,
    calendarId: r.category_id ?? '',
    listId: r.list_id,
    status: r.status,
    subtasks: r.subtasks ?? [],
    recurrence: r.recurrence ?? null,
    overrides: r.overrides ?? {},
    reminders: r.reminder_offsets ?? [],
    order: Number(r.position) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    rev: r.rev,
  }
}

/* ---------- categories (calendars) ---------- */

export const CATEGORY_COLUMNS = 'id,name,color,is_visible,position,created_at,updated_at,deleted_at'

export const calendarToRow = (c) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  is_visible: c.visible,
  position: c.order,
  created_at: c.createdAt,
})

export const rowToCalendar = (r) => ({
  id: r.id,
  name: r.name,
  color: r.color,
  visible: r.is_visible,
  order: r.position,
  createdAt: r.created_at,
})

/* ---------- lists ---------- */

export const LIST_COLUMNS = 'id,name,color,position,created_at,updated_at,deleted_at'

export const listToRow = (l) => ({ id: l.id, name: l.name, color: l.color, position: l.order, created_at: l.createdAt })

export const rowToList = (r) => ({ id: r.id, name: r.name, color: r.color, order: r.position, createdAt: r.created_at })

/* ---------- settings (user_settings + profile name) ---------- */

export const SETTINGS_COLUMNS = 'theme,week_start,time_format,timezone,preferences,updated_at'

const PREF_KEYS = ['defaultCalendarId', 'sidebarCollapsed', 'calendarView', 'calendarViewMobile', 'remindersEnabled', 'defaultReminder']

export function settingsToRow(s) {
  const preferences = {}
  for (const k of PREF_KEYS) preferences[k] = s[k]
  return {
    theme: s.theme,
    week_start: s.weekStartsOn,
    time_format: s.timeFormat,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    preferences,
  }
}

export function rowToSettings(r, fullName) {
  const p = r.preferences ?? {}
  const out = { ...DEFAULT_SETTINGS, theme: r.theme, weekStartsOn: r.week_start, timeFormat: r.time_format, userName: fullName ?? '' }
  for (const k of PREF_KEYS) if (p[k] !== undefined) out[k] = p[k]
  return out
}
