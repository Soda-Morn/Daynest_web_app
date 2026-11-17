/**
 * Core data model.
 *
 * Dates are stored as local calendar dates ("YYYY-MM-DD") and times as local
 * wall-clock times ("HH:mm"). A personal planner deals in "floating" time:
 * "gym at 7:00" means 7:00 wherever the user is, so we deliberately do not
 * convert these to UTC. Audit timestamps (createdAt/updatedAt/completedAt)
 * are real instants and are stored as ISO-8601 UTC strings.
 */

export type DateKey = string // YYYY-MM-DD
export type TimeKey = string // HH:mm (24h)
export type ISODateTime = string

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled'
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurrenceRule {
  freq: RecurrenceFreq
  /** Repeat every N units (>= 1). */
  interval: number
  /** Weekly only: 0 = Sunday … 6 = Saturday. Empty/undefined = weekday of the start date. */
  byWeekday?: number[]
  /** Monthly only: always the last day of the month (28–31). */
  lastDayOfMonth?: boolean
  /** Last date (inclusive) on which an occurrence may happen. */
  until?: DateKey | null
  /** Maximum number of occurrences. */
  count?: number | null
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

/** Fields that can be overridden for a single occurrence of a recurring task. */
export interface OccurrenceOverride {
  deleted?: boolean
  status?: TaskStatus
  completedAt?: ISODateTime | null
  /** Moves this occurrence to another date. */
  date?: DateKey
  startTime?: TimeKey | null
  endTime?: TimeKey | null
  title?: string
  description?: string
  priority?: Priority
  subtasks?: Subtask[]
}

export interface Task {
  id: string
  title: string
  description: string
  /** First day the task occupies on the calendar. Null = unscheduled. */
  startDate: DateKey | null
  /** Deadline. For multi-day tasks this is the last day. */
  dueDate: DateKey | null
  startTime: TimeKey | null
  endTime: TimeKey | null
  priority: Priority
  /** The calendar ("category") the task belongs to. */
  calendarId: string
  listId: string | null
  status: TaskStatus
  subtasks: Subtask[]
  recurrence: RecurrenceRule | null
  /** Per-occurrence changes for recurring tasks, keyed by original occurrence date. */
  overrides: Record<DateKey, OccurrenceOverride>
  /** Minutes before start to remind. */
  reminders: number[]
  /** Manual sort order inside lists (lower first). */
  order: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  completedAt: ISODateTime | null
  /** Revision, +1 on every saved change. Used to detect concurrent edits. */
  rev?: number
}

export interface CalendarCategory {
  id: string
  name: string
  color: string
  visible: boolean
  order: number
  createdAt: ISODateTime
}

export interface TaskList {
  id: string
  name: string
  color: string
  order: number
  createdAt: ISODateTime
}

export type ThemePreference = 'system' | 'light' | 'dark'
export type CalendarView = 'month' | 'week' | 'day' | 'agenda'

export interface Settings {
  userName: string
  theme: ThemePreference
  weekStartsOn: 0 | 1
  timeFormat: '12h' | '24h'
  defaultCalendarId: string | null
  sidebarCollapsed: boolean
  calendarView: CalendarView
  /** Phones remember their own view (Month by default). */
  calendarViewMobile: CalendarView
  remindersEnabled: boolean
  /** Minutes before start added to new timed tasks; null = none. */
  defaultReminder: number | null
}

/**
 * A concrete appearance of a task on a specific date. Non-recurring tasks
 * have exactly one instance; recurring tasks have one per occurrence.
 * Instances are computed views — never persisted.
 */
export interface TaskInstance {
  /** Stable key: taskId for one-off tasks, `${taskId}@${originalDate}` for occurrences. */
  key: string
  task: Task
  /** Original occurrence date (recurring) or null (one-off). */
  occurrence: DateKey | null
  title: string
  description: string
  startDate: DateKey | null
  dueDate: DateKey | null
  startTime: TimeKey | null
  endTime: TimeKey | null
  priority: Priority
  status: TaskStatus
  subtasks: Subtask[]
  completedAt: ISODateTime | null
}

export type RecurringEditScope = 'this' | 'future' | 'all'

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>

export type TaskDraft = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'title'>> & { title: string }
