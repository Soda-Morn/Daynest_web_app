import type { DateKey, Priority, RecurrenceRule, TimeKey } from '@/types/models'
import { addDays, addMonths, daysInMonth, makeKey, minutesToTime, timeToMinutes, weekday } from './date'

/**
 * Tiny natural-language parser for Quick Add.
 *
 *   "Finish Odoo payroll testing tomorrow at 3 PM"
 *   → { title: "Finish Odoo payroll testing", date: <tomorrow>, startTime: "15:00" }
 *
 * Hand-written (no dependency) and deliberately conservative: it only
 * extracts phrases it is confident about, and returns the matched ranges so
 * the UI can highlight them and the user can see exactly what was understood.
 */

export interface ParsedTask {
  title: string
  date: DateKey | null
  startTime: TimeKey | null
  endTime: TimeKey | null
  recurrence: RecurrenceRule | null
  priority: Priority | null
  /** Raw `#tag` text (matched against calendar names by the caller). */
  tag: string | null
  /** Raw `@list` text (matched against list names by the caller). */
  list: string | null
  /** Character ranges in the original input that were understood. */
  tokens: { start: number; end: number; kind: 'date' | 'time' | 'repeat' | 'priority' | 'tag' | 'list' }[]
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}

const WD = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)'
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const TIME = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?'

interface Rule {
  re: RegExp
  kind: ParsedTask['tokens'][number]['kind']
  apply: (m: RegExpExecArray, ctx: Ctx) => boolean
}

interface Ctx {
  today: DateKey
  out: ParsedTask
}

function parseClock(hStr: string, mStr: string | undefined, ap: string | undefined, requireMeridiem: boolean): TimeKey | null {
  let h = +hStr
  const m = mStr ? +mStr : 0
  if (m > 59) return null
  const mer = ap?.replace(/\./g, '').toLowerCase()
  if (mer) {
    if (h < 1 || h > 12) return null
    if (mer === 'pm' && h !== 12) h += 12
    if (mer === 'am' && h === 12) h = 0
  } else {
    if (requireMeridiem && !mStr) return null
    if (h > 23) return null
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Next given weekday strictly after today. With `inNextWeek`, the weekday
 * inside next calendar week (Monday-based): "next friday" on a Monday is
 * the Friday 11 days later, as most people mean it.
 */
function nextWeekday(today: DateKey, wd: number, inNextWeek: boolean): DateKey {
  if (inNextWeek) {
    const mondayNext = addDays(today, 7 - ((weekday(today) + 6) % 7))
    return addDays(mondayNext, (wd + 6) % 7)
  }
  const diff = (wd - weekday(today) + 7) % 7
  return addDays(today, diff === 0 ? 7 : diff)
}

function resolveMonthDay(today: DateKey, m0: number, d: number, y?: number): DateKey | null {
  const ty = +today.slice(0, 4)
  let year = y ?? ty
  if (y !== undefined && y < 100) year = 2000 + y
  if (d < 1 || d > daysInMonth(year, m0)) return null
  let key = makeKey(year, m0, d)
  // "Jan 5" typed in December means next January.
  if (y === undefined && key < today) key = makeKey(year + 1, m0, Math.min(d, daysInMonth(year + 1, m0)))
  return key
}

const RULES: Rule[] = [
  // ---- Recurrence ----
  {
    kind: 'repeat',
    re: /\b(?:on\s+)?(?:the\s+)?(first|1st|last)\s+day\s+of\s+(?:every|each)\s+month\b/i,
    apply: (m, { out, today }) => {
      const first = m[1].toLowerCase() !== 'last'
      const t = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, 1, 12)
      let d = first
        ? makeKey(t.getFullYear(), t.getMonth(), 1)
        : makeKey(t.getFullYear(), t.getMonth(), daysInMonth(t.getFullYear(), t.getMonth()))
      if (d < today) d = first ? addMonths(d, 1) : makeKey(t.getFullYear(), t.getMonth() + 1, daysInMonth(t.getFullYear(), t.getMonth() + 1))
      out.recurrence = first ? { freq: 'monthly', interval: 1 } : { freq: 'monthly', interval: 1, lastDayOfMonth: true }
      out.date = d
      return true
    },
  },
  {
    kind: 'repeat',
    re: /\bevery\s+(weekday|week\s*day)s?\b/i,
    apply: (_m, { out }) => {
      out.recurrence = { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }
      return true
    },
  },
  {
    kind: 'repeat',
    re: new RegExp(`\\bevery\\s+${WD}(?:\\s*(?:,|and|&)\\s*${WD})?\\b`, 'i'),
    apply: (m, { out, today }) => {
      const days = [m[1], m[2]].filter(Boolean).map((s) => WEEKDAYS[s.toLowerCase()])
      out.recurrence = { freq: 'weekly', interval: 1, byWeekday: days }
      if (!out.date) out.date = nextWeekday(addDays(today, -1), days[0], false)
      return true
    },
  },
  {
    kind: 'repeat',
    re: /\bevery\s+(\d+)\s+(day|week|month|year)s?\b/i,
    apply: (m, { out }) => {
      const freq = ({ day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' } as const)[
        m[2].toLowerCase() as 'day' | 'week' | 'month' | 'year'
      ]
      out.recurrence = { freq, interval: Math.max(1, +m[1]) }
      return true
    },
  },
  {
    kind: 'repeat',
    // Bare adverbs only count at the end or before another scheduling word,
    // so "Review monthly expenses" stays a plain title.
    re: /\b(?:every\s+(day|week|month|year)|(daily|weekly|monthly|yearly|annually)(?=\s*$|\s+(?:at|on|from|starting|until|for|today|tomorrow|[#!@]|p[1-4]\b|\d)))/i,
    apply: (m, { out }) => {
      const word = (m[1] || m[2]).toLowerCase()
      const map: Record<string, RecurrenceRule['freq']> = {
        day: 'daily', daily: 'daily', week: 'weekly', weekly: 'weekly', month: 'monthly', monthly: 'monthly',
        year: 'yearly', yearly: 'yearly', annually: 'yearly',
      }
      out.recurrence = { freq: map[word], interval: 1 }
      return true
    },
  },
  // ---- Time ranges ----
  {
    kind: 'time',
    re: new RegExp(`\\b(?:from\\s+)?${TIME}\\s*(?:-|–|to|until|till)\\s*${TIME}(?=\\s|$|[,.!?])`, 'i'),
    apply: (m, { out }) => {
      // "3-4pm": the first meridiem defaults to the second one.
      const ap2 = m[6]
      let ap1 = m[3]
      if (!ap1 && ap2 && +m[1] <= 12) {
        ap1 = ap2
        // "11-1pm" → 11am-1pm
        if (/p/i.test(ap2) && +m[1] > +m[4] && +m[4] !== 12) ap1 = 'am'
      }
      const s = parseClock(m[1], m[2], ap1, !ap2)
      const e = parseClock(m[4], m[5], ap2, !ap1)
      if (!s || !e || timeToMinutes(e) <= timeToMinutes(s)) return false
      out.startTime = s
      out.endTime = e
      return true
    },
  },
  {
    kind: 'time',
    re: new RegExp(`\\b(?:at|@)\\s*${TIME}(?=\\s|$|[,.!?])`, 'i'),
    apply: (m, { out }) => {
      const t = parseClock(m[1], m[2], m[3], false)
      if (!t) return false
      // "at 3" with no am/pm: assume afternoon for 1–6, morning otherwise.
      if (!m[3] && !m[2] && +m[1] >= 1 && +m[1] <= 6) out.startTime = minutesToTime(timeToMinutes(t) + 12 * 60)
      else out.startTime = t
      return true
    },
  },
  {
    kind: 'time',
    re: new RegExp(`(?<![\\w/:-])${TIME}(?=\\s|$|[,.!?])`, 'i'),
    apply: (m, { out }) => {
      if (out.startTime) return false
      // Bare numbers need am/pm or a minutes part ("3pm", "15:30").
      if (!m[3] && !m[2]) return false
      const t = parseClock(m[1], m[2], m[3], true)
      if (!t) return false
      out.startTime = t
      return true
    },
  },
  {
    kind: 'time',
    re: /\b(?:at\s+)?(noon|midday|midnight)\b/i,
    apply: (m, { out }) => {
      if (out.startTime) return false
      out.startTime = m[1].toLowerCase() === 'midnight' ? '00:00' : '12:00'
      return true
    },
  },
  {
    kind: 'time',
    re: /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i,
    apply: (m, { out }) => {
      if (!out.startTime) return false
      const mins = /^h/i.test(m[2]) ? +m[1] * 60 : +m[1]
      if (!mins || mins >= 24 * 60) return false
      out.endTime = minutesToTime(Math.min(timeToMinutes(out.startTime) + mins, 24 * 60 - 1))
      return true
    },
  },
  // ---- Dates ----
  {
    kind: 'date',
    re: /\b(today|tonight|this\s+evening|tod)\b/i,
    apply: (m, { out, today }) => {
      out.date = today
      if (/night|evening/i.test(m[1]) && !out.startTime) out.startTime = '19:00'
      return true
    },
  },
  {
    kind: 'date',
    re: /\b(?:the\s+)?day\s+after\s+tomorrow\b/i,
    apply: (_m, { out, today }) => ((out.date = addDays(today, 2)), true),
  },
  {
    kind: 'date',
    re: /\b(tomorrow|tmrw?|tmw)\b/i,
    apply: (_m, { out, today }) => ((out.date = addDays(today, 1)), true),
  },
  {
    kind: 'date',
    re: /\bin\s+(\d+|a|an|one|two|three)\s+(day|week|month)s?\b/i,
    apply: (m, { out, today }) => {
      const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 }
      const n = words[m[1].toLowerCase()] ?? +m[1]
      const unit = m[2].toLowerCase()
      out.date = unit === 'day' ? addDays(today, n) : unit === 'week' ? addDays(today, n * 7) : addMonths(today, n)
      return true
    },
  },
  {
    kind: 'date',
    re: /\bnext\s+(week|month)\b/i,
    apply: (m, { out, today }) => {
      out.date = m[1].toLowerCase() === 'week' ? nextWeekday(today, 1, true) : addMonths(today, 1).slice(0, 8) + '01'
      return true
    },
  },
  {
    kind: 'date',
    re: /\b(?:this\s+)?weekend\b/i,
    apply: (_m, { out, today }) => {
      out.date = weekday(today) === 6 || weekday(today) === 0 ? today : nextWeekday(today, 6, false)
      return true
    },
  },
  {
    kind: 'date',
    re: new RegExp(`\\b(?:(next)\\s+|(this)\\s+|on\\s+)?${WD}\\b`, 'i'),
    apply: (m, { out, today }) => {
      if (out.date) return false
      // Short forms ("sun", "sat") are ordinary words too; require a prefix.
      const prefixed = !!m[1] || !!m[2] || /^on\s/i.test(m[0])
      if (!prefixed && m[3].length <= 3) return false
      const wd = WEEKDAYS[m[3].toLowerCase()]
      out.date = m[2] && weekday(today) === wd ? today : nextWeekday(today, wd, !!m[1])
      return true
    },
  },
  {
    kind: 'date',
    re: new RegExp(`\\b(?:on\\s+)?${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
    apply: (m, { out, today }) => {
      const d = resolveMonthDay(today, MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : undefined)
      return d ? ((out.date = d), true) : false
    },
  },
  {
    kind: 'date',
    re: new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b(?:,?\\s+(\\d{4}))?`, 'i'),
    apply: (m, { out, today }) => {
      const d = resolveMonthDay(today, MONTHS[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined)
      return d ? ((out.date = d), true) : false
    },
  },
  {
    kind: 'date',
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    apply: (m, { out }) => {
      const mo = +m[2] - 1
      const d = +m[3]
      if (mo < 0 || mo > 11 || d < 1 || d > daysInMonth(+m[1], mo)) return false
      out.date = makeKey(+m[1], mo, d)
      return true
    },
  },
  {
    kind: 'date',
    re: /(?<![\d:])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d:])/,
    apply: (m, { out, today }) => {
      const mo = +m[1] - 1
      if (mo < 0 || mo > 11) return false
      const d = resolveMonthDay(today, mo, +m[2], m[3] ? +m[3] : undefined)
      return d ? ((out.date = d), true) : false
    },
  },
  // ---- Priority / tags ----
  {
    kind: 'priority',
    re: /(?:^|\s)(?:!(urgent|high|medium|med|low)|!{1,3}|p([1-4]))(?=\s|$)/i,
    apply: (m, { out }) => {
      const raw = m[0].trim().toLowerCase()
      if (m[1]) out.priority = ({ urgent: 'urgent', high: 'high', medium: 'medium', med: 'medium', low: 'low' } as const)[m[1].toLowerCase() as 'low']
      else if (m[2]) out.priority = (['urgent', 'high', 'medium', 'low'] as const)[+m[2] - 1]
      else out.priority = raw === '!!!' ? 'urgent' : raw === '!!' ? 'high' : 'medium'
      return true
    },
  },
  {
    kind: 'tag',
    re: /(?:^|\s)#([\p{L}\p{N}_-]+)/u,
    apply: (m, { out }) => ((out.tag = m[1]), true),
  },
  {
    kind: 'list',
    re: /(?:^|\s)@([\p{L}][\p{L}\p{N}_-]*)/u,
    apply: (m, { out }) => ((out.list = m[1]), true),
  },
]

export function parseQuickAdd(input: string, today: DateKey): ParsedTask {
  const out: ParsedTask = {
    title: input.trim(),
    date: null,
    startTime: null,
    endTime: null,
    recurrence: null,
    priority: null,
    tag: null,
    list: null,
    tokens: [],
  }
  if (!input.trim()) return out

  // Work on a masked copy so a consumed phrase can't be matched twice.
  let masked = input
  const ctx: Ctx = { today, out }
  for (const rule of RULES) {
    // Each kind is taken once (first matching rule wins); time rules guard themselves.
    if (rule.kind === 'date' && out.tokens.some((t) => t.kind === 'date')) continue
    if (rule.kind === 'repeat' && out.recurrence) continue
    if (rule.kind === 'priority' && out.priority) continue
    const re = new RegExp(rule.re.source, rule.re.flags.replace('g', ''))
    const m = re.exec(masked)
    if (!m) continue
    if (!rule.apply(m, ctx)) continue
    // Skip leading whitespace that the regex consumed.
    let start = m.index
    while (start < masked.length && /\s/.test(masked[start])) start++
    const end = m.index + m[0].length
    out.tokens.push({ start, end, kind: rule.kind })
    masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end)
  }

  if (out.recurrence && !out.date) out.date = today
  if (out.endTime && !out.startTime) out.endTime = null

  // Title = input minus understood phrases, minus dangling connectors.
  const title = masked
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(?:on|at|by|from|for|in|due|starting|every)$/i, '')
    .replace(/^(?:on|at|by|due)\s+/i, '')
    .trim()
  out.title = title || input.trim()
  out.tokens.sort((a, b) => a.start - b.start)
  return out
}
