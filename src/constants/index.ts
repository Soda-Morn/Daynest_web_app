import type { Priority, Settings, TaskStatus } from '@/types/models'

/**
 * Calendar / list colours — taken only from the Daynest design system
 * (brand + semantic colours). Fills and text are derived with color-mix in
 * CSS, so every category stays readable in light and dark themes.
 */
export const PALETTE = [
  { name: 'Soft purple', value: '#8b72a8' },
  { name: 'Lilac', value: '#b9a3d1' },
  { name: 'Soft blue', value: '#91b5d3' },
  { name: 'Soft green', value: '#8baf91' },
  { name: 'Warm yellow', value: '#e6c477' },
  { name: 'Muted rose', value: '#d68c91' },
] as const

/** Colours from earlier versions mapped to the current palette (one-time migration). */
export const LEGACY_COLOR_MAP: Record<string, string> = {
  // original violet palette
  '#8b7cf6': '#8b72a8',
  '#5b8def': '#91b5d3',
  '#3fb4d8': '#91b5d3',
  '#3fbf8f': '#8baf91',
  '#8fb34a': '#8baf91',
  '#e5a93b': '#e6c477',
  '#ee8a5d': '#d68c91',
  '#e86f8f': '#d68c91',
  '#c06fd4': '#b9a3d1',
  '#7c8798': '#b9a3d1',
  // forest & sage palette
  '#789477': '#8b72a8',
  '#4f6f5a': '#8baf91',
  '#8e9a4f': '#8baf91',
  '#c9a46e': '#e6c477',
  '#c8913a': '#e6c477',
  '#c27358': '#d68c91',
  '#b77a80': '#d68c91',
  '#8b7396': '#b9a3d1',
  '#6b8aa3': '#91b5d3',
  '#8a877c': '#b9a3d1',
}

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const REMINDER_OPTIONS = [
  { value: 0, label: 'At start time' },
  { value: 5, label: '5 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 24 * 60, label: '1 day before' },
]

/** Created on first launch so the app is usable immediately. Users can edit or delete them. */
export const DEFAULT_CALENDARS = [
  { name: 'Personal', color: '#8b72a8' },
  { name: 'Work', color: '#91b5d3' },
  { name: 'Fitness', color: '#8baf91' },
  { name: 'Family', color: '#d68c91' },
  { name: 'Study', color: '#e6c477' },
]

export const DEFAULT_LISTS = [
  { name: 'Home', color: '#8baf91' },
  { name: 'Shopping', color: '#d68c91' },
  { name: 'Work Projects', color: '#91b5d3' },
  { name: 'Learning', color: '#e6c477' },
  { name: 'Personal Goals', color: '#b9a3d1' },
]

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  theme: 'system',
  weekStartsOn: 0,
  timeFormat: '12h',
  defaultCalendarId: null,
  sidebarCollapsed: false,
  calendarView: 'month',
  calendarViewMobile: 'month',
  remindersEnabled: false,
  defaultReminder: null,
}

export const MOTIVATION = [
  "Let's make today productive.",
  'Small steps still move you forward.',
  'One task at a time. You have got this.',
  'Focus on what matters most today.',
  'Progress, not perfection.',
  'A calm plan makes a good day.',
  'Start with the easiest win.',
  'Future you will be grateful.',
]

export const MOBILE_BREAKPOINT = 768
export const HOUR_HEIGHT = 52 // px per hour in week/day views
export const SNAP_MINUTES = 15
