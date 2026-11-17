import type { Task } from '@/types/models'

let n = 0

/** A valid task with sensible defaults for tests. */
export function makeTask(p: Partial<Task> = {}): Task {
  n++
  return {
    id: 't' + n,
    title: 'Task ' + n,
    description: '',
    startDate: '2026-11-16',
    dueDate: '2026-11-16',
    startTime: null,
    endTime: null,
    priority: 'medium',
    calendarId: 'cal',
    listId: null,
    status: 'todo',
    subtasks: [],
    recurrence: null,
    overrides: {},
    reminders: [],
    order: n,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    ...p,
  }
}
