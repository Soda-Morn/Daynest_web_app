import { isCalendar, isList, normalizeTask, ValidationError } from '@/utils/validation'

/** JSON export/import — the user owns their data and can move it anywhere. */

export const BACKUP_VERSION = 1

export function createBackup(data) {
  return { app: 'daynest', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...data }
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Validates an uploaded backup; drops invalid records instead of failing. */
export function parseBackup(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ValidationError('That file is not valid JSON.')
  }
  const b = raw
  // 'bloom-planner' = backups made before the rename.
  if (!b || (b.app !== 'daynest' && b.app !== 'bloom-planner') || !Array.isArray(b.tasks))
    throw new ValidationError('That file is not a Daynest backup.')
  const calendars = (b.calendars ?? []).filter(isCalendar)
  if (!calendars.length) throw new ValidationError('The backup has no calendars.')
  const calIds = new Set(calendars.map((c) => c.id))
  const lists = (b.lists ?? []).filter(isList)
  const listIds = new Set(lists.map((l) => l.id))
  const tasks = []
  const seen = new Set()
  for (const t of b.tasks) {
    try {
      const n = normalizeTask(t)
      if (seen.has(n.id)) continue // duplicate prevention
      seen.add(n.id)
      if (!calIds.has(n.calendarId)) n.calendarId = calendars[0].id
      if (n.listId && !listIds.has(n.listId)) n.listId = null
      tasks.push(n)
    } catch {
      /* skip invalid task */
    }
  }
  return { ...b, calendars, lists, tasks }
}
