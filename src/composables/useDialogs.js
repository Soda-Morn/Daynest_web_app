import { shallowRef } from 'vue'

/**
 * Promise-based confirm and "which occurrences?" dialogs, so business code
 * can simply `await confirm(...)` without managing dialog state.
 */

export const activeDialog = shallowRef(null)

function close() {
  activeDialog.value = null
}

export function confirmDialog(opts) {
  activeDialog.value?.resolve(null)
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
export function chooseScope(opts) {
  activeDialog.value?.resolve(null)
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
