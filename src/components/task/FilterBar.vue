<script setup>
import { computed } from 'vue'
import { Check, Flag, SlidersHorizontal, X } from 'lucide-vue-next'
import Dropdown from '@/components/ui/Dropdown.vue'
import { PRIORITIES } from '@/constants'
import { useCollectionsStore } from '@/stores/collections'
const props = defineProps({
  modelValue: { type: Object, required: true },
  quick: { type: Array, default: () => ['all', 'today', 'upcoming', 'overdue', 'unscheduled', 'completed'] },
  hideLists: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const collections = useCollectionsStore()

const LABELS = {
  all: 'All',
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  unscheduled: 'No date',
  completed: 'Completed',
}

const extraCount = computed(
  () => props.modelValue.priorities.length + props.modelValue.calendarIds.length + props.modelValue.listIds.length,
)

function set(patch) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
function toggle(key, value) {
  const arr = props.modelValue[key]
  set({ [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] })
}
</script>

<template>
  <div class="filters">
    <div class="quick" role="toolbar" aria-label="Quick filters">
      <button
        v-for="q in quick"
        :key="q"
        type="button"
        class="chip"
        :aria-pressed="modelValue.quick === q"
        @click="set({ quick: q })"
      >
        {{ LABELS[q] }}
      </button>
    </div>
    <Dropdown placement="bottom-end" :width="260" label="Filters">
      <template #trigger="{ toggle: t }">
        <button type="button" class="chip" :class="{ active: extraCount }" @click="t">
          <SlidersHorizontal />Filters<span v-if="extraCount" class="count">{{ extraCount }}</span>
        </button>
      </template>
      <div class="menu-label">Priority</div>
      <button
        v-for="p in PRIORITIES"
        :key="p.value"
        type="button"
        role="menuitemcheckbox"
        class="menu-item"
        :aria-checked="modelValue.priorities.includes(p.value)"
        @click="toggle('priorities', p.value)"
      >
        <Flag :class="`p-${p.value}`" />{{ p.label }}
        <Check v-if="modelValue.priorities.includes(p.value)" class="tick" />
      </button>
      <div class="menu-sep" />
      <div class="menu-label">Calendar</div>
      <button
        v-for="c in collections.sortedCalendars"
        :key="c.id"
        type="button"
        role="menuitemcheckbox"
        class="menu-item"
        :aria-checked="modelValue.calendarIds.includes(c.id)"
        @click="toggle('calendarIds', c.id)"
      >
        <span class="dot" :style="{ '--c': c.color }" />{{ c.name }}
        <Check v-if="modelValue.calendarIds.includes(c.id)" class="tick" />
      </button>
      <template v-if="!hideLists">
        <div class="menu-sep" />
        <div class="menu-label">List</div>
        <button
          v-for="l in collections.sortedLists"
          :key="l.id"
          type="button"
          role="menuitemcheckbox"
          class="menu-item"
          :aria-checked="modelValue.listIds.includes(l.id)"
          @click="toggle('listIds', l.id)"
        >
          <span class="dot" :style="{ '--c': l.color }" />{{ l.name }}
          <Check v-if="modelValue.listIds.includes(l.id)" class="tick" />
        </button>
      </template>
    </Dropdown>
    <button v-if="extraCount" type="button" class="chip" aria-label="Clear filters" @click="set({ priorities: [], calendarIds: [], listIds: [] })">
      <X />Clear
    </button>
  </div>
</template>

<style scoped>
.filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.quick { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
.quick::-webkit-scrollbar { display: none; }
.count { display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--primary); color: var(--primary-contrast); font-size: 11px; }
.tick { margin-left: auto; color: var(--primary) !important; }
.p-low { color: var(--prio-low) !important; }
.p-medium { color: var(--prio-medium) !important; }
.p-high { color: var(--prio-high) !important; }
.p-urgent { color: var(--prio-urgent) !important; }
@media (max-width: 767px) {
  .filters { flex-wrap: nowrap; }
  .quick { flex: 1; min-width: 0; }
}
</style>
