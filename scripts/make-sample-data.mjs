/**
 * Generates realistic Daynest sample data as an importable backup file.
 * Dates are relative to the day you run it, so the sample always looks
 * current: tasks today, this week, next week, a couple overdue, some
 * completed history (for the weekly chart and streak), recurring routines,
 * a multi-day trip, descriptions and subtasks.
 *
 *   node scripts/make-sample-data.mjs            → samples/daynest-sample-data.json
 *   node scripts/make-sample-data.mjs --stdout   → print JSON
 *
 * Import it in the app: Settings → Your data → Import backup.
 * (Import replaces existing data.)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = new Date()
today.setHours(12, 0, 0, 0)
/** Date key `n` days from today. */
const day = (n) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return key(d)
}
/** Days from today to the next given weekday (0=Sun), 0 if today. */
const nextWeekday = (wd) => (wd - today.getDay() + 7) % 7
const firstOfNextMonth = () => key(new Date(today.getFullYear(), today.getMonth() + 1, 1, 12))
const lastOfThisMonth = () => key(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12))
const iso = (dateKey, h = 12, m = 0) => {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

const now = new Date().toISOString()

const calendars = [
  ['Personal', '#8b72a8'],
  ['Work', '#91b5d3'],
  ['Fitness', '#8baf91'],
  ['Family', '#d68c91'],
  ['Study', '#e6c477'],
].map(([name, color], order) => ({ id: randomUUID(), name, color, visible: true, order, createdAt: now }))

const lists = [
  ['Home', '#8baf91'],
  ['Shopping', '#d68c91'],
  ['Work Projects', '#91b5d3'],
  ['Learning', '#e6c477'],
  ['Personal Goals', '#b9a3d1'],
].map(([name, color], order) => ({ id: randomUUID(), name, color, order, createdAt: now }))

const cal = Object.fromEntries(calendars.map((c) => [c.name, c.id]))
const list = Object.fromEntries(lists.map((l) => [l.name, l.id]))
const sub = (...titles) => titles.map((t) => (typeof t === 'string' ? { id: randomUUID(), title: t, done: false } : { id: randomUUID(), title: t[0], done: true }))

let order = 0
function task(t) {
  order += 1000
  const status = t.status ?? 'todo'
  return {
    id: randomUUID(),
    title: t.title,
    description: t.description ?? '',
    startDate: t.date ?? null,
    dueDate: t.due ?? t.date ?? null,
    startTime: t.start ?? null,
    endTime: t.end ?? null,
    priority: t.priority ?? 'medium',
    calendarId: cal[t.cal ?? 'Personal'],
    listId: t.list ? list[t.list] : null,
    status,
    subtasks: t.subtasks ?? [],
    recurrence: t.repeat ?? null,
    overrides: t.overrides ?? {},
    reminders: t.reminders ?? [],
    order,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'completed' ? (t.completedAt ?? iso(t.date ?? day(0), 18)) : null,
    rev: 1,
  }
}

const tasks = [
  // ---------- Today ----------
  task({ title: 'Morning walk', description: 'Easy 30 minutes around the park before work.', date: day(0), start: '07:00', end: '07:30', cal: 'Fitness', status: 'completed', completedAt: iso(day(0), 7, 35) }),
  task({ title: 'Project research', description: 'Discuss with colleagues about the future plan and list open questions.', date: day(0), start: '09:00', end: '10:30', cal: 'Work', list: 'Work Projects', priority: 'high', subtasks: sub(['Collect last quarter numbers'], 'Draft three options', 'Share notes in the team channel') }),
  task({ title: 'Finish Odoo payroll testing', description: 'Run the payslip batch for November and compare totals with last month.', date: day(0), start: '11:00', end: '12:30', cal: 'Work', list: 'Work Projects', priority: 'urgent', reminders: [15] }),
  task({ title: 'Lunch with Mia', description: 'New noodle place on 5th street.', date: day(0), start: '12:45', end: '13:30', cal: 'Family' }),
  task({ title: 'Buy groceries', description: 'Milk, eggs, spinach, rice, coffee beans.', date: day(0), cal: 'Personal', list: 'Shopping', subtasks: sub(['Milk'], 'Eggs', 'Spinach', 'Rice', 'Coffee beans') }),
  task({ title: 'Call mom', date: day(0), start: '19:00', end: '19:30', cal: 'Family', reminders: [10] }),

  // ---------- Overdue (gentle) ----------
  task({ title: 'Reply to the landlord', description: 'Confirm the plumber visit time.', date: day(-2), cal: 'Personal', list: 'Home', priority: 'high' }),
  task({ title: 'Submit expense report', description: 'Taxi receipts from the client visit.', date: day(-1), cal: 'Work', list: 'Work Projects' }),

  // ---------- Tomorrow ----------
  task({ title: 'Study Odoo payroll rules', description: 'Salary rules, categories and the computation order.', date: day(1), start: '08:30', end: '10:00', cal: 'Study', list: 'Learning', subtasks: sub('Read the rule docs', 'Try a custom rule in a test DB') }),
  task({ title: 'Team stand-up', date: day(1), start: '10:15', end: '10:30', cal: 'Work' }),
  task({ title: 'Dentist appointment', description: 'Bring the insurance card.', date: day(1), start: '15:00', end: '16:00', cal: 'Personal', priority: 'high', reminders: [60] }),

  // ---------- This week ----------
  task({ title: 'Complete portfolio website', description: 'Projects section, contact form and a final mobile check.', date: day(3), start: '14:00', end: '17:00', cal: 'Work', list: 'Personal Goals', priority: 'high', subtasks: sub(['Projects section'], 'Contact form', 'Mobile check', 'Deploy') }),
  task({ title: 'Clean the kitchen', date: day(2), cal: 'Personal', list: 'Home', priority: 'low' }),
  task({ title: 'Movie night', description: 'Pick something light. Popcorn!', date: day(4), start: '20:00', end: '22:00', cal: 'Family' }),
  task({ title: 'Read 30 pages', description: '“Deep Work” — chapter 3.', date: day(5), cal: 'Study', list: 'Personal Goals', priority: 'low' }),

  // ---------- Next week and later ----------
  task({ title: 'Conference trip', description: 'Train on the first morning; hotel is near the river.', date: day(8), due: day(10), cal: 'Work', priority: 'medium', subtasks: sub('Book train', 'Pack laptop charger', 'Print badge') }),
  task({ title: 'Quarterly planning', description: 'Goals for next quarter with the team lead.', date: day(9), start: '10:00', end: '11:30', cal: 'Work', list: 'Work Projects', priority: 'high' }),
  task({ title: 'Birthday gift for Dad', description: 'He mentioned wanting a new watch strap.', date: day(12), cal: 'Family', list: 'Shopping' }),
  task({ title: 'Renew passport', description: 'Photos and the application form.', date: day(20), cal: 'Personal', priority: 'medium' }),
  task({ title: 'Plan a weekend hike', date: null, cal: 'Fitness', list: 'Personal Goals', priority: 'low' }),
  task({ title: 'Learn Vue 3 composables', description: 'Write two small composables and a test for each.', date: null, cal: 'Study', list: 'Learning' }),

  // ---------- Recurring routines ----------
  task({ title: 'Gym', description: 'Strength training, then 10 minutes stretching.', date: day(-14), start: '18:00', end: '19:00', cal: 'Fitness', repeat: { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } }),
  task({ title: 'Study English', description: '20 minutes vocabulary + one podcast episode.', date: day(-14), start: '21:00', end: '21:30', cal: 'Study', list: 'Learning', repeat: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] } }),
  task({ title: 'Pay rent', date: firstOfNextMonth(), cal: 'Personal', list: 'Home', priority: 'high', repeat: { freq: 'monthly', interval: 1 } }),
  task({ title: 'Review monthly expenses', description: 'Update the budget sheet and check subscriptions.', date: lastOfThisMonth(), cal: 'Personal', repeat: { freq: 'monthly', interval: 1, lastDayOfMonth: true } }),
  task({ title: 'Water the plants', date: day(nextWeekday(0)), cal: 'Personal', list: 'Home', priority: 'low', repeat: { freq: 'weekly', interval: 1, byWeekday: [0] } }),

  // ---------- Completed history (fills the weekly chart and streak) ----------
  ...[-6, -5, -4, -3, -2, -1].flatMap((n, i) => [
    task({ title: ['Write meeting notes', 'Fix login bug', 'Prepare slides', 'Update API docs', 'Grocery run', 'Clean desk'][i], date: day(n), cal: i % 2 ? 'Personal' : 'Work', status: 'completed', completedAt: iso(day(n), 16, 20) }),
    ...(i % 2 ? [task({ title: ['Inbox zero', 'Stretching', 'Meal prep'][i % 3], date: day(n), cal: 'Fitness', status: 'completed', completedAt: iso(day(n), 19, 5) })] : []),
  ]),
]

const backup = {
  app: 'daynest',
  version: 1,
  exportedAt: now,
  tasks,
  calendars,
  lists,
  settings: { userName: '', theme: 'system', weekStartsOn: 1, timeFormat: '12h', defaultCalendarId: cal.Personal, sidebarCollapsed: false, calendarView: 'month', remindersEnabled: false, defaultReminder: null },
}

const json = JSON.stringify(backup, null, 2)
if (process.argv.includes('--stdout')) process.stdout.write(json)
else {
  const out = resolve(import.meta.dirname, '../samples/daynest-sample-data.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, json)
  console.log(`✓ ${tasks.length} tasks, ${calendars.length} calendars, ${lists.length} lists → samples/daynest-sample-data.json`)
}
