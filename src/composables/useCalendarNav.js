import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from './useMediaQuery'
import { addDays, addMonths, formatDate, startOfWeek } from '@/utils/date'

/** Title + prev/next/today for the calendar, shared by the top bar and pages. */
export function useCalendarNav() {
  const ui = useUiStore()
  const settings = useSettingsStore()
  const isMobile = useIsMobile()

  const weekStart = computed(() => startOfWeek(ui.selectedDate, settings.settings.weekStartsOn))

  const title = computed(() => {
    const d = ui.selectedDate
    switch (ui.calendarView) {
      case 'month':
        return formatDate(d, { month: 'long', year: 'numeric' })
      case 'week': {
        const s = weekStart.value
        const e = addDays(s, 6)
        if (s.slice(0, 7) === e.slice(0, 7)) return `${formatDate(s, { month: 'long' })} ${+s.slice(8)} – ${+e.slice(8)}, ${s.slice(0, 4)}`
        if (s.slice(0, 4) === e.slice(0, 4))
          return `${formatDate(s, { month: 'short', day: 'numeric' })} – ${formatDate(e, { month: 'short', day: 'numeric' })}, ${s.slice(0, 4)}`
        return `${formatDate(s, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatDate(e, { month: 'short', day: 'numeric', year: 'numeric' })}`
      }
      case 'day':
        return formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })
      case 'agenda':
        return 'Agenda'
    }
    return ''
  })

  /** Compact variant for small screens. */
  const shortTitle = computed(() => {
    const d = ui.selectedDate
    switch (ui.calendarView) {
      case 'month':
        // "November" — the year only when it isn't this year.
        return d.slice(0, 4) === ui.today.slice(0, 4)
          ? formatDate(d, { month: 'long' })
          : formatDate(d, { month: 'short', year: 'numeric' })
      case 'week': {
        const s = weekStart.value
        const e = addDays(s, 6)
        return s.slice(0, 7) === e.slice(0, 7)
          ? `${formatDate(s, { month: 'short' })} ${+s.slice(8)}–${+e.slice(8)}`
          : `${formatDate(s, { month: 'short', day: 'numeric' })} – ${formatDate(e, { month: 'short', day: 'numeric' })}`
      }
      case 'day':
        return formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })
      default:
        return 'Agenda'
    }
  })

  function step(dir) {
    const d = ui.selectedDate
    const map = {
      month: () => addMonths(d, dir),
      week: () => addDays(d, 7 * dir),
      day: () => addDays(d, dir),
      agenda: () => addDays(d, 7 * dir),
    }
    ui.selectedDate = map[ui.calendarView]()
  }

  function setView(v) {
    ui.calendarView = v
    // Phone and desktop each remember their own view.
    const key = isMobile.value ? 'calendarViewMobile' : 'calendarView'
    if (settings.settings[key] !== v) settings.update({ [key]: v })
  }

  return {
    title,
    shortTitle,
    weekStart,
    prev: () => step(-1),
    next: () => step(1),
    goToday: () => (ui.selectedDate = ui.today),
    setView,
  }
}
