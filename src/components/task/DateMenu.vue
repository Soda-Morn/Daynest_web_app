<script setup>
import { computed } from 'vue'
import { CalendarDays, CalendarX2, Sofa, Sun, Sunrise } from 'lucide-vue-next'
import Dropdown from '@/components/ui/Dropdown.vue'
import MiniCalendar from '@/components/ui/MiniCalendar.vue'
import { addDays, formatDate, weekday } from '@/utils/date'
import { useUiStore } from '@/stores/ui'

/** Quick reschedule menu: common choices + a month picker. */
defineProps({
  modelValue: { type: [String, null], required: true },
  allowClear: { type: Boolean, default: true },
  placement: { type: String, default: 'bottom-start' },
})
const emit = defineEmits(['pick'])
const ui = useUiStore()

const options = computed(() => {
  const t = ui.today
  const wd = weekday(t)
  const sat = addDays(t, (6 - wd + 7) % 7 || 7)
  const nextMon = addDays(t, (1 - wd + 7) % 7 || 7)
  return [
    { label: 'Today', date: t, icon: Sun },
    { label: 'Tomorrow', date: addDays(t, 1), icon: Sunrise },
    { label: 'This weekend', date: wd === 6 || wd === 0 ? t : sat, icon: Sofa },
    { label: 'Next week', date: nextMon, icon: CalendarDays },
  ]
})

function choose(d, close) {
  emit('pick', d)
  close()
}
</script>

<template>
  <Dropdown :placement="placement" :width="268" label="Choose date">
    <template #trigger="{ toggle, open }">
      <slot :toggle="toggle" :open="open" />
    </template>
    <template #default="{ close }">
      <button v-for="o in options" :key="o.label" type="button" role="menuitem" class="menu-item" @click="choose(o.date, close)">
        <component :is="o.icon" />
        {{ o.label }}
        <span class="hint">{{ formatDate(o.date, { weekday: 'short' }) }}</span>
      </button>
      <button v-if="allowClear && modelValue" type="button" role="menuitem" class="menu-item" @click="choose(null, close)">
        <CalendarX2 />
        No date
      </button>
      <div class="menu-sep" />
      <div class="pad">
        <MiniCalendar :model-value="modelValue" @select="(d) => choose(d, close)" />
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.pad { padding: 4px; }
</style>
