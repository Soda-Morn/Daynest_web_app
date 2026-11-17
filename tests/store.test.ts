import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { persistence } from '@/services/persistence'
import { resetDbConnection } from '@/services/db'
import { addDays } from '@/utils/date'
import { makeTask } from './helpers'

describe('task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates, normalises and indexes tasks', () => {
    const s = useTaskStore()
    const { task } = s.createTask({ title: '  Buy milk  ', startDate: '2026-11-18', startTime: '09:00', endTime: '08:00' }, 'cal')
    expect(task.title).toBe('Buy milk')
    expect(task.endTime).toBeNull() // invalid end before start is dropped
    expect(task.calendarId).toBe('cal')
    expect(s.dayMap('2026-11-18', '2026-11-18').get('2026-11-18')).toHaveLength(1)
    expect(() => s.createTask({ title: '   ' }, 'cal')).toThrow()
  })

  it('updates and restores via snapshot (undo)', () => {
    const s = useTaskStore()
    const { task } = s.createTask({ title: 'A', startDate: '2026-11-18' }, 'cal')
    const snap = s.updateTask(task.id, { status: 'completed' })
    expect(s.get(task.id)!.completedAt).toBeTruthy()
    s.restore(snap)
    expect(s.get(task.id)!.status).toBe('todo')
    const del = s.deleteTasks([task.id])
    expect(s.get(task.id)).toBeUndefined()
    s.restore(del)
    expect(s.get(task.id)!.title).toBe('A')
  })

  it('moves a multi-day task keeping its length', () => {
    const s = useTaskStore()
    s.hydrate([makeTask({ id: 'm', startDate: '2026-11-16', dueDate: '2026-11-18' })])
    const inst = s.resolveInstance('m')!
    s.moveInstance(inst, '2026-11-20')
    expect(s.get('m')).toMatchObject({ startDate: '2026-11-20', dueDate: '2026-11-22' })
    expect(s.instancesInRange('2026-11-21', '2026-11-21')).toHaveLength(1)
  })

  describe('recurring tasks', () => {
    const daily = () => makeTask({ id: 'r', title: 'Exercise', startDate: '2026-11-01', dueDate: '2026-11-01', recurrence: { freq: 'daily', interval: 1 } })

    it('expands occurrences without creating records', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      expect(s.instancesInRange('2026-11-10', '2026-11-16')).toHaveLength(7)
      expect(s.count).toBe(1)
    })

    it('completes a single occurrence', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      const occ = s.resolveInstance('r@2026-11-10')!
      s.setCompleted(occ, true)
      expect(s.resolveInstance('r@2026-11-10')!.status).toBe('completed')
      expect(s.resolveInstance('r@2026-11-11')!.status).toBe('todo')
    })

    it('edits only this occurrence', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      s.updateInstance(s.resolveInstance('r@2026-11-10')!, { title: 'Long run', startTime: '07:00' }, 'this')
      expect(s.resolveInstance('r@2026-11-10')).toMatchObject({ title: 'Long run', startTime: '07:00' })
      expect(s.resolveInstance('r@2026-11-11')!.title).toBe('Exercise')
    })

    it('moves one occurrence to another day', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      s.moveInstance(s.resolveInstance('r@2026-11-10')!, '2026-11-12')
      const on12 = s.dayMap('2026-11-12', '2026-11-12').get('2026-11-12')!
      expect(on12).toHaveLength(2)
      expect(s.dayMap('2026-11-10', '2026-11-10').get('2026-11-10')).toBeUndefined()
    })

    it('splits the series for "this and following"', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      s.setCompleted(s.resolveInstance('r@2026-11-03')!, true)
      s.updateInstance(s.resolveInstance('r@2026-11-10')!, { title: 'Yoga' }, 'future')
      expect(s.count).toBe(2)
      expect(s.get('r')!.recurrence!.until).toBe('2026-11-09')
      const week = s.dayMap('2026-11-08', '2026-11-12')
      expect(week.get('2026-11-09')![0].title).toBe('Exercise')
      expect(week.get('2026-11-10')![0].title).toBe('Yoga')
      expect(week.get('2026-11-12')).toHaveLength(1) // no duplicates
      expect(s.resolveInstance('r@2026-11-03')!.status).toBe('completed') // history kept
    })

    it('edits the whole series and shifts its dates', () => {
      const s = useTaskStore()
      s.hydrate([makeTask({ id: 'w', startDate: '2026-11-02', dueDate: '2026-11-02', recurrence: { freq: 'weekly', interval: 1 } })])
      s.updateInstance(s.resolveInstance('w@2026-11-16')!, { startDate: '2026-11-17', priority: 'high' }, 'all')
      expect(s.get('w')).toMatchObject({ startDate: '2026-11-03', priority: 'high' })
    })

    it('deletes this / following / all', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      s.deleteInstance(s.resolveInstance('r@2026-11-05')!, 'this')
      expect(s.instancesInRange('2026-11-04', '2026-11-06')).toHaveLength(2)
      s.deleteInstance(s.resolveInstance('r@2026-11-20')!, 'future')
      expect(s.instancesInRange('2026-11-19', '2026-11-25')).toHaveLength(1)
      s.deleteInstance(s.resolveInstance('r@2026-11-02')!, 'all')
      expect(s.count).toBe(0)
    })

    it('lists a series once as its next open occurrence', () => {
      const s = useTaskStore()
      s.hydrate([daily()])
      s.setCompleted(s.resolveInstance('r@2026-11-17')!, true)
      const list = s.listInstances('2026-11-17')
      expect(list).toHaveLength(1)
      expect(list[0].startDate).toBe('2026-11-18')
    })
  })

  it('stays fast with 5,000 tasks', () => {
    const s = useTaskStore()
    const tasks = Array.from({ length: 5000 }, (_, i) =>
      makeTask({ id: 'p' + i, startDate: addDays('2026-05-01', i % 365), dueDate: addDays('2026-05-01', i % 365) }),
    )
    for (let i = 0; i < 20; i++) tasks.push(makeTask({ id: 'rec' + i, recurrence: { freq: 'daily', interval: 1 } }))
    let t0 = performance.now()
    s.hydrate(tasks)
    void s.index // build index
    const build = performance.now() - t0
    t0 = performance.now()
    for (let i = 0; i < 20; i++) s.dayMap('2026-10-26', '2026-12-06')
    const perMonth = (performance.now() - t0) / 20
    expect(build).toBeLessThan(500)
    expect(perMonth).toBeLessThan(30)
  })
})

describe('persistence', () => {
  it('round-trips tasks through IndexedDB with coalesced writes', async () => {
    resetDbConnection()
    setActivePinia(createPinia())
    const s = useTaskStore()
    const { task } = s.createTask({ title: 'Persist me', startDate: '2026-11-18' }, 'cal')
    for (let i = 0; i < 10; i++) s.updateTask(task.id, { title: 'Persist me ' + i })
    await persistence.flush()
    const snap = await persistence.loadAll()
    const saved = snap.tasks.find((t) => t.id === task.id)
    expect(saved?.title).toBe('Persist me 9')
    s.deleteTasks([task.id])
    await persistence.flush()
    expect((await persistence.loadAll()).tasks.find((t) => t.id === task.id)).toBeUndefined()
  })
})
