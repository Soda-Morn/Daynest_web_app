import { shallowRef } from 'vue'

export interface CollectionDialogState {
  kind: 'calendar' | 'list'
  /** Present when editing an existing item. */
  id?: string
}

export const collectionDialog = shallowRef<CollectionDialogState | null>(null)

export function openCollectionDialog(kind: CollectionDialogState['kind'], id?: string) {
  collectionDialog.value = { kind, id }
}

export function closeCollectionDialog() {
  collectionDialog.value = null
}
