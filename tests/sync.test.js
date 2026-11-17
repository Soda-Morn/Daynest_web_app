import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { mergeTask } from '@/utils/merge'
import { useTaskStore } from '@/stores/tasks'
import { persistence } from '@/services/persistence'
import { makeTask } from './helpers'

describe('three-way merge', () => {
  const base = makeTask({ id: 'm', title: 'Plan trip', priority: 'medium', updatedAt: '2026-11-17T08:00:00.000Z' })

  it('combines edits to different fields', () => {
    const mine = { ...base, priority: 'high', updatedAt: '2026-11-17T09:00:00.000Z' }
    const theirs = { ...base, title: 'Plan Kyoto trip', updatedAt: '2026-11-17T08:30:00.000Z' }
    const { task, conflicts } = mergeTask(base, mine, theirs)
    expect(task).toMatchObject({ title: 'Plan Kyoto trip', priority: 'high' })
    expect(conflicts).toEqual([])
  })

  it('keeps the newer edit when both changed the same field, and reports it', () => {
    const mine = { ...base, title: 'Mine', updatedAt: '2026-11-17T09:00:00.000Z' }
    const theirs = { ...base, title: 'Theirs', updatedAt: '2026-11-17T08:30:00.000Z' }
    const r = mergeTask(base, mine, theirs)
    expect(r.task.title).toBe('Mine')
    expect(r.conflicts).toEqual(['title'])
    const older = mergeTask(base, { ...mine, updatedAt: '2026-11-17T08:10:00.000Z' }, theirs)
    expect(older.task.title).toBe('Theirs')
  })

  it('moves schedule fields together and merges recurring completions per occurrence', () => {
    const rec = { ...base, recurrence: { freq: 'daily', interval: 1 }, overrides: {} }
    const mine = { ...rec, startTime: '09:00', endTime: '10:00', overrides: { '2026-11-17': { status: 'completed' } } }
    const theirs = { ...rec, overrides: { '2026-11-18': { status: 'completed' } } }
    const { task } = mergeTask(rec, mine, theirs)
    expect(task).toMatchObject({ startTime: '09:00', endTime: '10:00' })
    expect(Object.keys(task.overrides).sort()).toEqual(['2026-11-17', '2026-11-18'])
  })
})

describe('cross-window saves', () => {
  it('merges instead of overwriting when another window saved first', async () => {
    const windowA = useTaskStore(createPinia())
    const { task } = windowA.createTask({ title: 'Shared task', startDate: '2026-11-20' }, 'cal')
    await persistence.flush()

    // Window B loads the same data and renames the task.
    const windowB = useTaskStore(createPinia())
    windowB.hydrate((await persistence.loadAll()).tasks)
    windowB.updateTask(task.id, { title: 'Renamed in B' })
    await persistence.flush()

    // Window A, still on the old version, changes the priority.
    const conflicts = []
    const off = persistence.onConflict(({ tasks, messages }) => {
      conflicts.push(...messages)
      windowA.applyExternal(tasks)
    })
    windowA.updateTask(task.id, { priority: 'urgent' })
    await persistence.flush()
    off()

    const stored = (await persistence.loadAll()).tasks.find((t) => t.id === task.id)
    expect(stored).toMatchObject({ title: 'Renamed in B', priority: 'urgent' })
    expect(stored.rev).toBe(3)
    expect(conflicts).toHaveLength(1)
    // Window A now shows the merged result.
    expect(windowA.get(task.id)).toMatchObject({ title: 'Renamed in B', priority: 'urgent' })
  })

  it('does not delete a task that was edited in another window meanwhile', async () => {
    const windowA = useTaskStore(createPinia())
    const { task } = windowA.createTask({ title: 'Keep me' }, 'cal')
    await persistence.flush()
    const windowB = useTaskStore(createPinia())
    windowB.hydrate((await persistence.loadAll()).tasks)
    windowB.updateTask(task.id, { description: 'Important notes' })
    await persistence.flush()

    windowA.deleteTasks([task.id])
    await persistence.flush()
    const stored = (await persistence.loadAll()).tasks.find((t) => t.id === task.id)
    expect(stored?.description).toBe('Important notes')
  })

  it('creating the same task id twice never duplicates records', async () => {
    const w = useTaskStore(createPinia())
    const { task } = w.createTask({ title: 'Once' }, 'cal')
    w.updateTask(task.id, { title: 'Once, edited' })
    await persistence.flush()
    const all = (await persistence.loadAll()).tasks.filter((t) => t.id === task.id)
    expect(all).toHaveLength(1)
  })
})
