import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { CalendarView, DateKey, TaskDraft, TaskInstance } from '@/types/models'
import { todayKey } from '@/utils/date'

/** Transient UI state shared across pages (not persisted except via settings). */
export const useUiStore = defineStore('ui', () => {
  /* ---- Clock: one timer for the whole app ---- */
  const now = shallowRef(new Date())
  const today = computed<DateKey>(() => todayKey(now.value))
  let clock: ReturnType<typeof setInterval> | null = null
  function startClock() {
    if (clock) return
    clock = setInterval(() => {
      now.value = new Date()
    }, 30_000)
  }
  function stopClock() {
    if (clock) clearInterval(clock)
    clock = null
  }

  /* ---- Calendar position ---- */
  const selectedDate = ref<DateKey>(todayKey())
  const calendarView = ref<CalendarView>('month')

  /* ---- Task detail panel ---- */
  const detailKey = ref<string | null>(null)
  function openTask(inst: TaskInstance) {
    detailKey.value = inst.key
  }
  function closeTask() {
    detailKey.value = null
  }

  /* ---- Quick add ---- */
  const quickAddOpen = ref(false)
  const quickAddDefaults = shallowRef<Partial<TaskDraft>>({})
  function openQuickAdd(defaults: Partial<TaskDraft> = {}) {
    quickAddDefaults.value = defaults
    quickAddOpen.value = true
  }
  function closeQuickAdd() {
    quickAddOpen.value = false
  }

  /* ---- Misc dialogs ---- */
  const settingsOpen = ref(false)
  const mobileSidebarOpen = ref(false)

  return {
    now,
    today,
    startClock,
    stopClock,
    selectedDate,
    calendarView,
    detailKey,
    openTask,
    closeTask,
    quickAddOpen,
    quickAddDefaults,
    openQuickAdd,
    closeQuickAdd,
    settingsOpen,
    mobileSidebarOpen,
  }
})
