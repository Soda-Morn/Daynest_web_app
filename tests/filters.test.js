import { describe, expect, it } from 'vitest'
import { emptyFilter, makePredicate } from '@/utils/filters'
import { oneOffInstance } from '@/utils/task'
import { parseBackup } from '@/services/backup'
import { makeTask } from './helpers'

const names = { calendar: (id) => (id === 'work' ? 'Work' : 'Personal'), list: () => '' }
const T = '2026-11-17'

describe('filters and search', () => {
  const items = [
    oneOffInstance(makeTask({ title: 'Payroll testing', calendarId: 'work', startDate: T, dueDate: T, priority: 'high' })),
    oneOffInstance(makeTask({ title: 'Gym', description: 'leg day', startDate: '2026-11-10', dueDate: '2026-11-10' })),
    oneOffInstance(makeTask({ title: 'Read', startDate: null, dueDate: null })),
    oneOffInstance(makeTask({ title: 'Done thing', status: 'completed', startDate: '2026-11-20', dueDate: '2026-11-20' })),
  ]
  const run = (f) => items.filter(makePredicate({ ...emptyFilter(), ...f }, T, names)).map((i) => i.title)

  it('quick filters', () => {
    expect(run({ quick: 'today' })).toEqual(['Payroll testing'])
    expect(run({ quick: 'overdue' })).toEqual(['Gym'])
    expect(run({ quick: 'unscheduled' })).toEqual(['Read'])
    expect(run({ quick: 'completed' })).toEqual(['Done thing'])
  })
  it('searches title, description and calendar name', () => {
    expect(run({ query: 'payroll' })).toEqual(['Payroll testing'])
    expect(run({ query: 'LEG' })).toEqual(['Gym'])
    expect(run({ query: 'work' })).toEqual(['Payroll testing'])
    expect(run({ query: 'gym day' })).toEqual(['Gym'])
  })
  it('filters by priority and calendar', () => {
    expect(run({ priorities: ['high'] })).toEqual(['Payroll testing'])
    expect(run({ calendarIds: ['work'] })).toEqual(['Payroll testing'])
  })
})

describe('backup import', () => {
  it('validates, de-duplicates and repairs references', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: 'daynest',
        version: 1,
        calendars: [{ id: 'c1', name: 'Personal', color: '#000', visible: true, order: 0 }],
        lists: [],
        tasks: [makeTask({ id: 'a', calendarId: 'missing', listId: 'gone' }), makeTask({ id: 'a' }), { title: '' }],
      }),
    )
    expect(backup.tasks).toHaveLength(1)
    expect(backup.tasks[0]).toMatchObject({ calendarId: 'c1', listId: null })
    expect(() => parseBackup('{oops')).toThrow()
    expect(() => parseBackup('{"app":"other","tasks":[]}')).toThrow()
  })
})
