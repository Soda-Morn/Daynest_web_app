<script setup>
import { computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import TaskDetailBody from './TaskDetailBody.vue'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/tasks'
import { useIsMobile } from '@/composables/useMediaQuery'

/** Side panel on desktop, bottom sheet on mobile. Same content either way. */
const ui = useUiStore()
const store = useTaskStore()
const isMobile = useIsMobile()
const open = computed(() => !!ui.detailKey && !!store.resolveInstance(ui.detailKey))
</script>

<template>
  <Modal v-if="isMobile" :open="open" title="Task details" hide-header @close="ui.closeTask()">
    <TaskDetailBody />
  </Modal>
  <Transition v-else name="slide">
    <aside v-if="open" class="side" aria-label="Task details">
      <TaskDetailBody />
    </aside>
  </Transition>
</template>

<style scoped>
.side {
  width: 400px;
  height: 100%;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
}
@media (max-width: 1180px) {
  .side { position: absolute; right: 0; top: 0; bottom: 0; z-index: 30; box-shadow: var(--shadow-lg); }
}
.slide-enter-active, .slide-leave-active { transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur) var(--ease); }
.slide-enter-from, .slide-leave-to { transform: translateX(24px); opacity: 0; }
</style>
