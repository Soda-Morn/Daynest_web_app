import { shallowRef } from 'vue'
import type { DateKey, TaskInstance } from '@/types/models'
import { SNAP_MINUTES } from '@/constants'
import { minutesToTime, timeToMinutes } from '@/utils/date'
import { durationMinutes } from '@/utils/task'

/**
 * Pointer-based drag & drop for calendar items. Unlike the HTML5 DnD API it
 * works with touch (long-press to pick up) as well as mouse and pen.
 *
 * Drop targets are plain elements with `data-drop-date`. Time-grid columns
 * also set `data-drop-time` so the vertical position maps to minutes.
 */

export interface DragState {
  inst: TaskInstance
  mode: 'move' | 'resize'
  x: number
  y: number
  overDate: DateKey | null
  /** Start minute (move) or end minute (resize) on a time grid, else null. */
  overMinutes: number | null
  duration: number
  label: string
}

export const dragState = shallowRef<DragState | null>(null)

const MOUSE_THRESHOLD = 5
const TOUCH_HOLD_MS = 350
const TOUCH_SLOP = 8

let suppressClickUntil = 0

/** Call from a click handler: true when the click is the tail of a drag. */
export function wasDragging(): boolean {
  return Date.now() < suppressClickUntil
}

export function startTaskDrag(
  e: PointerEvent,
  inst: TaskInstance,
  onDrop: (inst: TaskInstance, date: DateKey, times?: { startTime: string | null; endTime: string | null }) => void,
  mode: 'move' | 'resize' = 'move',
) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  const isTouch = e.pointerType === 'touch'
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  // Where inside the item it was grabbed, in minutes (keeps the item under the finger).
  let grabMinutes = 0
  const column = target.closest<HTMLElement>('[data-drop-time]')
  if (column && inst.startTime && mode === 'move') {
    const colRect = column.getBoundingClientRect()
    grabMinutes = ((startY - rect.top) / colRect.height) * 1440
  }
  let active = false
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  const duration = durationMinutes(inst) || 60

  const begin = () => {
    active = true
    dragState.value = {
      inst,
      mode,
      x: startX,
      y: startY,
      overDate: null,
      overMinutes: null,
      duration,
      label: inst.title,
    }
    document.body.classList.add('is-dragging')
    if (isTouch && navigator.vibrate) navigator.vibrate(10)
    update(startX, startY)
  }

  const update = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-date]')
    let overDate = el?.dataset.dropDate ?? null
    let overMinutes: number | null = null
    if (el && el.dataset.dropTime !== undefined) {
      const r = el.getBoundingClientRect()
      const raw = ((y - r.top) / r.height) * 1440
      if (mode === 'resize') {
        const start = inst.startTime ? timeToMinutes(inst.startTime) : 0
        overMinutes = Math.max(start + SNAP_MINUTES, Math.min(1440, snap(raw)))
        overDate = inst.startDate // resizing never changes the day
      } else {
        overMinutes = Math.max(0, Math.min(1440 - SNAP_MINUTES, snap(raw - grabMinutes)))
      }
    } else if (mode === 'resize') {
      overDate = null
    }
    dragState.value = { ...dragState.value!, x, y, overDate, overMinutes }
  }

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    if (!active) {
      if (isTouch) {
        // Moving before the hold completes means the user is scrolling.
        if (Math.hypot(dx, dy) > TOUCH_SLOP) cleanup()
        return
      }
      if (Math.hypot(dx, dy) < MOUSE_THRESHOLD) return
      begin()
    }
    update(ev.clientX, ev.clientY)
  }

  const onUp = () => {
    const s = dragState.value
    if (active && s) {
      suppressClickUntil = Date.now() + 250
      if (s.overDate) {
        if (s.mode === 'resize' && s.overMinutes !== null) {
          onDrop(inst, inst.startDate!, { startTime: inst.startTime, endTime: minutesToTime(Math.min(s.overMinutes, 1439)) })
        } else if (s.overMinutes !== null) {
          const end = Math.min(1439, s.overMinutes + s.duration)
          onDrop(inst, s.overDate, { startTime: minutesToTime(s.overMinutes), endTime: minutesToTime(end) })
        } else {
          onDrop(inst, s.overDate)
        }
      }
    }
    cleanup()
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      suppressClickUntil = Date.now() + 250
      cleanup()
    }
  }

  // Block page scroll only while a touch drag is active.
  const onTouchMove = (ev: TouchEvent) => {
    if (active) ev.preventDefault()
  }

  function cleanup() {
    if (holdTimer) clearTimeout(holdTimer)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cleanup)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('touchmove', onTouchMove)
    document.body.classList.remove('is-dragging')
    dragState.value = null
    active = false
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cleanup)
  window.addEventListener('keydown', onKey)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  if (isTouch) holdTimer = setTimeout(begin, TOUCH_HOLD_MS)
  if (mode === 'resize') e.stopPropagation()
}

function snap(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES
}
