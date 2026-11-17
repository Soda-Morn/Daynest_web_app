import { afterEach, describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { enableOutbox, persistence } from '@/services/persistence'
import { getAll, getOne } from '@/services/db'
import { useTaskStore } from '@/stores/tasks'
import { makeTask } from './helpers'

/**
 * Server data written by the sync engine (pull, realtime, conflict
 * resolution) must never replace a local change that hasn't been pushed yet.
 */
describe('caching server data', () => {
  afterEach(() => enableOutbox(false))

  it('writes server records when there is no local change', async () => {
    const t = makeTask({ id: 'srv-1', title: 'From server', rev: 3 })
    const skipped = await persistence.cacheRemote({ tasks: [t] })
    expect(skipped.size).toBe(0)
    expect((await getOne('tasks', 'srv-1')).title).toBe('From server')
  })

  it('keeps an edit that is waiting in the outbox', async () => {
    enableOutbox(true)
    const store = useTaskStore(createPinia())
    const { task } = store.createTask({ title: 'Mine', startDate: '2026-11-20' }, 'cal')
    await persistence.flush()
    expect((await getAll('outbox')).some((e) => e.key === `tasks:${task.id}`)).toBe(true)

    const server = { ...task, title: 'Server copy', rev: task.rev }
    const skipped = await persistence.cacheRemote({ tasks: [server] })
    expect(skipped.has(`tasks:${task.id}`)).toBe(true)
    expect((await getOne('tasks', task.id)).title).toBe('Mine')

    // Entries up to `afterSeq` belong to the push in progress and don't block.
    const seqs = (await getAll('outbox')).filter((e) => e.key === `tasks:${task.id}`).map((e) => e.seq)
    const adopted = await persistence.cacheRemote({ tasks: [server] }, { afterSeq: Math.max(...seqs), checkRev: false })
    expect(adopted.size).toBe(0)
    expect((await getOne('tasks', task.id)).title).toBe('Server copy')
  })

  it('keeps an edit that is still in memory (not yet flushed)', async () => {
    const store = useTaskStore(createPinia())
    const { task } = store.createTask({ title: 'Typing…', startDate: '2026-11-21' }, 'cal')
    // No flush: the write is still queued.
    const skipped = await persistence.cacheRemote({ tasks: [{ ...task, title: 'Old server copy' }] })
    expect(skipped.has(`tasks:${task.id}`)).toBe(true)
    await persistence.flush()
    expect((await getOne('tasks', task.id)).title).toBe('Typing…')
  })

  it('never replaces a newer local revision with an older server one', async () => {
    await persistence.cacheRemote({ tasks: [makeTask({ id: 'srv-2', title: 'v5', rev: 5 })] })
    const skipped = await persistence.cacheRemote({ tasks: [makeTask({ id: 'srv-2', title: 'v4', rev: 4 })] })
    expect(skipped.has('tasks:srv-2')).toBe(true)
    expect((await getOne('tasks', 'srv-2')).title).toBe('v5')
  })

  it('writes nothing once the engine that asked has stopped', async () => {
    await persistence.cacheRemote({ tasks: [makeTask({ id: 'srv-3', rev: 1 })] }, { alive: () => false })
    expect(await getOne('tasks', 'srv-3')).toBeUndefined()
  })
})

describe('editing "this and following" of a limited series', () => {
  it('keeps only the remaining occurrences in the new series', () => {
    const store = useTaskStore(createPinia())
    const { task } = store.createTask(
      { title: 'Course', startDate: '2026-11-02', dueDate: '2026-11-02', recurrence: { freq: 'daily', interval: 1, count: 10 } },
      'cal',
    )
    const fifth = store.resolveInstance(`${task.id}@2026-11-06`)
    expect(fifth).toBeTruthy()
    store.updateInstance(fifth, { title: 'Course (new room)' }, 'future')
    const tail = store.tasks.find((t) => t.id !== task.id && t.title === 'Course (new room)')
    expect(tail.recurrence.count).toBe(6) // occurrences 5..10
    expect(store.tasks.find((t) => t.id === task.id).recurrence.until).toBe('2026-11-05')
  })
})
