/**
 * Daynest data model (JSDoc types — editors use these for autocompletion and
 * warnings; there is no build-time type checking).
 *
 * Dates are local calendar dates ("YYYY-MM-DD") and times are local
 * wall-clock times ("HH:mm"). A planner deals in "floating" time: "gym at
 * 7:00" means 7:00 wherever you are, so these are never converted to UTC.
 * Audit timestamps (createdAt / updatedAt / completedAt) are real instants,
 * stored as ISO-8601 UTC strings.
 */

/** @typedef {string} DateKey  "YYYY-MM-DD" */
/** @typedef {string} TimeKey  "HH:mm" (24h) */
/** @typedef {string} ISODateTime */

/** @typedef {'low' | 'medium' | 'high' | 'urgent'} Priority */
/** @typedef {'todo' | 'in_progress' | 'completed' | 'cancelled'} TaskStatus */
/** @typedef {'daily' | 'weekly' | 'monthly' | 'yearly'} RecurrenceFreq */
/** @typedef {'system' | 'light' | 'dark'} ThemePreference */
/** @typedef {'month' | 'week' | 'day' | 'agenda'} CalendarView */
/** @typedef {'this' | 'future' | 'all'} RecurringEditScope */

/**
 * @typedef {object} RecurrenceRule
 * @property {RecurrenceFreq} freq
 * @property {number} interval            Repeat every N units (>= 1).
 * @property {number[]} [byWeekday]       Weekly only: 0 = Sunday … 6 = Saturday.
 * @property {boolean} [lastDayOfMonth]   Monthly only: always the month's last day.
 * @property {DateKey | null} [until]     Last date (inclusive) an occurrence may happen.
 * @property {number | null} [count]      Maximum number of occurrences.
 */

/**
 * @typedef {object} Subtask
 * @property {string} id
 * @property {string} title
 * @property {boolean} done
 */

/**
 * Fields that can be changed for a single occurrence of a recurring task.
 * @typedef {object} OccurrenceOverride
 * @property {boolean} [deleted]
 * @property {TaskStatus} [status]
 * @property {ISODateTime | null} [completedAt]
 * @property {DateKey} [date]                 Moves this occurrence to another date.
 * @property {TimeKey | null} [startTime]
 * @property {TimeKey | null} [endTime]
 * @property {string} [title]
 * @property {string} [description]
 * @property {Priority} [priority]
 * @property {Subtask[]} [subtasks]
 */

/**
 * A task. Tasks with a date (and optional time) are also the calendar items.
 * Task objects are treated as immutable: every change creates a new object.
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {DateKey | null} startDate   First day on the calendar; null = unscheduled.
 * @property {DateKey | null} dueDate     Deadline; the last day for multi-day tasks.
 * @property {TimeKey | null} startTime
 * @property {TimeKey | null} endTime
 * @property {Priority} priority
 * @property {string} calendarId          The calendar ("category") it belongs to.
 * @property {string | null} listId
 * @property {TaskStatus} status
 * @property {Subtask[]} subtasks
 * @property {RecurrenceRule | null} recurrence
 * @property {Record<DateKey, OccurrenceOverride>} overrides   Per-occurrence changes (recurring tasks).
 * @property {number[]} reminders         Minutes before start.
 * @property {number} order               Manual sort order (lower first).
 * @property {ISODateTime} createdAt
 * @property {ISODateTime} updatedAt
 * @property {ISODateTime | null} completedAt
 * @property {number} [rev]               Revision, +1 per saved change (conflict detection).
 */

/**
 * @typedef {object} CalendarCategory
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {boolean} visible
 * @property {number} order
 * @property {ISODateTime} createdAt
 */

/**
 * @typedef {object} TaskList
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {number} order
 * @property {ISODateTime} createdAt
 */

/**
 * @typedef {object} Settings
 * @property {string} userName
 * @property {ThemePreference} theme
 * @property {0 | 1} weekStartsOn
 * @property {'12h' | '24h'} timeFormat
 * @property {string | null} defaultCalendarId
 * @property {boolean} sidebarCollapsed
 * @property {CalendarView} calendarView
 * @property {CalendarView} calendarViewMobile
 * @property {boolean} remindersEnabled
 * @property {number | null} defaultReminder   Minutes before start for new timed tasks.
 */

/**
 * One appearance of a task on a date. One-off tasks have exactly one;
 * recurring tasks have one per occurrence. Computed, never stored.
 * @typedef {object} TaskInstance
 * @property {string} key                 taskId, or `${taskId}@${originalDate}` for occurrences.
 * @property {Task} task
 * @property {DateKey | null} occurrence  Original occurrence date (recurring) or null.
 * @property {string} title
 * @property {string} description
 * @property {DateKey | null} startDate
 * @property {DateKey | null} dueDate
 * @property {TimeKey | null} startTime
 * @property {TimeKey | null} endTime
 * @property {Priority} priority
 * @property {TaskStatus} status
 * @property {Subtask[]} subtasks
 * @property {ISODateTime | null} completedAt
 */

/**
 * A group of tasks under a heading (list pages).
 * @typedef {object} TaskGroup
 * @property {string} id
 * @property {string} label
 * @property {'default' | 'late'} [tone]
 * @property {TaskInstance[]} items
 */

export {}
