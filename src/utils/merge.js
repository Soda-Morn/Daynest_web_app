/**
 * Three-way merge for a task edited in two places (e.g. two windows) at once.
 *
 *   base   — the version this window last saw
 *   mine   — this window's edit
 *   theirs — what is already saved (written by another window meanwhile)
 *
 * Fields only one side changed are taken from that side, so neither edit is
 * lost. When both sides changed the same field group, the more recent edit
 * (by updatedAt) wins and the field is reported as a conflict.
 * Recurring-task occurrence overrides merge per occurrence.
 */

/** Fields that must move together to stay consistent. */
const GROUPS = [
  ['title'],
  ['description'],
  ['startDate', 'dueDate', 'startTime', 'endTime'],
  ['priority'],
  ['calendarId'],
  ['listId'],
  ['status', 'completedAt'],
  ['subtasks'],
  ['recurrence'],
  ['reminders'],
  ['order'],
]

const same = (a, b) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function mergeTask(base, mine, theirs) {
  const mineNewer = (mine.updatedAt ?? '') >= (theirs.updatedAt ?? '')
  const out = { ...theirs }
  const conflicts = []

  for (const group of GROUPS) {
    const pick = (t) => group.map((k) => t?.[k])
    const b = pick(base)
    const m = pick(mine)
    const t = pick(theirs)
    let useMine
    if (same(m, t)) continue
    else if (base && same(m, b))
      useMine = false // only theirs changed
    else if (base && same(t, b))
      useMine = true // only mine changed
    else {
      useMine = mineNewer
      conflicts.push(group[0])
    }
    if (useMine) for (const k of group) out[k] = mine[k]
  }

  out.overrides = mergeOverrides(base?.overrides ?? {}, mine.overrides ?? {}, theirs.overrides ?? {}, mineNewer, conflicts)
  out.updatedAt = mineNewer ? mine.updatedAt : theirs.updatedAt
  return { task: out, conflicts }
}

function mergeOverrides(base, mine, theirs, mineNewer, conflicts) {
  const out = { ...theirs }
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base)])) {
    const b = base[key]
    const m = mine[key]
    const t = theirs[key]
    if (same(m, t) || same(m, b)) continue // nothing new from mine
    if (same(t, b) || mineNewer) {
      if (!same(t, b)) conflicts.push(`occurrence ${key}`)
      if (m === undefined) delete out[key]
      else out[key] = m
    } else conflicts.push(`occurrence ${key}`)
  }
  return out
}
