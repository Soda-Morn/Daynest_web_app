import type { DateKey, TaskInstance } from '@/types/models'
import { diffDays, timeToMinutes } from './date'
import { compareInstances, durationMinutes } from './task'

/* ---------- Month view: one week row ---------- */

export interface RowSegment {
  inst: TaskInstance
  /** Column 0-6 where the bar starts in this row. */
  col: number
  /** Number of columns covered in this row. */
  span: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface WeekRowLayout {
  segments: RowSegment[]
  /** Hidden item count per column when lanes exceed `maxLanes`. */
  hidden: number[]
}

/**
 * Packs task bars into lanes for a week row. Multi-day bars go first so they
 * stay on stable lanes across days; single-day items fill the gaps.
 */
export function layoutWeekRow(days: DateKey[], instances: TaskInstance[], maxLanes: number): WeekRowLayout {
  const first = days[0]
  const last = days[days.length - 1]
  const items = instances
    .map((inst) => {
      const s = inst.startDate! < first ? first : inst.startDate!
      const e = inst.dueDate! > last ? last : inst.dueDate!
      return { inst, col: diffDays(first, s), span: diffDays(s, e) + 1 }
    })
    .sort((a, b) => b.span - a.span || a.col - b.col || compareInstances(a.inst, b.inst))

  const occupied: boolean[][] = [] // lane -> col -> taken
  const segments: RowSegment[] = []
  const hidden = new Array(days.length).fill(0)

  for (const it of items) {
    let lane = 0
    for (;;) {
      const row = (occupied[lane] ??= new Array(days.length).fill(false))
      let free = true
      for (let c = it.col; c < it.col + it.span; c++) if (row[c]) { free = false; break }
      if (free) {
        for (let c = it.col; c < it.col + it.span; c++) row[c] = true
        break
      }
      lane++
    }
    if (lane >= maxLanes) {
      for (let c = it.col; c < it.col + it.span; c++) hidden[c]++
      continue
    }
    segments.push({
      inst: it.inst,
      col: it.col,
      span: it.span,
      lane,
      continuesBefore: it.inst.startDate! < first,
      continuesAfter: it.inst.dueDate! > last,
    })
  }
  // When something is hidden in a column, the last visible lane becomes the
  // "+N more" button, so move whatever sat there into the hidden count too.
  if (hidden.some((h) => h > 0)) {
    const lastLane = maxLanes - 1
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
      if (seg.lane !== lastLane) continue
      let collides = false
      for (let c = seg.col; c < seg.col + seg.span; c++) if (hidden[c] > 0) collides = true
      if (collides) {
        for (let c = seg.col; c < seg.col + seg.span; c++) hidden[c]++
        segments.splice(i, 1)
      }
    }
  }
  return { segments, hidden }
}

/* ---------- Week/Day view: timed events in one day column ---------- */

export interface TimedBlock {
  inst: TaskInstance
  /** Minutes from midnight. */
  start: number
  end: number
  column: number
  columns: number
}

/**
 * Classic overlap layout: events are grouped into clusters of transitively
 * overlapping items; each cluster is split into the minimum number of
 * side-by-side columns.
 */
export function layoutTimed(instances: TaskInstance[]): TimedBlock[] {
  const blocks: TimedBlock[] = instances
    .filter((i) => i.startTime)
    .map((inst) => {
      const start = timeToMinutes(inst.startTime!)
      return { inst, start, end: Math.min(24 * 60, start + durationMinutes(inst)), column: 0, columns: 1 }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  let cluster: TimedBlock[] = []
  let colEnds: number[] = []
  let clusterEnd = -1

  const flush = () => {
    for (const b of cluster) b.columns = colEnds.length
    cluster = []
    colEnds = []
  }

  for (const b of blocks) {
    if (b.start >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= b.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(b.end)
    } else colEnds[col] = b.end
    b.column = col
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  flush()
  return blocks
}
