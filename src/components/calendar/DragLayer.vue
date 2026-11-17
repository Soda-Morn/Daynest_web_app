<script setup lang="ts">
import { computed } from 'vue'
import { dragState } from '@/composables/useDragTask'
import { useCollectionsStore } from '@/stores/collections'

/** Floating label that follows the pointer during a drag (moves only). */
const collections = useCollectionsStore()
const s = computed(() => (dragState.value?.mode === 'move' ? dragState.value : null))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="s"
      class="ghost tinted"
      :style="{ transform: `translate(${s.x + 12}px, ${s.y + 12}px)`, '--c': collections.colorOf(s.inst.task.calendarId) }"
      aria-hidden="true"
    >
      {{ s.label }}
    </div>
  </Teleport>
</template>

<style scoped>
.ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
  max-width: 220px;
  padding: 4px 10px;
  border-radius: 8px;
  box-shadow: var(--shadow);
  font-size: 12px;
  font-weight: var(--weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  will-change: transform;
}
</style>
