import type { Priority, Task } from '@/types/models'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { persistence } from '@/services/persistence'
import { addDays, todayKey } from '@/utils/date'
import { normalizeTask, uid } from '@/utils/validation'

/**
 * DEVELOPMENT ONLY (never bundled in production builds).
 * `__daynest.seed(2000)` creates synthetic tasks for performance testing;
 * `__daynest.clear()` removes them.
 */
export function installDevTools() {
  const words = ['Review', 'Write', 'Call', 'Plan', 'Fix', 'Design', 'Test', 'Read', 'Clean', 'Prepare', 'Update', 'Book']
  const things = ['report', 'payroll module', 'portfolio', 'groceries', 'dentist', 'slides', 'budget', 'workout', 'blog post', 'invoices', 'API docs', 'garden']
  const prios: Priority[] = ['low', 'medium', 'medium', 'high', 'urgent']

  const api = {
    seed(n = 1000) {
      const store = useTaskStore()
      const cals = useCollectionsStore().calendars
      const lists = useCollectionsStore().lists
      const today = todayKey()
      const now = new Date().toISOString()
      const created: Task[] = []
      for (let i = 0; i < n; i++) {
        const start = addDays(today, Math.floor(Math.random() * 360) - 180)
        const timed = Math.random() < 0.55
        const h = 7 + Math.floor(Math.random() * 12)
        const multi = Math.random() < 0.05
        const recurring = i % 97 === 0
        created.push(
          normalizeTask({
            id: uid(),
            title: `${words[i % words.length]} ${things[(i * 7) % things.length]} #${i}`,
            description: i % 5 === 0 ? 'Synthetic task for performance testing.' : '',
            startDate: start,
            dueDate: multi ? addDays(start, 1 + Math.floor(Math.random() * 4)) : start,
            startTime: timed && !multi ? `${String(h).padStart(2, '0')}:${Math.random() < 0.5 ? '00' : '30'}` : null,
            endTime: timed && !multi ? `${String(h + 1).padStart(2, '0')}:00` : null,
            priority: prios[i % prios.length],
            calendarId: cals[i % cals.length].id,
            listId: i % 3 === 0 ? (lists[i % lists.length]?.id ?? null) : null,
            status: start < today && Math.random() < 0.7 ? 'completed' : 'todo',
            subtasks: [],
            recurrence: recurring ? { freq: 'weekly', interval: 1, byWeekday: [1, 3] } : null,
            overrides: {},
            reminders: [],
            order: i * 10,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          } as Task),
        )
      }
      const t0 = performance.now()
      for (const t of created) persistence.saveTask(t)
      store.replaceAll([...store.tasks, ...created])
      console.info(`[daynest] seeded ${n} tasks in ${(performance.now() - t0).toFixed(1)}ms (total ${store.count})`)
      return store.count
    },
    clear() {
      const store = useTaskStore()
      const ids = store.tasks.filter((t) => t.title.includes(' #')).map((t) => t.id)
      store.deleteTasks(ids)
      return ids.length
    },
  }
  ;(window as unknown as { __daynest: typeof api }).__daynest = api
}
