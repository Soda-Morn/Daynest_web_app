<script setup>
import { computed } from 'vue'
import TaskItem from './TaskItem.vue'
import { useIncremental } from '@/composables/useIncremental'

/**
 * Renders grouped tasks as one flat, incrementally-rendered list so that
 * thousands of tasks never produce thousands of DOM nodes at once.
 */
const props = defineProps({
  groups: { type: Array, required: true },
  showDate: { type: Boolean, default: true },
  showList: { type: Boolean, default: true },
  pageSize: { type: Number, default: 80 },
})

const rows = computed(() => {
  const out = []
  for (const g of props.groups) {
    if (!g.items.length) continue
    if (g.label) out.push({ kind: 'head', key: 'g:' + g.id, label: g.label, count: g.items.length, tone: g.tone ?? 'default' })
    for (const inst of g.items) out.push({ kind: 'item', key: g.id + ':' + inst.key, inst })
  }
  return out
})

const { visible, hasMore, sentinel, more, total } = useIncremental(rows, props.pageSize)
const setSentinel = (el) => (sentinel.value = el ?? null)
</script>

<template>
  <div class="glist">
    <template v-for="r in visible" :key="r.key">
      <h3 v-if="r.kind === 'head'" class="g-head" :class="r.tone">
        {{ r.label }}<span class="g-count">{{ r.count }}</span>
      </h3>
      <TaskItem v-else :inst="r.inst" :show-date="showDate" :show-list="showList" />
    </template>
    <div v-if="hasMore" :ref="setSentinel" class="more">
      <button type="button" class="btn btn-ghost btn-sm" @click="more">Show more ({{ total - visible.length }} remaining)</button>
    </div>
  </div>
</template>

<style scoped>
.glist { display: grid; }
.g-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: var(--space-5) 0 var(--space-1);
  padding: 0 var(--space-1);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
}
.g-head:first-child { margin-top: 0; }
.g-head.late { color: var(--overdue); }
.g-count { font-size: var(--text-sm); color: var(--text-3); font-weight: var(--weight-semibold); }
.more { display: flex; justify-content: center; padding: var(--space-3); }
</style>
