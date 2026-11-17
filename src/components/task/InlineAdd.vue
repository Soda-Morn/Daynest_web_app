<script setup>
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useQuickParse } from '@/composables/useQuickParse'
import { useTaskActions } from '@/composables/useTaskActions'
import { useUiStore } from '@/stores/ui'
import { formatTime, relativeDayLabel } from '@/utils/date'
import { describeRecurrence } from '@/utils/recurrence'
import { useSettingsStore } from '@/stores/settings'

/** One-line "add task" input for list pages. Enter saves, text is parsed. */
const props = defineProps({
  defaults: { type: Object, default: () => ({}) },
  placeholder: { type: String, default: 'Add a task' },
})
const text = ref('')
const defaults = computed(() => props.defaults)
const overrides = ref({})
const { draft, parsed } = useQuickParse(text, defaults, overrides)
const actions = useTaskActions()
const ui = useUiStore()
const settings = useSettingsStore()

const preview = computed(() => {
  if (!parsed.value.tokens.length) return ''
  const d = draft.value
  const parts = []
  if (d.startDate) parts.push(relativeDayLabel(d.startDate, ui.today))
  if (d.startTime) parts.push(formatTime(d.startTime, settings.settings.timeFormat))
  if (d.recurrence) parts.push(describeRecurrence(d.recurrence, d.startDate))
  if (d.priority && d.priority !== 'medium') parts.push(d.priority)
  return parts.join(' · ')
})

function submit() {
  if (!draft.value.title.trim()) return
  if (actions.create(draft.value)) text.value = ''
}
</script>

<template>
  <form class="inline-add" @submit.prevent="submit">
    <Plus class="plus" aria-hidden="true" />
    <input v-model="text" class="ia-input" :placeholder="placeholder" :aria-label="placeholder" maxlength="200" enterkeyhint="done" />
    <span v-if="preview" class="preview">{{ preview }}</span>
  </form>
</template>

<style scoped>
.inline-add {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 46px;
  padding: 0 var(--space-4);
  margin-top: var(--space-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-3);
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.inline-add:focus-within { border-style: solid; border-color: var(--primary); background: var(--surface); }
.plus { width: 18px; height: 18px; color: var(--primary); flex-shrink: 0; }
.ia-input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: var(--text-md); height: 100%; }
.ia-input::placeholder { color: var(--text-3); }
.preview { font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--radius-full); background: var(--primary-soft); color: var(--primary-text); white-space: nowrap; }
@media (pointer: coarse) { .ia-input { font-size: 16px; } }
</style>
