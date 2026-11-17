<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { DateKey } from '@/types/models'
import { addDays, addMonths, formatDate, isSameMonth, monthGrid, weekdayNames } from '@/utils/date'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'

/** Compact month picker with keyboard support (arrows, PageUp/Down, Enter). */
const props = defineProps<{ modelValue: DateKey | null; markers?: Set<DateKey> }>()
const emit = defineEmits<{ select: [DateKey] }>()

const ui = useUiStore()
const settings = useSettingsStore()
const cursor = ref<DateKey>(props.modelValue ?? ui.today)
const grid = ref<HTMLElement | null>(null)
watch(
  () => props.modelValue,
  (v) => v && (cursor.value = v),
)

const weeks = computed(() => monthGrid(cursor.value, settings.settings.weekStartsOn))
const names = computed(() => weekdayNames(settings.settings.weekStartsOn, 'narrow'))
const title = computed(() => formatDate(cursor.value, { month: 'long', year: 'numeric' }))

async function onKey(e: KeyboardEvent) {
  const steps: Record<string, () => DateKey> = {
    ArrowLeft: () => addDays(cursor.value, -1),
    ArrowRight: () => addDays(cursor.value, 1),
    ArrowUp: () => addDays(cursor.value, -7),
    ArrowDown: () => addDays(cursor.value, 7),
    PageUp: () => addMonths(cursor.value, -1),
    PageDown: () => addMonths(cursor.value, 1),
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select', cursor.value)
    return
  }
  const step = steps[e.key]
  if (!step) return
  e.preventDefault()
  e.stopPropagation()
  cursor.value = step()
  await nextTick()
  grid.value?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
}
</script>

<template>
  <div class="mini">
    <div class="mini-head">
      <span class="mini-title">{{ title }}</span>
      <button type="button" class="icon-btn sm" aria-label="Previous month" @click="cursor = addMonths(cursor, -1)"><ChevronLeft /></button>
      <button type="button" class="icon-btn sm" aria-label="Next month" @click="cursor = addMonths(cursor, 1)"><ChevronRight /></button>
    </div>
    <div ref="grid" class="grid" role="grid" :aria-label="title" @keydown="onKey">
      <span v-for="(n, i) in names" :key="'h' + i" class="dow" aria-hidden="true">{{ n }}</span>
      <template v-for="week in weeks" :key="week[0]">
        <button
          v-for="d in week"
          :key="d"
          type="button"
          role="gridcell"
          class="day"
          :class="{ out: !isSameMonth(d, cursor), today: d === ui.today, selected: d === modelValue }"
          :tabindex="d === cursor ? 0 : -1"
          :aria-selected="d === modelValue"
          :aria-label="formatDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })"
          :data-menu-item="d === cursor ? '' : undefined"
          @click="emit('select', d)"
        >
          {{ +d.slice(8) }}
          <span v-if="markers?.has(d)" class="marker" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mini { width: 100%; min-width: 236px; }
.mini-head { display: flex; align-items: center; gap: 2px; padding: 2px 2px 6px 6px; }
.mini-title { flex: 1; font-weight: var(--weight-semibold); font-size: var(--text-sm); }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dow { display: grid; place-items: center; height: 24px; font-size: 11px; color: var(--text-3); font-weight: var(--weight-semibold); }
.day {
  position: relative;
  display: grid; place-items: center; aspect-ratio: 1; min-height: 30px; border: 0; border-radius: 50%;
  background: transparent; font-size: var(--text-sm); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; color: var(--text);
  transition: background var(--dur-fast) var(--ease);
}
.day:hover { background: var(--surface-hover); }
.day.out { color: var(--text-3); }
.day.today { color: var(--primary-text); font-weight: var(--weight-bold); }
.day.selected { background: var(--primary); color: var(--primary-contrast); font-weight: var(--weight-semibold); }
.marker { position: absolute; bottom: 3px; width: 4px; height: 4px; border-radius: 50%; background: var(--secondary); }
.selected .marker { background: var(--primary-contrast); }
</style>
