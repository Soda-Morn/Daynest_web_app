<script setup>
import { computed, ref, watch } from 'vue'
import { AlignLeft, CalendarDays, Clock, Flag, FolderOpen, Repeat, Sparkles, X } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import DateMenu from './DateMenu.vue'
import { PRIORITIES } from '@/constants'
import { useUiStore } from '@/stores/ui'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { useQuickParse } from '@/composables/useQuickParse'
import { useTaskActions } from '@/composables/useTaskActions'
import { formatTime, relativeDayLabel } from '@/utils/date'
import { describeRecurrence } from '@/utils/recurrence'

/**
 * Quick Add: type naturally ("Gym every weekday at 7am #fitness"), or use
 * the chips. Enter saves. Opens as a dialog on desktop and a bottom sheet on
 * mobile.
 */
const ui = useUiStore()
const collections = useCollectionsStore()
const settings = useSettingsStore()
const actions = useTaskActions()

const text = ref('')
const description = ref('')
const descEl = ref(null)
const overrides = ref({})
const defaults = computed(() => ui.quickAddDefaults)
const keepOpen = ref(false)
const { parsed, draft } = useQuickParse(text, defaults, overrides)

watch(
  () => ui.quickAddOpen,
  () => {
    // Reset on open and on close so stale text can never be re-submitted.
    reset()
  },
)

function reset() {
  text.value = ''
  description.value = ''
  overrides.value = {}
  autosize()
}

/** The description box grows with its content (up to a limit set in CSS). */
function autosize() {
  const el = descEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

/** Ctrl/Cmd + Enter saves from the description; plain Enter adds a new line. */
function onDescKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    save()
  }
}

const cal = computed(() => collections.calendarById.get(draft.value.calendarId ?? ''))
const list = computed(() => (draft.value.listId ? collections.listById.get(draft.value.listId) : undefined))
const fmt = computed(() => settings.settings.timeFormat)
const timeLabel = computed(() => {
  const d = draft.value
  if (!d.startTime) return 'Time'
  return d.endTime ? `${formatTime(d.startTime, fmt.value)} – ${formatTime(d.endTime, fmt.value)}` : formatTime(d.startTime, fmt.value)
})
const understood = computed(() => parsed.value.tokens.length > 0)

function set(k, v) {
  overrides.value = { ...overrides.value, [k]: v }
}

function clearTime() {
  overrides.value = { ...overrides.value, startTime: null, endTime: null }
}

function save() {
  const d = draft.value
  if (!d.title.trim()) return
  const t = actions.create({ ...d, description: description.value.trim() })
  if (!t) return
  if (keepOpen.value) reset()
  else ui.closeQuickAdd()
}

const examples = [
  'Finish payroll testing tomorrow at 3pm',
  'Gym every weekday at 7am #fitness',
  'Pay bills on the first day of every month !high',
]
</script>

<template>
  <Modal :open="ui.quickAddOpen" title="New task" size="md" top hide-header @close="ui.closeQuickAdd()">
    <form class="qa" autocomplete="off" @submit.prevent="save">
      <div class="input-wrap">
        <Sparkles class="lead" aria-hidden="true" />
        <input
          v-model="text"
          class="qa-input"
          type="text"
          placeholder="What do you need to do?"
          aria-label="Task title — dates, times and #calendar are understood"
          autocomplete="off"
          autocapitalize="sentences"
          enterkeyhint="done"
          maxlength="200"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          data-autofocus
        />
        <button type="button" class="icon-btn sm" aria-label="Close" @click="ui.closeQuickAdd()"><X /></button>
      </div>

      <p v-if="understood" class="understood" aria-live="polite">
        <span v-for="(t, i) in parsed.tokens" :key="i" class="tok" :class="t.kind">{{ text.slice(t.start, t.end) }}</span>
      </p>
      <p v-else-if="!text" class="hint">Try: <button v-for="e in examples" :key="e" type="button" class="ex" @click="text = e">{{ e }}</button></p>

      <div class="desc-wrap">
        <AlignLeft class="desc-ic" aria-hidden="true" />
        <textarea
          ref="descEl"
          v-model="description"
          class="desc"
          rows="1"
          placeholder="Add a description (optional)"
          aria-label="Description"
          maxlength="10000"
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          @input="autosize"
          @keydown="onDescKey"
        />
      </div>

      <div class="chips">
        <DateMenu :model-value="draft.startDate ?? null" @pick="(d) => set('startDate', d)">
          <template #default="{ toggle }">
            <button type="button" class="chip" :class="{ active: draft.startDate }" @click="toggle">
              <CalendarDays />{{ draft.startDate ? relativeDayLabel(draft.startDate, ui.today) : 'Date' }}
            </button>
          </template>
        </DateMenu>

        <Dropdown v-if="draft.startDate" :width="230" label="Time">
          <template #trigger="{ toggle }">
            <button type="button" class="chip" :class="{ active: draft.startTime }" @click="toggle"><Clock />{{ timeLabel }}</button>
          </template>
          <template #default="{ close }">
            <div class="time-pop">
              <label class="field"><span class="field-label">Start</span>
                <input class="input" type="time" :value="draft.startTime ?? ''" data-autofocus @change="set('startTime', ($event.target).value || null)" />
              </label>
              <label class="field"><span class="field-label">End</span>
                <input class="input" type="time" :value="draft.endTime ?? ''" @change="set('endTime', ($event.target).value || null)" />
              </label>
              <div class="row">
                <button type="button" class="btn btn-ghost btn-sm" @click="clearTime(); close()">All day</button>
                <button type="button" class="btn btn-primary btn-sm" @click="close()">Done</button>
              </div>
            </div>
          </template>
        </Dropdown>

        <Dropdown label="Priority">
          <template #trigger="{ toggle }">
            <button type="button" class="chip" :class="{ active: draft.priority !== 'medium' }" @click="toggle">
              <Flag :class="`p-${draft.priority}`" />{{ PRIORITIES.find((p) => p.value === draft.priority)?.label }}
            </button>
          </template>
          <template #default="{ close }">
            <button
              v-for="p in PRIORITIES"
              :key="p.value"
              type="button"
              role="menuitemradio"
              :aria-checked="draft.priority === p.value"
              class="menu-item"
              @click="set('priority', p.value); close()"
            >
              <Flag :class="`p-${p.value}`" />{{ p.label }}
            </button>
          </template>
        </Dropdown>

        <Dropdown label="Calendar">
          <template #trigger="{ toggle }">
            <button type="button" class="chip" @click="toggle"><span class="dot" :style="{ '--c': cal?.color }" />{{ cal?.name ?? 'Calendar' }}</button>
          </template>
          <template #default="{ close }">
            <button
              v-for="c in collections.sortedCalendars"
              :key="c.id"
              type="button"
              role="menuitemradio"
              :aria-checked="draft.calendarId === c.id"
              class="menu-item"
              @click="set('calendarId', c.id); close()"
            >
              <span class="dot" :style="{ '--c': c.color }" />{{ c.name }}
            </button>
          </template>
        </Dropdown>

        <Dropdown label="List">
          <template #trigger="{ toggle }">
            <button type="button" class="chip" :class="{ active: list }" @click="toggle"><FolderOpen />{{ list?.name ?? 'List' }}</button>
          </template>
          <template #default="{ close }">
            <button type="button" role="menuitemradio" :aria-checked="!draft.listId" class="menu-item" @click="set('listId', null); close()">No list</button>
            <button
              v-for="l in collections.sortedLists"
              :key="l.id"
              type="button"
              role="menuitemradio"
              :aria-checked="draft.listId === l.id"
              class="menu-item"
              @click="set('listId', l.id); close()"
            >
              <span class="dot" :style="{ '--c': l.color }" />{{ l.name }}
            </button>
          </template>
        </Dropdown>

        <span v-if="draft.recurrence" class="chip active static"><Repeat />{{ describeRecurrence(draft.recurrence, draft.startDate) }}</span>
      </div>

      <div class="foot">
        <label class="keep"><input v-model="keepOpen" type="checkbox" /> Add another</label>
        <span class="kb"><span class="kbd">Enter</span> to save</span>
        <button type="submit" class="btn btn-primary" :disabled="!draft.title.trim()">Add task</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.qa { display: grid; gap: var(--space-3); padding-top: var(--space-3); }
.input-wrap { display: flex; align-items: center; gap: var(--space-2); }
.lead { width: 20px; height: 20px; color: var(--primary); flex-shrink: 0; }
.qa-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 0;
  background: transparent;
  font-size: var(--text-lg);
  font-weight: var(--weight-medium);
  outline: none;
}
.qa-input::placeholder { color: var(--text-3); font-weight: var(--weight-regular); }
.desc-wrap { display: flex; align-items: flex-start; gap: var(--space-2); }
.desc-ic { width: 18px; height: 18px; margin: 9px 1px 0; color: var(--text-3); flex-shrink: 0; }
.desc {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  max-height: 180px;
  padding: 7px 0;
  border: 0;
  background: transparent;
  resize: none;
  overflow-y: auto;
  font-size: var(--text-base);
  line-height: var(--leading);
  color: var(--text-2);
  outline: none;
}
.desc::placeholder { color: var(--text-3); }
@media (pointer: coarse) { .desc { font-size: 16px; } }
.understood, .hint { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: var(--text-sm); color: var(--text-3); }
.tok { padding: 1px 8px; border-radius: var(--radius-full); background: var(--primary-soft); color: var(--primary-text); font-weight: var(--weight-medium); }
.tok.priority { background: color-mix(in srgb, var(--prio-high) 15%, var(--surface)); color: color-mix(in srgb, var(--prio-high), var(--chip-ink) 40%); }
.tok.tag, .tok.list { background: var(--surface-sunken); color: var(--text-2); }
.ex { border: 1px dashed var(--border-strong); background: none; border-radius: var(--radius-full); padding: 2px 10px; color: var(--text-2); font-size: var(--text-sm); }
.ex:hover { border-color: var(--primary); color: var(--primary-text); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip.static { cursor: default; }
.p-low { color: var(--prio-low); }
.p-medium { color: var(--prio-medium); }
.p-high { color: var(--prio-high); }
.p-urgent { color: var(--prio-urgent); }
.time-pop { display: grid; gap: var(--space-3); padding: var(--space-2); }
.time-pop .row { display: flex; justify-content: space-between; }
.foot { display: flex; align-items: center; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border); }
.keep { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-2); cursor: pointer; }
.keep input { accent-color: var(--primary); width: 16px; height: 16px; }
.kb { margin-left: auto; font-size: var(--text-xs); color: var(--text-3); display: inline-flex; gap: 6px; align-items: center; }
@media (pointer: coarse) { .kb { display: none; } .foot .btn { margin-left: auto; } }
</style>
