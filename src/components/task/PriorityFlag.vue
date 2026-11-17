<script setup lang="ts">
import { Flag } from 'lucide-vue-next'
import type { Priority } from '@/types/models'

defineProps<{ priority: Priority; showLabel?: boolean }>()
const LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
</script>

<template>
  <span class="flag" :class="`p-${priority}`" :title="`${LABEL[priority]} priority`">
    <Flag :fill="priority === 'urgent' || priority === 'high' ? 'currentColor' : 'none'" />
    <span v-if="showLabel">{{ LABEL[priority] }}</span>
    <span v-else class="sr-only">{{ LABEL[priority] }} priority</span>
  </span>
</template>

<style scoped>
.flag { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-xs); font-weight: var(--weight-medium); }
.flag svg { width: 12px; height: 12px; }
.p-low { color: var(--prio-low); }
.p-medium { color: var(--prio-medium); }
.p-high { color: var(--prio-high); }
.p-urgent { color: var(--prio-urgent); }
</style>
