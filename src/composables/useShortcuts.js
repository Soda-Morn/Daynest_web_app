import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useCalendarNav } from './useCalendarNav'

/** Global single-key shortcuts (ignored while typing or with a dialog open). */
export function useShortcuts(focusSearch) {
  const ui = useUiStore()
  const route = useRoute()
  const router = useRouter()
  const nav = useCalendarNav()

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target
    if (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
    if (document.querySelector('.modal-root')) return
    const onCal = route.name === 'calendar'
    const k = e.key.toLowerCase()
    const views = { m: 'month', w: 'week', d: 'day', a: 'agenda' }

    if (k === 'n' || k === 'q') ui.openQuickAdd(onCal ? { startDate: ui.selectedDate } : {})
    else if (k === '/') focusSearch()
    else if (k === 't') {
      ui.selectedDate = ui.today
      if (!onCal) void router.push('/today')
    } else if (onCal && views[k]) nav.setView(views[k])
    else if (onCal && e.key === 'ArrowLeft') nav.prev()
    else if (onCal && e.key === 'ArrowRight') nav.next()
    else if (e.key === 'Escape' && ui.detailKey) ui.closeTask()
    else return
    e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
