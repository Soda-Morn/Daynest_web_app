import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { todayKey } from '@/utils/date'

/** Transient UI state shared across pages (not persisted except via settings). */
export const useUiStore = defineStore('ui', () => {
  /* ---- Clock: one timer for the whole app ---- */
  const now = shallowRef(new Date())
  const today = computed(() => todayKey(now.value))
  let clock = null
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
  const selectedDate = ref(todayKey())
  const calendarView = ref('month')

  /* ---- Task detail panel ---- */
  const detailKey = ref(null)
  function openTask(inst) {
    detailKey.value = inst.key
  }
  function closeTask() {
    detailKey.value = null
  }

  /* ---- Quick add ---- */
  const quickAddOpen = ref(false)
  const quickAddDefaults = shallowRef({})
  function openQuickAdd(defaults = {}) {
    quickAddDefaults.value = defaults
    quickAddOpen.value = true
  }
  /**
   * Opens Quick Add pre-filled with the date the user is looking at, so a task
   * added from Today lands on Today (not in "No date"). One rule for every
   * add button and shortcut.
   */
  function openQuickAddFor(routeName) {
    if (routeName === 'calendar') openQuickAdd({ startDate: selectedDate.value })
    else if (routeName === 'today') openQuickAdd({ startDate: today.value })
    else openQuickAdd()
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
    openQuickAddFor,
    closeQuickAdd,
    settingsOpen,
    mobileSidebarOpen,
  }
})
