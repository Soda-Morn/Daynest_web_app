import { shallowRef } from 'vue'

export interface Toast {
  id: number
  message: string
  tone: 'default' | 'error' | 'success'
  action?: { label: string; run: () => void }
  timeout: number
}

const toasts = shallowRef<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let seq = 0

function dismiss(id: number) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  toasts.value = toasts.value.filter((x) => x.id !== id)
}

function show(message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}): number {
  const toast: Toast = { id: ++seq, message, tone: opts.tone ?? 'default', action: opts.action, timeout: opts.timeout ?? (opts.action ? 6000 : 3500) }
  // Keep at most 3 on screen.
  toasts.value = [...toasts.value.slice(-2), toast]
  timers.set(toast.id, setTimeout(() => dismiss(toast.id), toast.timeout))
  return toast.id
}

/** Global, dependency-free toast queue. */
export function useToast() {
  return {
    toasts,
    show,
    dismiss,
    error: (message: string) => show(message, { tone: 'error', timeout: 5000 }),
    /** Shows a message with an "Undo" button. */
    undoable: (message: string, undo: () => void) => show(message, { action: { label: 'Undo', run: undo } }),
  }
}
