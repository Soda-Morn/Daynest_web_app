import type { DateKey, RecurrenceRule } from '@/types/models'
import { addDays, addMonths, addYears, daysInMonth, diffDays, fromKey, makeKey, startOfWeek, weekday } from './date'

/**
 * Recurrence expansion.
 *
 * Recurring tasks are stored once; occurrences are calculated on demand for
 * the date range being displayed, so we never create duplicate records and
 * a series that runs "forever" costs nothing until it is looked at.
 *
 * All functions jump straight to the first candidate near `rangeStart`
 * instead of iterating from the series start, so expanding a daily task that
 * started years ago is still O(days in range).
 */

const MAX_OCCURRENCES_PER_CALL = 1000

function effectiveUntil(rule: RecurrenceRule, rangeEnd: DateKey): DateKey {
  return rule.until && rule.until < rangeEnd ? rule.until : rangeEnd
}

/** Occurrence dates of a series starting at `seriesStart` within [rangeStart, rangeEnd]. */
export function occurrencesInRange(
  seriesStart: DateKey,
  rule: RecurrenceRule,
  rangeStart: DateKey,
  rangeEnd: DateKey,
): DateKey[] {
  const end = effectiveUntil(rule, rangeEnd)
  if (end < seriesStart || end < rangeStart) return []
  const interval = Math.max(1, Math.floor(rule.interval || 1))

  // `count` needs ordinal positions, so fall back to the (bounded) full walk.
  if (rule.count && rule.count > 0) {
    return allOccurrences(seriesStart, rule, end).filter((d) => d >= rangeStart)
  }

  const out: DateKey[] = []
  const from = rangeStart > seriesStart ? rangeStart : seriesStart

  switch (rule.freq) {
    case 'daily': {
      const offset = diffDays(seriesStart, from)
      let k = Math.ceil(offset / interval)
      let d = addDays(seriesStart, k * interval)
      while (d <= end && out.length < MAX_OCCURRENCES_PER_CALL) {
        out.push(d)
        k++
        d = addDays(seriesStart, k * interval)
      }
      break
    }
    case 'weekly': {
      const days = weeklyDays(seriesStart, rule)
      // Weeks are anchored on the Sunday of the series start week.
      const anchor = startOfWeek(seriesStart, 0)
      const weeksOffset = Math.floor(diffDays(anchor, from) / 7)
      let w = Math.max(0, Math.floor(weeksOffset / interval) * interval)
      while (out.length < MAX_OCCURRENCES_PER_CALL) {
        const weekStart = addDays(anchor, w * 7)
        if (weekStart > end) break
        for (const wd of days) {
          const d = addDays(weekStart, wd)
          if (d >= from && d <= end && d >= seriesStart) out.push(d)
        }
        w += interval
      }
      break
    }
    case 'monthly':
    case 'yearly': {
      const step = rule.freq === 'monthly' ? interval : interval * 12
      const s = fromKey(seriesStart)
      const f = fromKey(from)
      const monthsOffset = (f.getFullYear() - s.getFullYear()) * 12 + (f.getMonth() - s.getMonth())
      let k = Math.max(0, Math.floor(monthsOffset / step))
      while (out.length < MAX_OCCURRENCES_PER_CALL) {
        const d = monthlyOccurrence(seriesStart, k * step, rule.freq === 'monthly' && !!rule.lastDayOfMonth)
        if (d > end) break
        if (d >= from) out.push(d)
        k++
      }
      break
    }
  }
  return out
}

function weeklyDays(seriesStart: DateKey, rule: RecurrenceRule): number[] {
  const days = rule.byWeekday && rule.byWeekday.length ? [...new Set(rule.byWeekday)] : [weekday(seriesStart)]
  return days.filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
}

/**
 * The occurrence `monthsAhead` months after the series start, clamped to
 * month length — or always the month's last day when `lastDay` is set.
 */
function monthlyOccurrence(seriesStart: DateKey, monthsAhead: number, lastDay = false): DateKey {
  const s = fromKey(seriesStart)
  const y = s.getFullYear()
  const m = s.getMonth() + monthsAhead
  const target = new Date(y, m, 1, 12)
  const len = daysInMonth(target.getFullYear(), target.getMonth())
  const day = lastDay ? len : Math.min(s.getDate(), len)
  return makeKey(target.getFullYear(), target.getMonth(), day)
}

/** Every occurrence from the start up to `end`, honouring `count`. Bounded. */
function allOccurrences(seriesStart: DateKey, rule: RecurrenceRule, end: DateKey): DateKey[] {
  const limit = Math.min(rule.count ?? MAX_OCCURRENCES_PER_CALL, MAX_OCCURRENCES_PER_CALL)
  const noCount: RecurrenceRule = { ...rule, count: null }
  const out: DateKey[] = []
  // Walk in yearly windows to avoid generating huge arrays at once.
  let windowStart = seriesStart
  while (out.length < limit && windowStart <= end) {
    const windowEnd = addYears(windowStart, 1) < end ? addDays(addYears(windowStart, 1), -1) : end
    for (const d of occurrencesInRange(seriesStart, noCount, windowStart, windowEnd)) {
      out.push(d)
      if (out.length >= limit) break
    }
    windowStart = addDays(windowEnd, 1)
  }
  return out
}

/** First occurrence on or after `from`, or null when the series has ended. */
export function nextOccurrence(seriesStart: DateKey, rule: RecurrenceRule, from: DateKey): DateKey | null {
  // Look ahead in growing windows (most series repeat within a year).
  let windowStart = from
  for (let i = 0; i < 6; i++) {
    const windowEnd = addMonths(windowStart, i < 2 ? 3 : 24)
    const found = occurrencesInRange(seriesStart, rule, windowStart, windowEnd)
    if (found.length) return found[0]
    if (rule.until && rule.until < windowEnd) return null
    windowStart = addDays(windowEnd, 1)
  }
  return null
}

export function isOccurrence(seriesStart: DateKey, rule: RecurrenceRule, date: DateKey): boolean {
  return occurrencesInRange(seriesStart, rule, date, date).length === 1
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeRecurrence(rule: RecurrenceRule, seriesStart?: DateKey | null): string {
  const n = Math.max(1, rule.interval || 1)
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq]
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
  if (rule.freq === 'daily' && n === 1) text = 'Daily'
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday?.length ? [...rule.byWeekday].sort() : seriesStart ? [weekday(seriesStart)] : []
    const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
    if (isWeekdays && n === 1) text = 'Every weekday'
    else if (days.length) text += ` on ${days.map((d) => WEEKDAY_NAMES[d]).join(', ')}`
  }
  if (rule.freq === 'monthly' && rule.lastDayOfMonth) text += ' on the last day'
  else if (rule.freq === 'monthly' && seriesStart) text += ` on day ${fromKey(seriesStart).getDate()}`
  if (rule.until) text += ` until ${rule.until}`
  if (rule.count) text += `, ${rule.count} times`
  return text
}
