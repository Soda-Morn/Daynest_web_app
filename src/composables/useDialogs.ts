import { shallowRef } from 'vue'
import type { RecurringEditScope } from '@/types/models'

/**
 * Promise-based confirm and "which occurrences?" dialogs, so business code
 * can simply `await confirm(...)` without managing dialog state.
 */

export interface ConfirmRequest {
  kind: 'confirm'
  title: string
  message?: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

export interface ScopeRequest {
  kind: 'scope'
  title: string
  verb: string
  allowFuture: boolean
  resolve: (scope: RecurringEditScope | null) => void
}

export const activeDialog = shallowRef<ConfirmRequest | ScopeRequest | null>(null)

function close() {
  activeDialog.value = null
}

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  activeDialog.value?.resolve(null as never)
  return new Promise((resolve) => {
    activeDialog.value = {
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger ?? false,
      resolve: (ok) => {
        close()
        resolve(ok)
      },
    }
  })
}

/** Asks whether an edit applies to this, following, or all occurrences. Null = cancelled. */
export function chooseScope(opts: { title: string; verb: string; allowFuture?: boolean }): Promise<RecurringEditScope | null> {
  activeDialog.value?.resolve(null as never)
  return new Promise((resolve) => {
    activeDialog.value = {
      kind: 'scope',
      title: opts.title,
      verb: opts.verb,
      allowFuture: opts.allowFuture ?? true,
      resolve: (scope) => {
        close()
        resolve(scope)
      },
    }
  })
}
