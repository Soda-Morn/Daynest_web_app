<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'
import ColorPicker from '@/components/ui/ColorPicker.vue'
import { PALETTE } from '@/constants'
import { useCollectionsStore } from '@/stores/collections'
import { useToast } from '@/composables/useToast'
import { confirmDialog } from '@/composables/useDialogs'
import { collectionDialog, closeCollectionDialog } from '@/composables/useCollectionDialog'
import { ValidationError } from '@/utils/validation'
import { useTaskStore } from '@/stores/tasks'

/** Create / rename / recolour / delete a calendar or task list. */
const collections = useCollectionsStore()
const tasks = useTaskStore()
const toast = useToast()

const name = ref('')
const color = ref<string>(PALETTE[0].value)
const error = ref('')

const state = computed(() => collectionDialog.value)
const editing = computed(() => {
  const s = state.value
  if (!s?.id) return null
  return s.kind === 'calendar' ? collections.calendarById.get(s.id) ?? null : collections.listById.get(s.id) ?? null
})
const noun = computed(() => (state.value?.kind === 'calendar' ? 'calendar' : 'list'))
const title = computed(() => (editing.value ? `Edit ${noun.value}` : `New ${noun.value}`))

watch(state, (s) => {
  if (!s) return
  error.value = ''
  name.value = editing.value?.name ?? ''
  const used = new Set((s.kind === 'calendar' ? collections.calendars : collections.lists).map((c) => c.color))
  color.value = editing.value?.color ?? PALETTE.find((p) => !used.has(p.value))?.value ?? PALETTE[0].value
})

function save() {
  const s = state.value
  if (!s) return
  try {
    if (s.kind === 'calendar') {
      if (editing.value) collections.updateCalendar(editing.value.id, { name: name.value, color: color.value })
      else collections.createCalendar(name.value, color.value)
    } else {
      if (editing.value) collections.updateList(editing.value.id, { name: name.value, color: color.value })
      else collections.createList(name.value, color.value)
    }
    closeCollectionDialog()
  } catch (e) {
    error.value = e instanceof ValidationError ? e.message : 'Could not save'
  }
}

async function remove() {
  const item = editing.value
  const s = state.value
  if (!item || !s) return
  const count = tasks.tasks.filter((t) => (s.kind === 'calendar' ? t.calendarId === item.id : t.listId === item.id)).length
  const message =
    s.kind === 'calendar'
      ? count
        ? `Its ${count} task${count === 1 ? '' : 's'} will move to another calendar.`
        : 'This calendar has no tasks.'
      : count
        ? `Its ${count} task${count === 1 ? '' : 's'} will be kept without a list.`
        : 'This list has no tasks.'
  const ok = await confirmDialog({ title: `Delete “${item.name}”?`, message, confirmLabel: 'Delete', danger: true })
  if (!ok) return
  try {
    if (s.kind === 'calendar') {
      const fallback = collections.deleteCalendar(item.id)
      if (count) toast.show(`Tasks moved to ${fallback.name}`)
    } else collections.deleteList(item.id)
    closeCollectionDialog()
  } catch (e) {
    toast.error(e instanceof ValidationError ? e.message : 'Could not delete')
  }
}
</script>

<template>
  <Modal :open="!!state" :title="title" size="sm" @close="closeCollectionDialog">
    <form class="form" @submit.prevent="save">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="name" class="input" maxlength="60" required data-autofocus :aria-invalid="!!error" :placeholder="state?.kind === 'calendar' ? 'e.g. Side project' : 'e.g. Groceries'" />
      </label>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div class="field">
        <span class="field-label">Colour</span>
        <ColorPicker v-model="color" />
      </div>
      <div class="actions">
        <button v-if="editing" type="button" class="btn btn-ghost danger" @click="remove"><Trash2 />Delete</button>
        <span class="spacer" />
        <button type="button" class="btn btn-secondary" @click="closeCollectionDialog">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!name.trim()">{{ editing ? 'Save' : 'Create' }}</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: var(--space-4); }
.err { color: var(--danger); font-size: var(--text-sm); margin-top: calc(var(--space-2) * -1); }
.actions { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
.spacer { flex: 1; }
.danger { color: var(--danger); }
</style>
