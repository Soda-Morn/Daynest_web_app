<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DateKey, RecurrenceFreq, RecurrenceRule } from '@/types/models'
import { describeRecurrence } from '@/utils/recurrence'
import { fromKey, weekday, weekdayNames } from '@/utils/date'

/** Preset picker + custom editor (interval, unit, weekdays, end). */
const props = defineProps<{ modelValue: RecurrenceRule | null; start: DateKey | null }>()
const emit = defineEmits<{ 'update:modelValue': [RecurrenceRule | null] }>()

const custom = ref(false)
const draft = ref<RecurrenceRule>({ freq: 'weekly', interval: 1, byWeekday: [], until: null, count: null })
const endMode = ref<'never' | 'until' | 'count'>('never')

watch(
  () => props.modelValue,
  (r) => {
    if (r) {
      draft.value = { ...r, byWeekday: r.byWeekday ? [...r.byWeekday] : [] }
      endMode.value = r.until ? 'until' : r.count ? 'count' : 'never'
    }
  },
  { immediate: true },
)

const wd = computed(() => (props.start ? weekday(props.start) : 1))
const dayNames = weekdayNames(0, 'short')

const presets = computed(() => {
  const s = props.start
  const day = s ? fromKey(s).getDate() : 1
  return [
    { id: 'none', label: 'Does not repeat', rule: null },
    { id: 'daily', label: 'Every day', rule: { freq: 'daily', interval: 1 } },
    { id: 'weekdays', label: 'Every weekday (Mon–Fri)', rule: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] } },
    { id: 'weekly', label: `Every week on ${dayNames[wd.value]}`, rule: { freq: 'weekly', interval: 1, byWeekday: [wd.value] } },
    { id: 'monthly', label: `Every month on day ${day}`, rule: { freq: 'monthly', interval: 1 } },
    { id: 'monthlyLast', label: 'Every month on the last day', rule: { freq: 'monthly', interval: 1, lastDayOfMonth: true } },
    { id: 'yearly', label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
  ] as { id: string; label: string; rule: RecurrenceRule | null }[]
})

const selectedPreset = computed(() => {
  const r = props.modelValue
  if (!r) return 'none'
  const plain = !r.until && !r.count && r.interval === 1
  if (!plain) return 'custom'
  const days = [...(r.byWeekday ?? [])].sort().join()
  if (r.freq === 'daily') return 'daily'
  if (r.freq === 'weekly' && days === '1,2,3,4,5') return 'weekdays'
  if (r.freq === 'weekly' && (days === String(wd.value) || !days)) return 'weekly'
  if (r.freq === 'monthly') return r.lastDayOfMonth ? 'monthlyLast' : 'monthly'
  if (r.freq === 'yearly') return 'yearly'
  return 'custom'
})

function onPreset(id: string) {
  if (id === 'custom') {
    custom.value = true
    if (!props.modelValue) draft.value = { freq: 'weekly', interval: 1, byWeekday: [wd.value], until: null, count: null }
    return
  }
  custom.value = false
  emit('update:modelValue', presets.value.find((p) => p.id === id)?.rule ?? null)
}

function toggleDay(d: number) {
  const set = new Set(draft.value.byWeekday ?? [])
  if (set.has(d)) set.delete(d)
  else set.add(d)
  draft.value = { ...draft.value, byWeekday: [...set].sort() }
}

function applyCustom() {
  const r: RecurrenceRule = {
    freq: draft.value.freq,
    interval: Math.max(1, Math.min(999, Math.floor(draft.value.interval || 1))),
    byWeekday: draft.value.freq === 'weekly' && draft.value.byWeekday?.length ? draft.value.byWeekday : undefined,
    until: endMode.value === 'until' ? draft.value.until || null : null,
    count: endMode.value === 'count' ? Math.max(1, draft.value.count || 1) : null,
  }
  emit('update:modelValue', r)
  custom.value = false
}

const UNITS: { value: RecurrenceFreq; label: string }[] = [
  { value: 'daily', label: 'day(s)' },
  { value: 'weekly', label: 'week(s)' },
  { value: 'monthly', label: 'month(s)' },
  { value: 'yearly', label: 'year(s)' },
]
</script>

<template>
  <div class="rec">
    <select class="select" :value="custom ? 'custom' : selectedPreset" :disabled="!start" aria-label="Repeat" @change="onPreset(($event.target as HTMLSelectElement).value)">
      <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.label }}</option>
      <option value="custom">{{ selectedPreset === 'custom' && modelValue && !custom ? describeRecurrence(modelValue, start) : 'Custom…' }}</option>
    </select>
    <p v-if="!start" class="note">Set a date to make it repeat.</p>

    <div v-if="custom" class="custom">
      <div class="line">
        <span>Every</span>
        <input v-model.number="draft.interval" class="input num" type="number" min="1" max="999" aria-label="Interval" />
        <select v-model="draft.freq" class="select unit" aria-label="Unit">
          <option v-for="u in UNITS" :key="u.value" :value="u.value">{{ u.label }}</option>
        </select>
      </div>
      <div v-if="draft.freq === 'weekly'" class="days" role="group" aria-label="Days of week">
        <button
          v-for="(n, i) in dayNames"
          :key="i"
          type="button"
          class="day"
          :aria-pressed="draft.byWeekday?.includes(i)"
          :aria-label="n"
          @click="toggleDay(i)"
        >
          {{ n.slice(0, 2) }}
        </button>
      </div>
      <div class="line">
        <span>Ends</span>
        <select v-model="endMode" class="select unit" aria-label="Ends">
          <option value="never">Never</option>
          <option value="until">On date</option>
          <option value="count">After</option>
        </select>
        <input v-if="endMode === 'until'" v-model="draft.until" class="input" type="date" aria-label="End date" />
        <template v-if="endMode === 'count'">
          <input v-model.number="draft.count" class="input num" type="number" min="1" aria-label="Occurrences" />
          <span>times</span>
        </template>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="custom = false">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" @click="applyCustom">Apply</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rec { display: grid; gap: var(--space-2); }
.note { font-size: var(--text-xs); color: var(--text-3); }
.custom { display: grid; gap: var(--space-3); padding: var(--space-3); border-radius: var(--radius); background: var(--surface-2); border: 1px solid var(--border); }
.line { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-2); flex-wrap: wrap; }
.num { width: 72px; }
.unit { width: auto; flex: 1; min-width: 110px; }
.days { display: flex; gap: 4px; flex-wrap: wrap; }
.day {
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface);
  font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--text-2);
}
.day[aria-pressed='true'] { background: var(--primary); border-color: var(--primary); color: var(--primary-contrast); }
.actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
