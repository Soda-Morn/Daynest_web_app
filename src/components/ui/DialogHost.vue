<script setup lang="ts">
import Modal from './Modal.vue'
import { activeDialog } from '@/composables/useDialogs'

function cancel() {
  const cur = activeDialog.value
  if (!cur) return
  if (cur.kind === 'confirm') cur.resolve(false)
  else cur.resolve(null)
}
</script>

<template>
  <Modal :open="!!activeDialog" :title="activeDialog?.title" size="sm" @close="cancel">
    <template v-if="activeDialog?.kind === 'confirm'">
      <p v-if="activeDialog.message" class="msg">{{ activeDialog.message }}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="activeDialog.resolve(false)">Cancel</button>
        <button
          type="button"
          class="btn"
          :class="activeDialog.danger ? 'btn-danger' : 'btn-primary'"
          data-autofocus
          @click="activeDialog.resolve(true)"
        >
          {{ activeDialog.confirmLabel }}
        </button>
      </div>
    </template>
    <template v-else-if="activeDialog?.kind === 'scope'">
      <p class="msg">This is a recurring task. {{ activeDialog.verb }}:</p>
      <div class="scopes">
        <button type="button" class="btn btn-secondary" data-autofocus @click="activeDialog.resolve('this')">This occurrence</button>
        <button v-if="activeDialog.allowFuture" type="button" class="btn btn-secondary" @click="activeDialog.resolve('future')">
          This and following
        </button>
        <button type="button" class="btn btn-secondary" @click="activeDialog.resolve('all')">All occurrences</button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.msg { color: var(--text-2); margin-bottom: var(--space-5); }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
.scopes { display: grid; gap: var(--space-2); }
.scopes .btn { justify-content: flex-start; }
</style>
