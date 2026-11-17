import { describe, expect, it } from 'vitest'
import { layoutTimed, layoutWeekRow } from '@/utils/calendarLayout'
import { oneOffInstance } from '@/utils/task'
import { eachDay } from '@/utils/date'
import { makeTask } from './helpers'

describe('calendar layout', () => {
  const week = eachDay('2026-11-16', '2026-11-22')

  it('packs multi-day bars into lanes and clips them to the row', () => {
    const a = oneOffInstance(makeTask({ startDate: '2026-11-14', dueDate: '2026-11-18' }))
    const b = oneOffInstance(makeTask({ startDate: '2026-11-17', dueDate: '2026-11-25' }))
    const c = oneOffInstance(makeTask({ startDate: '2026-11-16', dueDate: '2026-11-16' }))
    const { segments } = layoutWeekRow(week, [a, b, c], 5)
    const sa = segments.find((s) => s.inst === a)!
    const sb = segments.find((s) => s.inst === b)!
    const sc = segments.find((s) => s.inst === c)!
    expect(sa).toMatchObject({ col: 0, span: 3, continuesBefore: true, continuesAfter: false })
    expect(sb).toMatchObject({ col: 1, span: 6, continuesAfter: true })
    expect(sa.lane).not.toBe(sb.lane)
    expect(sc.lane).not.toBe(sa.lane)
  })

  it('reports hidden counts when lanes overflow', () => {
    const items = Array.from({ length: 6 }, () => oneOffInstance(makeTask({})))
    const { segments, hidden } = layoutWeekRow(week, items, 3)
    expect(segments).toHaveLength(2) // the last lane is used by "+N more"
    expect(hidden[0]).toBe(4)
  })

  it('places overlapping timed events side by side', () => {
    const a = oneOffInstance(makeTask({ startTime: '09:00', endTime: '10:00' }))
    const b = oneOffInstance(makeTask({ startTime: '09:30', endTime: '11:00' }))
    const c = oneOffInstance(makeTask({ startTime: '11:00', endTime: '12:00' }))
    const blocks = layoutTimed([a, b, c])
    expect(blocks.find((x) => x.inst === a)!.columns).toBe(2)
    expect(blocks.find((x) => x.inst === b)!.column).toBe(1)
    expect(blocks.find((x) => x.inst === c)).toMatchObject({ column: 0, columns: 1 })
  })
})
