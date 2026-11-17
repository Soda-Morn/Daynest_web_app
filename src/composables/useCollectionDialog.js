import { shallowRef } from 'vue'

export const collectionDialog = shallowRef(null)

export function openCollectionDialog(kind, id) {
  collectionDialog.value = { kind, id }
}

export function closeCollectionDialog() {
  collectionDialog.value = null
}
