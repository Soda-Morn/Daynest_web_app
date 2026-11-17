import { afterEach, describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { calendarToRow, rowToCalendar, rowToSettings, rowToTask, settingsToRow, taskToRow } from '@/services/mappers'
import { enableOutbox, persistence } from '@/services/persistence'
import { getAll, deleteMany } from '@/services/db'
import { useTaskStore } from '@/stores/tasks'
import { DEFAULT_SETTINGS } from '@/constants'
import { checkPassword, validateEmail } from '@/utils/authValidation'
import { makeTask } from './helpers'

describe('row mappers', () => {
  it('round-trips a task, including recurrence, subtasks and times', () => {
    const t = makeTask({
      startTime: '09:30',
      endTime: '10:00',
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3] },
      subtasks: [{ id: 's1', title: 'Step', done: true }],
      reminders: [15],
      listId: 'l1',
      rev: 4,
    })
    const row = taskToRow(t)
    expect(row).not.toHaveProperty('user_id') // the database sets the owner
    // Postgres returns times as HH:MM:SS
    const back = rowToTask({ ...row, start_time: '09:30:00', end_time: '10:00:00' })
    expect(back).toEqual(t)
  })

  it('round-trips calendars and settings', () => {
    const c = { id: 'c1', name: 'Work', color: '#91b5d3', visible: false, order: 2, createdAt: '2026-11-01T00:00:00.000Z' }
    expect(rowToCalendar(calendarToRow(c))).toEqual(c)
    const s = { ...DEFAULT_SETTINGS, theme: 'dark', weekStartsOn: 1, defaultReminder: 15, calendarViewMobile: 'week', userName: 'Mia' }
    expect(rowToSettings(settingsToRow(s), 'Mia')).toEqual(s)
  })
})

describe('outbox', () => {
  afterEach(async () => {
    enableOutbox(false)
    const all = await getAll('outbox')
    await deleteMany(
      'outbox',
      all.map((e) => e.seq),
    )
  })

  it('records every change in the same transaction, with the merge base', async () => {
    enableOutbox(true)
    const s = useTaskStore(createPinia())
    const { task } = s.createTask({ title: 'Sync me' }, 'cal')
    await persistence.flush()
    s.updateTask(task.id, { title: 'Sync me later' })
    await persistence.flush()
    const entries = (await getAll('outbox')).filter((e) => e.id === task.id)
    expect(entries).toHaveLength(2)
    expect(entries[0].base).toBeNull() // created on this device → insert
    expect(entries[1].base.title).toBe('Sync me') // update → base for 3-way merge
  })

  it('records nothing when cloud sync is off (local-only mode)', async () => {
    const s = useTaskStore(createPinia())
    s.createTask({ title: 'Local only' }, 'cal')
    await persistence.flush()
    expect(await getAll('outbox')).toEqual([])
  })
})

describe('auth validation', () => {
  it('checks emails and password strength', () => {
    expect(validateEmail('mia@example.com')).toBeNull()
    expect(validateEmail('mia@')).not.toBeNull()
    expect(checkPassword('short1').ok).toBe(false)
    expect(checkPassword('longpassword').ok).toBe(false) // needs a number
    expect(checkPassword('Daynest2026!').ok).toBe(true)
    expect(checkPassword('Daynest2026!').score).toBeGreaterThanOrEqual(3)
  })
})
