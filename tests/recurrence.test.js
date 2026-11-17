import { describe, expect, it } from 'vitest'
import { describeRecurrence, nextOccurrence, occurrencesInRange } from '@/utils/recurrence'

describe('recurrence', () => {
  it('daily with interval', () => {
    expect(occurrencesInRange('2026-11-01', { freq: 'daily', interval: 3 }, '2026-11-05', '2026-11-14')).toEqual([
      '2026-11-07',
      '2026-11-10',
      '2026-11-13',
    ])
  })
  it('every weekday', () => {
    const r = occurrencesInRange('2026-11-02', { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, '2026-11-13', '2026-11-17')
    expect(r).toEqual(['2026-11-13', '2026-11-16', '2026-11-17'])
  })
  it('every other week on Monday', () => {
    const r = occurrencesInRange('2026-11-02', { freq: 'weekly', interval: 2 }, '2026-11-01', '2026-12-01')
    expect(r).toEqual(['2026-11-02', '2026-11-16', '2026-11-30'])
  })
  it('monthly on the 31st clamps to month end', () => {
    const r = occurrencesInRange('2026-01-31', { freq: 'monthly', interval: 1 }, '2026-01-01', '2026-05-31')
    expect(r).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })
  it('monthly on the last day lands on 28/29/30/31', () => {
    const r = occurrencesInRange('2026-11-30', { freq: 'monthly', interval: 1, lastDayOfMonth: true }, '2026-11-01', '2027-03-31')
    expect(r).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
    expect(describeRecurrence({ freq: 'monthly', interval: 1, lastDayOfMonth: true })).toBe('Every month on the last day')
  })
  it('yearly on Feb 29', () => {
    const r = occurrencesInRange('2024-02-29', { freq: 'yearly', interval: 1 }, '2024-01-01', '2028-12-31')
    expect(r).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })
  it('respects until and count', () => {
    expect(occurrencesInRange('2026-11-01', { freq: 'daily', interval: 1, until: '2026-11-03' }, '2026-11-01', '2026-11-30')).toHaveLength(
      3,
    )
    expect(occurrencesInRange('2026-11-01', { freq: 'daily', interval: 1, count: 5 }, '2026-11-03', '2026-11-30')).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ])
  })
  it('never yields dates before the series start', () => {
    expect(occurrencesInRange('2026-11-18', { freq: 'weekly', interval: 1, byWeekday: [1, 3] }, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-18',
      '2026-11-23',
      '2026-11-25',
      '2026-11-30',
    ])
  })
  it('expands a long-running daily series quickly', () => {
    const t0 = performance.now()
    for (let i = 0; i < 500; i++) occurrencesInRange('2000-01-01', { freq: 'daily', interval: 1 }, '2026-11-01', '2026-12-12')
    expect(performance.now() - t0).toBeLessThan(1000)
  })
  it('finds the next occurrence', () => {
    expect(nextOccurrence('2026-01-01', { freq: 'monthly', interval: 1 }, '2026-11-02')).toBe('2026-12-01')
    expect(nextOccurrence('2026-01-01', { freq: 'daily', interval: 1, until: '2026-02-01' }, '2026-11-02')).toBeNull()
  })
  it('describes rules', () => {
    expect(describeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] })).toBe('Every weekday')
    expect(describeRecurrence({ freq: 'daily', interval: 1 })).toBe('Daily')
    expect(describeRecurrence({ freq: 'weekly', interval: 2, byWeekday: [1] })).toBe('Every 2 weeks on Mon')
  })
})
