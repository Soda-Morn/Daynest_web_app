import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  endOfMonth,
  formatTime,
  isValidKey,
  monthGrid,
  relativeDayLabel,
  startOfWeek,
} from '@/utils/date'

describe('date utils', () => {
  it('adds days across month/year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09') // US DST start
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26') // EU DST end
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })
  it('clamps month addition', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15')
  })
  it('diffs and iterates', () => {
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
  })
  it('validates keys', () => {
    expect(isValidKey('2026-02-29')).toBe(false)
    expect(isValidKey('2024-02-29')).toBe(true)
    expect(isValidKey('nope')).toBe(false)
  })
  it('builds month grids for every month of several years', () => {
    for (let y = 2020; y <= 2030; y++) {
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0')
        for (const ws of [0, 1]) {
          const g = monthGrid(`${y}-${mm}-15`, ws)
          expect(g.length).toBeGreaterThanOrEqual(5)
          expect(g.length).toBeLessThanOrEqual(6)
          const flat = g.flat()
          expect(flat).toContain(`${y}-${mm}-01`)
          expect(flat).toContain(endOfMonth(`${y}-${mm}-15`))
          expect(new Date(flat[0] + 'T12:00').getDay()).toBe(ws)
          for (let i = 1; i < flat.length; i++) expect(diffDays(flat[i - 1], flat[i])).toBe(1)
        }
      }
    }
  })
  it('finds week start', () => {
    expect(startOfWeek('2026-11-18', 1)).toBe('2026-11-16') // Wednesday -> Monday
    expect(startOfWeek('2026-11-15', 1)).toBe('2026-11-09') // Sunday -> previous Monday
    expect(startOfWeek('2026-11-18', 0)).toBe('2026-11-15')
  })
  it('formats times and relative labels', () => {
    expect(formatTime('15:00')).toBe('3pm')
    expect(formatTime('00:30')).toBe('12:30am')
    expect(formatTime('15:00', '24h')).toBe('15:00')
    expect(relativeDayLabel('2026-11-17', '2026-11-17')).toBe('Today')
    expect(relativeDayLabel('2026-11-18', '2026-11-17')).toBe('Tomorrow')
    expect(relativeDayLabel('2026-11-16', '2026-11-17')).toBe('Yesterday')
  })
})
