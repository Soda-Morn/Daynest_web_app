import { shallowRef } from 'vue'

const toasts = shallowRef([])
const timers = new Map()
let seq = 0

function dismiss(id) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  toasts.value = toasts.value.filter((x) => x.id !== id)
}

function show(message, opts = {}) {
  const toast = {
    id: ++seq,
    message,
    tone: opts.tone ?? 'default',
    action: opts.action,
    timeout: opts.timeout ?? (opts.action ? 6000 : 3500),
  }
  // Keep at most 3 on screen.
  toasts.value = [...toasts.value.slice(-2), toast]
  timers.set(
    toast.id,
    setTimeout(() => dismiss(toast.id), toast.timeout),
  )
  return toast.id
}

/** Global, dependency-free toast queue. */
export function useToast() {
  return {
    toasts,
    show,
    dismiss,
    error: (message) => show(message, { tone: 'error', timeout: 5000 }),
    /** Shows a message with an "Undo" button. */
    undoable: (message, undo) => show(message, { action: { label: 'Undo', run: undo } }),
  }
}
