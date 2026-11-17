/**
 * Date helpers working on local calendar dates ("YYYY-MM-DD").
 * Everything is done with integer y/m/d arithmetic or local Date objects at
 * noon, so daylight-saving transitions can never shift a day.
 */

const pad = (n) => (n < 10 ? '0' + n : String(n))

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key) {
  const y = +key.slice(0, 4)
  const m = +key.slice(5, 7)
  const d = +key.slice(8, 10)
  return new Date(y, m - 1, d, 12)
}

export function isValidKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = fromKey(key)
  return toKey(d) === key
}

export function makeKey(y, m0, d) {
  return toKey(new Date(y, m0, d, 12))
}

export function todayKey(now = new Date()) {
  return toKey(now)
}

export function addDays(key, n) {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function daysInMonth(y, m0) {
  return new Date(y, m0 + 1, 0).getDate()
}

/** Adds months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(key, n) {
  const d = fromKey(key)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12)
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())))
  return toKey(target)
}

export function addYears(key, n) {
  return addMonths(key, n * 12)
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000)
}

export function weekday(key) {
  return fromKey(key).getDay()
}

export function startOfWeek(key, weekStartsOn) {
  const wd = weekday(key)
  return addDays(key, -((wd - weekStartsOn + 7) % 7))
}

export function startOfMonth(key) {
  return key.slice(0, 8) + '01'
}

export function endOfMonth(key) {
  const d = fromKey(key)
  return makeKey(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth()))
}

/** Inclusive list of keys from start to end. */
export function eachDay(start, end) {
  const out = []
  const d = fromKey(start)
  const last = fromKey(end).getTime()
  while (d.getTime() <= last) {
    out.push(toKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Weeks (arrays of 7 keys) covering the month that contains `key`. */
export function monthGrid(key, weekStartsOn) {
  const first = startOfWeek(startOfMonth(key), weekStartsOn)
  const last = endOfMonth(key)
  const weeks = []
  let cursor = first
  while (cursor <= last || weeks.length < 5) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor)
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
    if (weeks.length === 6) break
  }
  return weeks
}

export function isSameMonth(a, b) {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function minKey(a, b) {
  return a < b ? a : b
}

export function maxKey(a, b) {
  return a > b ? a : b
}

/* ---------- Time ---------- */

export function timeToMinutes(t) {
  return +t.slice(0, 2) * 60 + +t.slice(3, 5)
}

export function minutesToTime(min) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function isValidTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

export function nowTime(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/* ---------- Formatting (Intl formatters are cached; creating them is costly) ---------- */

const fmtCache = new Map()
function fmt(opts) {
  const id = JSON.stringify(opts)
  let f = fmtCache.get(id)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, opts)
    fmtCache.set(id, f)
  }
  return f
}

export function formatDate(key, opts) {
  return fmt(opts).format(fromKey(key))
}

export function formatTime(t, format = '12h') {
  if (format === '24h') return t
  const h = +t.slice(0, 2)
  const m = t.slice(3, 5)
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === '00' ? `${h12}${suffix}` : `${h12}:${m}${suffix}`
}

export function formatHourLabel(h, format) {
  if (format === '24h') return `${pad(h)}:00`
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

/** "Today", "Tomorrow", "Yesterday", weekday name within a week, otherwise "Nov 20". */
export function relativeDayLabel(key, today) {
  const diff = diffDays(today, key)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return formatDate(key, { weekday: 'long' })
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  return formatDate(key, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function weekdayNames(weekStartsOn, style = 'short') {
  // 2023-01-01 was a Sunday.
  const base = '2023-01-01'
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays(base, (i + weekStartsOn) % 7), { weekday: style }))
}
