import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from '@/utils/nlp'

// Tuesday, 17 Nov 2026
const T = '2026-11-17'
const p = (s) => parseQuickAdd(s, T)

describe('quick add parser', () => {
  it('parses the headline example', () => {
    const r = p('Finish Odoo payroll testing tomorrow at 3 PM')
    expect(r.title).toBe('Finish Odoo payroll testing')
    expect(r.date).toBe('2026-11-18')
    expect(r.startTime).toBe('15:00')
  })
  it('handles today / tonight / weekdays', () => {
    expect(p('Call mom today').date).toBe(T)
    expect(p('Dinner tonight').startTime).toBe('19:00')
    expect(p('Meeting on friday at 10am')).toMatchObject({ date: '2026-11-20', startTime: '10:00', title: 'Meeting' })
    expect(p('Review next friday').date).toBe('2026-11-27')
    expect(p('Plan next week').date).toBe('2026-11-23')
  })
  it('does not treat short weekday words as dates', () => {
    expect(p('Buy sun cream').date).toBeNull()
    expect(p('Buy sun cream').title).toBe('Buy sun cream')
  })
  it('parses explicit dates', () => {
    expect(p('Complete portfolio Nov 20').date).toBe('2026-11-20')
    expect(p('Complete portfolio 22 November').date).toBe('2026-11-22')
    expect(p('Pay rent 12/1').date).toBe('2026-12-01')
    expect(p('Trip 2027-01-05').date).toBe('2027-01-05')
    expect(p('New year plan Jan 2').date).toBe('2027-01-02') // rolls to next year
    expect(p('in 3 days do laundry').date).toBe('2026-11-20')
  })
  it('parses times and ranges', () => {
    expect(p('Standup 9:30am')).toMatchObject({ startTime: '09:30' })
    expect(p('Workshop 3-4pm tomorrow')).toMatchObject({ startTime: '15:00', endTime: '16:00', date: '2026-11-18' })
    expect(p('Focus 11-1pm')).toMatchObject({ startTime: '11:00', endTime: '13:00' })
    expect(p('Gym at 7 for 90 min')).toMatchObject({ startTime: '07:00', endTime: '08:30' })
    expect(p('Lunch at noon')).toMatchObject({ startTime: '12:00' })
    expect(p('Coffee at 3')).toMatchObject({ startTime: '15:00' })
    expect(p('Read 2 chapters').startTime).toBeNull()
  })
  it('parses recurrence', () => {
    expect(p('Exercise every day').recurrence).toMatchObject({ freq: 'daily', interval: 1 })
    expect(p('Study English every weekday').recurrence).toMatchObject({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] })
    expect(p('Review finances monthly').recurrence).toMatchObject({ freq: 'monthly' })
    expect(p('Water plants weekly at 9am').recurrence).toMatchObject({ freq: 'weekly' })
    expect(p('Review monthly expenses').recurrence).toBeNull()
    expect(p('Review monthly expenses').title).toBe('Review monthly expenses')
    const bills = p('Pay bills on the first day of every month')
    expect(bills.recurrence).toMatchObject({ freq: 'monthly' })
    expect(bills.date).toBe('2026-12-01')
    expect(bills.title).toBe('Pay bills')
    const rent = p('Pay rent on the last day of every month')
    expect(rent).toMatchObject({ date: '2026-11-30', title: 'Pay rent', recurrence: { freq: 'monthly', lastDayOfMonth: true } })
    const mon = p('Team sync every monday at 10am')
    expect(mon.recurrence?.byWeekday).toEqual([1])
    expect(mon.date).toBe('2026-11-23')
    expect(mon.title).toBe('Team sync')
  })
  it('parses priority, tags and lists', () => {
    expect(p('Fix bug !urgent')).toMatchObject({ priority: 'urgent', title: 'Fix bug' })
    expect(p('Fix bug p2').priority).toBe('high')
    expect(p('Gym #fitness').tag).toBe('fitness')
    expect(p('Milk @shopping').list).toBe('shopping')
  })
  it('returns highlight tokens and never empties the title', () => {
    expect(p('tomorrow').title).toBe('tomorrow')
    expect(p('Finish report tomorrow').tokens[0]).toMatchObject({ kind: 'date', start: 14, end: 22 })
  })
})
