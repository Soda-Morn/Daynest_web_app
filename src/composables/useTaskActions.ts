import type { DateKey, RecurringEditScope, TaskDraft, TaskInstance } from '@/types/models'
import { useTaskStore, type InstancePatch } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from './useToast'
import { chooseScope, confirmDialog } from './useDialogs'
import { relativeDayLabel } from '@/utils/date'
import { ValidationError } from '@/utils/validation'

/**
 * UI-facing task operations: wraps store mutations with confirmation,
 * recurring-scope prompts, toasts and undo. Components call these instead of
 * the store directly so behaviour is identical everywhere.
 */
export function useTaskActions() {
  const store = useTaskStore()
  const collections = useCollectionsStore()
  const ui = useUiStore()
  const settings = useSettingsStore()
  const toast = useToast()

  function guard<T>(fn: () => T): T | undefined {
    try {
      return fn()
    } catch (e) {
      toast.error(e instanceof ValidationError ? e.message : 'Something went wrong. Please try again.')
      if (!(e instanceof ValidationError)) console.error(e)
      return undefined
    }
  }

  function create(draft: TaskDraft, opts: { silent?: boolean } = {}) {
    return guard(() => {
      // Duplicate prevention: ignore an identical submit (double Enter/tap).
      const sig = [draft.title.trim(), draft.startDate, draft.startTime, draft.listId].join('|')
      const recent = lastCreated && lastCreated.sig === sig && Date.now() - lastCreated.at < DUPLICATE_WINDOW_MS ? store.get(lastCreated.id) : undefined
      if (recent) return recent
      const def = settings.settings.defaultReminder
      if (def !== null && draft.startTime && !draft.reminders?.length) draft = { ...draft, reminders: [def] }
      const { task, snapshot } = store.createTask(draft, collections.defaultCalendarId)
      lastCreated = { sig, at: Date.now(), id: task.id }
      if (!opts.silent) {
        const when = task.startDate ? ` · ${relativeDayLabel(task.startDate, ui.today)}` : ''
        toast.undoable(`Task added${when}`, () => store.restore(snapshot))
      }
      return task
    })
  }

  async function update(inst: TaskInstance, patch: InstancePatch, scope?: RecurringEditScope) {
    let s = scope
    if (!s && inst.occurrence) {
      const c = await chooseScope({ title: 'Edit recurring task', verb: 'Apply to' })
      if (!c) return false
      s = c
    }
    return !!guard(() => store.updateInstance(inst, patch, s ?? 'this'))
  }

  /** One-click completion with undo. */
  function toggleComplete(inst: TaskInstance) {
    const done = inst.status !== 'completed'
    guard(() => {
      const snap = store.setCompleted(inst, done)
      if (done) toast.undoable(`Completed "${truncate(inst.title)}"`, () => store.restore(snap))
    })
  }

  async function remove(inst: TaskInstance) {
    let scope: RecurringEditScope = 'all'
    if (inst.occurrence) {
      const c = await chooseScope({ title: 'Delete recurring task', verb: 'Delete' })
      if (!c) return false
      scope = c
    } else {
      const ok = await confirmDialog({
        title: 'Delete task?',
        message: `"${truncate(inst.title, 60)}" will be deleted. You can undo right after.`,
        confirmLabel: 'Delete',
        danger: true,
      })
      if (!ok) return false
    }
    const snap = guard(() => store.deleteInstance(inst, scope))
    if (snap) {
      if (ui.detailKey === inst.key) ui.closeTask()
      toast.undoable('Task deleted', () => store.restore(snap))
    }
    return true
  }

  function duplicate(inst: TaskInstance) {
    guard(() => {
      const { task, snapshot } = store.duplicateInstance(inst)
      toast.undoable('Task duplicated', () => store.restore(snapshot))
      ui.detailKey = task.recurrence && task.startDate ? `${task.id}@${task.startDate}` : task.id
    })
  }

  /** Reschedule (drag & drop, quick date menu). Recurring: only this occurrence. */
  function move(inst: TaskInstance, date: DateKey | null, times?: { startTime: string | null; endTime: string | null }) {
    guard(() => {
      if (date === null) {
        if (inst.occurrence) {
          toast.show('Recurring tasks need a date')
          return
        }
        const snap = store.updateInstance(inst, { startDate: null, dueDate: null, startTime: null, endTime: null })
        toast.undoable('Date removed', () => store.restore(snap))
        return
      }
      if (date === inst.startDate && (!times || (times.startTime === inst.startTime && times.endTime === inst.endTime))) return
      const snap = store.moveInstance(inst, date, times)
      const label = relativeDayLabel(date, ui.today)
      toast.undoable(`Moved to ${label}${inst.occurrence ? ' (this occurrence)' : ''}`, () => store.restore(snap))
    })
  }

  return { create, update, toggleComplete, remove, duplicate, move }
}

const DUPLICATE_WINDOW_MS = 2000
let lastCreated: { sig: string; at: number; id: string } | null = null

function truncate(s: string, n = 32) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
