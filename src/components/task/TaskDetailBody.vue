<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlignLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Clock,
  Copy,
  Ellipsis,
  Flag,
  FolderOpen,
  ListChecks,
  Palette,
  Repeat,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-vue-next'
import { PRIORITIES, REMINDER_OPTIONS, STATUSES } from '@/constants'
import Segmented from '@/components/ui/Segmented.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import TaskCheck from '@/components/ui/TaskCheck.vue'
import DateMenu from './DateMenu.vue'
import RecurrenceEditor from './RecurrenceEditor.vue'
import SubtaskList from './SubtaskList.vue'
import NotesEditor from './NotesEditor.vue'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { useTaskActions } from '@/composables/useTaskActions'
import { useToast } from '@/composables/useToast'
import { addDays, diffDays, formatDate, formatTime, relativeDayLabel } from '@/utils/date'
import { describeRecurrence } from '@/utils/recurrence'
import { isOverdue } from '@/utils/task'

/**
 * Task details content. Every field
 * saves on change — no "Save" button to forget. Recurring tasks get a scope
 * switch (this / following / all) that applies to edits made here.
 */
const ui = useUiStore()
const store = useTaskStore()
const collections = useCollectionsStore()
const actions = useTaskActions()
const toast = useToast()

const inst = computed(() => (ui.detailKey ? store.resolveInstance(ui.detailKey) : null))
const scope = ref('this')
const title = ref('')
const titleEl = ref(null)

// If the task disappears (deleted elsewhere, undo), close the panel.
watch(
  () => ui.detailKey,
  () => {
    scope.value = 'this'
  },
)
watch(
  inst,
  (i, prev) => {
    if (!i && ui.detailKey) ui.closeTask()
    if (!i) return
    if (!prev || prev.key !== i.key || document.activeElement !== titleEl.value) title.value = i.title
    void nextTick(autosize)
  },
  { immediate: true },
)

function autosize() {
  const el = titleEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const cal = computed(() => (inst.value ? collections.calendarById.get(inst.value.task.calendarId) : undefined))
const isRecurring = computed(() => !!inst.value?.occurrence)

/** Applies a patch with the current scope and keeps the panel on the right instance. */
function apply(patch, forceScope) {
  const i = inst.value
  if (!i) return
  const s = forceScope ?? (isRecurring.value ? scope.value : 'this')
  const before = new Set(store.byId.keys())
  const snap = store.updateInstance(i, patch, s)
  if (!i.occurrence) return
  // A "following" edit creates a new series: follow it.
  const created = [...snap.keys()].find((id) => !before.has(id))
  let key = i.key
  if (created) {
    const t = store.get(created)
    key = `${created}@${t.startDate}`
    scope.value = 'all'
  } else if (s === 'all' && patch.startDate && i.startDate) {
    key = `${i.task.id}@${addDays(i.occurrence, diffDays(i.startDate, patch.startDate))}`
  }
  if (key !== ui.detailKey) ui.detailKey = key
}

function saveTitle() {
  const t = title.value.replace(/\s+/g, ' ').trim()
  if (!inst.value) return
  if (!t) {
    title.value = inst.value.title
    toast.show('A task needs a title')
    return
  }
  if (t !== inst.value.title) apply({ title: t })
}

/**
 * Saves notes for the task they were typed in. The editor may flush after the
 * panel already switched task or closed, so the key decides the target.
 */
function saveDescription(text, key) {
  if (key === ui.detailKey && inst.value) {
    if (text !== inst.value.description) apply({ description: text })
    return
  }
  const target = store.resolveInstance(key)
  if (target && target.description !== text) store.updateInstance(target, { description: text }, 'this')
}

function setDate(d) {
  const i = inst.value
  if (!i) return
  if (d === null) {
    if (i.occurrence) return toast.show('Recurring tasks need a date')
    apply({ startDate: null, dueDate: null, startTime: null, endTime: null, recurrence: null })
    return
  }
  apply({ startDate: d })
}

function setEndDate(d) {
  const i = inst.value
  if (!i?.startDate) return
  if (!d || d < i.startDate) apply({ dueDate: i.startDate })
  else apply({ dueDate: d })
}

function setTime(which, v) {
  const i = inst.value
  if (!i) return
  const val = v || null
  if (which === 'startTime' && !val) return apply({ startTime: null, endTime: null })
  if (which === 'startTime' && val && !i.endTime) return apply({ startTime: val })
  apply({ [which]: val })
}

function setStatus(s) {
  apply({ status: s }, 'this')
}

function addReminder(mins) {
  const i = inst.value
  if (!i || mins === '') return
  apply({ reminders: [...new Set([...i.task.reminders, +mins])] }, 'all')
}

const reminderLabel = (m) => REMINDER_OPTIONS.find((o) => o.value === m)?.label ?? `${m} min before`

const created = computed(() =>
  inst.value ? new Date(inst.value.task.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '',
)
const updated = computed(() =>
  inst.value ? new Date(inst.value.task.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '',
)

/* ---- Clean layout: title, subtasks and notes up front; the rest folds away ---- */
const settings = useSettingsStore()
const DETAILS_KEY = 'daynest:detail-expanded'
const readExpanded = () => {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1'
  } catch {
    return false
  }
}
const showDetails = ref(readExpanded())
function toggleDetails(force) {
  showDetails.value = typeof force === 'boolean' ? force : !showDetails.value
  try {
    localStorage.setItem(DETAILS_KEY, showDetails.value ? '1' : '0')
  } catch {
    /* private mode: just don't remember it */
  }
}

/** Header date chip, e.g. "Nov 18, Today · 12pm – 1pm". */
const dateLabel = computed(() => {
  const i = inst.value
  if (!i?.startDate) return 'No date'
  const rel = relativeDayLabel(i.startDate, ui.today)
  const abs = formatDate(i.startDate, { month: 'short', day: 'numeric' })
  return rel === abs ? abs : `${abs}, ${rel}`
})
const timeLabel = computed(() => {
  const i = inst.value
  if (!i?.startTime) return ''
  const f = settings.settings.timeFormat
  return i.endTime ? `${formatTime(i.startTime, f)} – ${formatTime(i.endTime, f)}` : formatTime(i.startTime, f)
})

/** Read-only summary of the folded fields; tapping it opens them. Only shows what is set. */
const summary = computed(() => {
  const i = inst.value
  if (!i) return []
  const out = []
  if (i.task.recurrence) out.push({ key: 'repeat', icon: Repeat, text: describeRecurrence(i.task.recurrence, i.startDate) })
  if (i.priority !== 'medium') out.push({ key: 'prio', icon: Flag, text: PRIORITIES.find((p) => p.value === i.priority)?.label, cls: `p-${i.priority}` })
  if (i.status !== 'todo' && i.status !== 'completed') out.push({ key: 'status', icon: CircleDot, text: STATUSES.find((s) => s.value === i.status)?.label })
  const list = i.task.listId ? collections.listById.get(i.task.listId) : null
  if (list) out.push({ key: 'list', icon: FolderOpen, text: list.name })
  if (i.startTime && i.task.reminders.length) out.push({ key: 'rem', icon: Bell, text: i.task.reminders.length === 1 ? reminderLabel(i.task.reminders[0]) : `${i.task.reminders.length} reminders` })
  return out
})
const subtaskProgress = computed(() => {
  const s = inst.value?.subtasks ?? []
  return s.length ? `${s.filter((x) => x.done).length}/${s.length}` : ''
})

const scopeOptions = [
  { value: 'this', label: 'This' },
  { value: 'future', label: 'Following' },
  { value: 'all', label: 'All' },
]

function close() {
  ui.closeTask()
}

function onPanelKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}
</script>

<template>
  <div v-if="inst" class="detail" @keydown="onPanelKey">
        <header class="head">
          <TaskCheck :checked="inst.status === 'completed'" :priority="inst.priority" :label="`Complete ${inst.title}`" @toggle="actions.toggleComplete(inst)" />
          <span class="head-sep" aria-hidden="true" />
          <DateMenu :model-value="inst.startDate" :allow-clear="!inst.occurrence" @pick="setDate">
            <template #default="{ toggle }">
              <button type="button" class="date-chip" :class="{ late: isOverdue(inst, ui.today), empty: !inst.startDate }" aria-label="Change date" @click="toggle">
                <CalendarDays />
                <span>{{ dateLabel }}</span>
                <span v-if="timeLabel" class="date-time">{{ timeLabel }}</span>
              </button>
            </template>
          </DateMenu>
          <span class="spacer" />
          <Dropdown placement="bottom-end" :width="190" label="Task actions">
            <template #trigger="{ toggle }">
              <button type="button" class="icon-btn sm" aria-label="More actions" title="More" @click="toggle"><Ellipsis /></button>
            </template>
            <template #default="{ close: closeMenu }">
              <button type="button" role="menuitem" class="menu-item" @click="toggleDetails(true); closeMenu()"><SlidersHorizontal />Show details</button>
              <button type="button" role="menuitem" class="menu-item" @click="actions.duplicate(inst); closeMenu()"><Copy />Duplicate</button>
              <button type="button" role="menuitem" class="menu-item danger" @click="closeMenu(); actions.remove(inst)"><Trash2 />Delete</button>
            </template>
          </Dropdown>
          <button type="button" class="icon-btn sm" aria-label="Close details" title="Close" @click="close"><X /></button>
        </header>

        <div class="scroll">
          <textarea
            ref="titleEl"
            v-model="title"
            class="title"
            :class="{ done: inst.status === 'completed' }"
            rows="1"
            maxlength="200"
            aria-label="Title"
            autocomplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            @input="autosize"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target).blur()"
          />

          <div v-if="isRecurring" class="scope">
            <Repeat class="ico" />
            <span>Edits apply to</span>
            <Segmented v-model="scope" :options="scopeOptions" label="Apply edits to" />
          </div>

          <!-- Calendar + whatever else is set, at a glance. Tap to edit. -->
          <button type="button" class="meta" :aria-expanded="showDetails" aria-controls="task-props" @click="toggleDetails()">
            <span class="meta-chip"><span class="dot" :style="{ '--c': cal?.color }" />{{ cal?.name }}</span>
            <span v-for="s in summary" :key="s.key" class="meta-chip" :class="s.cls"><component :is="s.icon" />{{ s.text }}</span>
            <span class="meta-more">{{ showDetails ? 'Less' : 'Details' }}<ChevronDown :class="{ up: showDetails }" /></span>
          </button>

          <dl v-show="showDetails" id="task-props" class="props">
            <div class="prop">
              <dt><CalendarDays class="ico" />Date</dt>
              <dd class="row">
                <DateMenu :model-value="inst.startDate" :allow-clear="!inst.occurrence" @pick="setDate">
                  <template #default="{ toggle }">
                    <button type="button" class="val" :class="{ late: isOverdue(inst, ui.today), empty: !inst.startDate }" @click="toggle">
                      {{ inst.startDate ? formatDate(inst.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: inst.startDate.slice(0, 4) !== ui.today.slice(0, 4) ? 'numeric' : undefined }) : 'No date' }}
                    </button>
                  </template>
                </DateMenu>
                <template v-if="inst.startDate">
                  <span class="to">→</span>
                  <DateMenu :model-value="inst.dueDate" :allow-clear="false" @pick="setEndDate">
                    <template #default="{ toggle }">
                      <button type="button" class="val" :class="{ empty: inst.dueDate === inst.startDate }" aria-label="End date" @click="toggle">
                        {{ inst.dueDate && inst.dueDate !== inst.startDate ? formatDate(inst.dueDate, { month: 'short', day: 'numeric' }) : 'End date' }}
                      </button>
                    </template>
                  </DateMenu>
                </template>
                <span v-if="inst.startDate" class="rel">{{ relativeDayLabel(inst.startDate, ui.today) }}</span>
              </dd>
            </div>

            <div v-if="inst.startDate" class="prop">
              <dt><Clock class="ico" />Time</dt>
              <dd class="row">
                <input class="input time" type="time" :value="inst.startTime ?? ''" aria-label="Start time" @change="setTime('startTime', ($event.target).value)" />
                <span class="to">–</span>
                <input class="input time" type="time" :value="inst.endTime ?? ''" :disabled="!inst.startTime" aria-label="End time" @change="setTime('endTime', ($event.target).value)" />
                <button v-if="inst.startTime" type="button" class="btn btn-ghost btn-sm" @click="apply({ startTime: null, endTime: null })">All day</button>
              </dd>
            </div>

            <div class="prop">
              <dt><Repeat class="ico" />Repeat</dt>
              <dd>
                <RecurrenceEditor :model-value="inst.task.recurrence" :start="inst.startDate" @update:model-value="(r) => apply({ recurrence: r }, 'all')" />
              </dd>
            </div>

            <div class="prop">
              <dt><Flag class="ico" />Priority</dt>
              <dd>
                <div class="prio" role="radiogroup" aria-label="Priority">
                  <button
                    v-for="p in PRIORITIES"
                    :key="p.value"
                    type="button"
                    role="radio"
                    class="prio-btn"
                    :class="`p-${p.value}`"
                    :aria-checked="inst.priority === p.value"
                    @click="apply({ priority: p.value })"
                  >
                    <Flag />{{ p.label }}
                  </button>
                </div>
              </dd>
            </div>

            <div class="prop">
              <dt><CircleDot class="ico" />Status</dt>
              <dd>
                <select class="select" :value="inst.status" aria-label="Status" @change="setStatus(($event.target).value)">
                  <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </dd>
            </div>

            <div class="prop">
              <dt><Palette class="ico" />Calendar</dt>
              <dd>
                <select class="select" :value="inst.task.calendarId" aria-label="Calendar" @change="apply({ calendarId: ($event.target).value }, 'all')">
                  <option v-for="c in collections.sortedCalendars" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </dd>
            </div>

            <div class="prop">
              <dt><FolderOpen class="ico" />List</dt>
              <dd>
                <select class="select" :value="inst.task.listId ?? ''" aria-label="List" @change="apply({ listId: ($event.target).value || null }, 'all')">
                  <option value="">No list</option>
                  <option v-for="l in collections.sortedLists" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
              </dd>
            </div>

            <div v-if="inst.startTime" class="prop">
              <dt><Bell class="ico" />Remind</dt>
              <dd class="rem">
                <span v-for="m in inst.task.reminders" :key="m" class="chip">
                  {{ reminderLabel(m) }}
                  <button type="button" class="x" :aria-label="`Remove reminder ${reminderLabel(m)}`" @click="apply({ reminders: inst.task.reminders.filter((x) => x !== m) }, 'all')"><X /></button>
                </span>
                <select class="select add-rem" value="" aria-label="Add reminder" @change="addReminder(($event.target).value); ($event.target).value = ''">
                  <option value="" disabled>Add reminder…</option>
                  <option v-for="o in REMINDER_OPTIONS.filter((o) => !inst.task.reminders.includes(o.value))" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </dd>
            </div>
          </dl>

          <section class="block">
            <h3 class="section-title"><ListChecks class="ico" />Subtasks<span v-if="subtaskProgress" class="sub-count">{{ subtaskProgress }}</span></h3>
            <SubtaskList :model-value="inst.subtasks" @update:model-value="(s) => apply({ subtasks: s })" />
          </section>

          <section class="block">
            <h3 class="section-title"><AlignLeft class="ico" />Notes</h3>
            <NotesEditor :model-value="inst.description" :task-key="inst.key" @save="saveDescription" />
          </section>

          <p v-if="showDetails" class="stamps">Created {{ created }} · Updated {{ updated }}</p>
        </div>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.head {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border);
}
.head-sep { width: 1px; height: 18px; background: var(--border-strong); margin: 0 2px; }
.date-chip {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 30px; padding: 0 8px;
  border: 0; border-radius: var(--radius-sm); background: none;
  color: var(--primary-text); font-size: var(--text-sm); font-weight: var(--weight-medium); white-space: nowrap;
}
.date-chip:hover { background: var(--surface-hover); }
.date-chip svg { width: 16px; height: 16px; flex-shrink: 0; }
.date-chip.late { color: var(--overdue); }
.date-chip.empty { color: var(--text-3); font-weight: var(--weight-regular); }
.date-time { color: var(--text-3); font-weight: var(--weight-regular); overflow: hidden; text-overflow: ellipsis; }
.spacer { flex: 1; }

/* Summary line under the title */
.meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 100%;
  margin: 0 0 var(--space-2); padding: 4px 0; border: 0; background: none; text-align: left;
}
.meta-chip {
  display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px;
  border-radius: var(--radius-full); background: var(--surface-sunken);
  font-size: var(--text-xs); color: var(--text-2); white-space: nowrap;
}
.meta-chip svg { width: 12px; height: 12px; }
.meta-chip .dot { width: 7px; height: 7px; }
.meta-chip.p-low svg, .meta-chip.p-medium svg, .meta-chip.p-high svg, .meta-chip.p-urgent svg { color: var(--pc); fill: var(--pc); }
.meta-more { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; font-size: var(--text-xs); color: var(--text-3); }
.meta:hover .meta-more { color: var(--text); }
.meta-more svg { width: 14px; height: 14px; transition: transform var(--dur-fast) var(--ease); }
.meta-more svg.up { transform: rotate(180deg); }
.props { padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
.sub-count { margin-left: auto; font-size: var(--text-xs); color: var(--text-3); font-weight: var(--weight-regular); letter-spacing: 0; text-transform: none; }
.scroll { flex: 1; overflow-x: hidden; overflow-y: auto; padding: var(--space-2) var(--space-5) var(--space-6); overscroll-behavior: contain; }
.detail, .scroll { min-width: 0; }
.title {
  width: 100%;
  border: 0;
  padding: var(--space-2) 0;
  margin-bottom: var(--space-2);
  background: transparent;
  resize: none;
  overflow: hidden;
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.01em;
  line-height: 1.3;
  outline: none;
}
.title.done { color: var(--text-3); text-decoration: line-through; }
.scope {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3);
  border-radius: var(--radius); background: var(--primary-soft); color: var(--primary-text); font-size: var(--text-sm);
}
.scope span { flex: 1; }
.props { margin: 0; display: grid; gap: 2px; }
.prop { display: grid; grid-template-columns: 104px 1fr; align-items: start; gap: var(--space-2); padding: 6px 0; }
dt { display: flex; align-items: center; gap: var(--space-2); height: 36px; color: var(--text-3); font-size: var(--text-sm); }
dd { margin: 0; min-width: 0; }
.ico { width: 15px; height: 15px; flex-shrink: 0; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 36px; }
.val {
  height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); font-size: var(--text-base); font-weight: var(--weight-medium);
}
.val:hover { border-color: var(--border-strong); background: var(--surface-hover); }
.val.empty { color: var(--text-3); font-weight: var(--weight-regular); }
.val.late { color: var(--overdue); }
.to { color: var(--text-3); }
.rel { font-size: var(--text-xs); color: var(--text-3); }
.time { width: 136px; height: 34px; }
.prio { display: flex; gap: 4px; flex-wrap: wrap; }
.prio-btn {
  display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface);
  font-size: var(--text-sm); color: var(--text-2);
}
.prio-btn svg { width: 13px; height: 13px; color: var(--pc); }
.prio-btn[aria-checked='true'] { border-color: var(--pc); background: color-mix(in srgb, var(--pc) 12%, var(--surface)); color: var(--text); font-weight: var(--weight-medium); }
.prio-btn[aria-checked='true'] svg { fill: var(--pc); }
.p-low { --pc: var(--prio-low); }
.p-medium { --pc: var(--prio-medium); }
.p-high { --pc: var(--prio-high); }
.p-urgent { --pc: var(--prio-urgent); }
.rem { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.rem .chip { padding-right: 4px; }
.x { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: none; color: var(--text-3); }
.x:hover { background: var(--surface-hover); color: var(--text); }
.x svg { width: 12px; height: 12px; }
.add-rem { width: auto; flex: 1; min-width: 160px; }
/* minmax(0, 1fr): a wide child (the notes toolbar on phones) scrolls inside
   its own box instead of stretching the panel past the screen edge. */
.block { margin-top: var(--space-4); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }

/* Phones: roomier tap targets, title a touch smaller. */
@media (pointer: coarse) {
  .date-chip { height: 36px; }
  .meta-chip { height: 28px; font-size: var(--text-sm); }
}
@media (max-width: 767px) {
  .head { padding-left: var(--space-4); }
  .scroll { padding: var(--space-2) var(--space-4) var(--space-6); }
  .title { font-size: var(--text-lg); }
  .prop { grid-template-columns: 92px 1fr; }
  .time { width: 120px; }
}
.block .section-title { display: flex; align-items: center; gap: 6px; }
.stamps { margin-top: var(--space-5); font-size: var(--text-xs); color: var(--text-3); }

</style>
