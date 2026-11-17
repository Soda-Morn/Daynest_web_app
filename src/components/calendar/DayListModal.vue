<script setup lang="ts">
import { computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import TaskItem from '@/components/task/TaskItem.vue'
import InlineAdd from '@/components/task/InlineAdd.vue'
import type { DateKey } from '@/types/models'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { formatDate } from '@/utils/date'

/** All tasks of one day ("+N more" in the month view). */
const props = defineProps<{ date: DateKey | null }>()
defineEmits<{ close: [] }>()
const store = useTaskStore()
const collections = useCollectionsStore()

const items = computed(() => (props.date ? (store.dayMap(props.date, props.date, collections.visibleCalendarIds).get(props.date) ?? []) : []))
const title = computed(() => (props.date ? formatDate(props.date, { weekday: 'long', month: 'long', day: 'numeric' }) : ''))
const defaults = computed(() => ({ startDate: props.date }))
</script>

<template>
  <Modal :open="!!date" :title="title" size="sm" @close="$emit('close')">
    <div class="list">
      <TaskItem v-for="i in items" :key="i.key" :inst="i" :show-date="false" />
    </div>
    <InlineAdd :defaults="defaults" placeholder="Add a task for this day" />
  </Modal>
</template>

<style scoped>
.list { display: grid; margin: 0 calc(var(--space-2) * -1) var(--space-3); }
</style>
