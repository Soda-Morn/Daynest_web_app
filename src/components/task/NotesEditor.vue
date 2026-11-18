<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bold, Code, Heading2, Italic, Link, List, ListOrdered, ListTodo, PencilLine, Strikethrough, TextQuote } from 'lucide-vue-next'
import { continueList, insertLink, parseNotes, toggleCheckLine, toggleLinePrefix, toggleWrap } from '@/utils/notes'
import { persistence } from '@/services/persistence'

/**
 * Task notes with light formatting. Shows the formatted notes; tap to edit
 * as plain text with a formatting toolbar (marks are Markdown-style, so the
 * stored value stays plain text). Saves while typing (debounced), when
 * editing ends, and before the panel closes or switches task.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  /** Instance key the notes belong to; passed back with every save. */
  taskKey: { type: String, required: true },
})
const emit = defineEmits(['save'])

const SAVE_DELAY = 800
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

const root = ref(null)
const ta = ref(null)
const editing = ref(false)
const draft = ref(props.modelValue)
/**
 * The stored notes this editor last saw or saved. Only text that differs
 * from it is the user's own typing — an editor left open (e.g. on a desktop
 * overnight) must never write its old text over notes saved meanwhile on
 * another device.
 */
let lastSaved = props.modelValue
let timer = null

/* ---------------- Saving ---------------- */

const hasUnsaved = () => draft.value !== lastSaved

function save(key = props.taskKey) {
  clearTimeout(timer)
  timer = null
  if (!hasUnsaved()) return
  lastSaved = draft.value
  emit('save', draft.value, key)
}

watch(draft, () => {
  if (!editing.value) return
  clearTimeout(timer)
  timer = setTimeout(save, SAVE_DELAY)
})

// Stored notes changed (other device, other window, undo): show them —
// even mid-edit, as long as nothing new was typed here.
watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value || !hasUnsaved()) draft.value = v
    lastSaved = v
  },
)

// Switching to another task: save what was typed for the previous one first.
watch(
  () => props.taskKey,
  (_key, oldKey) => {
    save(oldKey)
    editing.value = false
    draft.value = props.modelValue
    lastSaved = props.modelValue
  },
)

/**
 * Phones freeze a page moments after it goes to the background, before the
 * debounce fires. Save right away when the app is hidden or closed, and
 * write it to the device at once.
 */
function saveNow() {
  if (!hasUnsaved()) return
  save()
  void persistence.flush()
}
const onVisibility = () => document.visibilityState === 'hidden' && saveNow()
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', saveNow)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', saveNow)
  save()
})

/* ---------------- Edit mode ---------------- */

async function startEdit() {
  if (editing.value) return
  draft.value = props.modelValue
  lastSaved = props.modelValue
  editing.value = true
  await nextTick()
  const el = ta.value
  if (!el) return
  autosize()
  el.focus({ preventScroll: true })
  el.setSelectionRange(el.value.length, el.value.length)
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function finish() {
  if (!editing.value) return
  draft.value = draft.value.replace(/\s+$/, '')
  editing.value = false
  save()
}

/**
 * Leaving the editor (not just moving to its toolbar) ends editing.
 * Checked a moment later: when editing starts, the clicked "Add notes" /
 * view element is removed while focused, and browsers report that as a
 * focus-out with no destination — which must not close the editor again.
 */
function onFocusOut() {
  if (!editing.value) return
  setTimeout(() => {
    if (editing.value && !root.value?.contains(document.activeElement)) finish()
  })
}

function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

/**
 * Applies a helper's edit through the browser's own text insertion, so
 * Ctrl+Z / shake-to-undo still work; falls back to setRangeText.
 */
function run(fn) {
  const el = ta.value
  if (!el) return false
  const r = fn(el.value, el.selectionStart, el.selectionEnd)
  if (!r) return false
  el.focus({ preventScroll: true })
  el.setSelectionRange(r.from, r.to)
  let ok
  try {
    ok = document.execCommand('insertText', false, r.insert)
  } catch {
    ok = false
  }
  if (!ok || el.value.slice(r.from, r.from + r.insert.length) !== r.insert) {
    el.setRangeText(r.insert, r.from, r.to, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.setSelectionRange(r.selStart, r.selEnd)
  autosize()
  return true
}

const wrap = (mark) => run((t, s, e) => toggleWrap(t, s, e, mark))
const line = (kind) => run((t, s, e) => toggleLinePrefix(t, s, e, kind))

const tools = [
  { key: 'b', label: 'Bold', icon: Bold, hint: `${mod}B`, act: () => wrap('**') },
  { key: 'i', label: 'Italic', icon: Italic, hint: `${mod}I`, act: () => wrap('*') },
  { key: 's', label: 'Strikethrough', icon: Strikethrough, hint: `${mod}Shift+X`, act: () => wrap('~~') },
  { key: 'h', label: 'Heading', icon: Heading2, act: () => line('heading'), sep: true },
  { key: 'ul', label: 'Bulleted list', icon: List, act: () => line('bullet') },
  { key: 'ol', label: 'Numbered list', icon: ListOrdered, act: () => line('number') },
  { key: 'ck', label: 'Checklist', icon: ListTodo, act: () => line('check') },
  { key: 'q', label: 'Quote', icon: TextQuote, act: () => line('quote'), sep: true },
  { key: 'c', label: 'Code', icon: Code, hint: `${mod}E`, act: () => wrap('`') },
  { key: 'a', label: 'Link', icon: Link, hint: `${mod}K`, act: () => run(insertLink) },
]

function onKeydown(e) {
  const k = e.key.toLowerCase()
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation() // finish editing; don't close the whole panel
    finish()
    ta.value?.blur()
    return
  }
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    const shortcut = { b: () => wrap('**'), i: () => wrap('*'), e: () => wrap('`'), k: () => run(insertLink) }[k]
    if (shortcut && !e.shiftKey) {
      e.preventDefault()
      shortcut()
    } else if (k === 'x' && e.shiftKey) {
      e.preventDefault()
      wrap('~~')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      finish()
      ta.value?.blur()
    }
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    if (run((t, s, end) => (s === end ? continueList(t, s) : null))) e.preventDefault()
  }
}

/* ---------------- Formatted view ---------------- */

const blocks = computed(() => parseNotes(draft.value))
const isEmpty = computed(() => !draft.value.trim())

function toggleCheck(lineIndex) {
  draft.value = toggleCheckLine(draft.value, lineIndex)
  save()
}

const flat = (nodes) => nodes.map((n) => (n.children ? flat(n.children) : n.text)).join('')

function inline(nodes) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'b':
        return h('strong', inline(n.children))
      case 'i':
        return h('em', inline(n.children))
      case 's':
        return h('s', inline(n.children))
      case 'code':
        return h('code', n.text)
      case 'a':
        // Only http(s) URLs reach here (enforced by the parser).
        return h('a', { href: n.href, target: '_blank', rel: 'noopener noreferrer' }, inline(n.children))
      default:
        return n.text
    }
  })
}

const withBreaks = (lines) => lines.flatMap((l, i) => (i ? [h('br'), ...inline(l)] : inline(l)))

function renderBlock(b) {
  switch (b.t) {
    case 'h':
      return h('h4', inline(b.children))
    case 'p':
      return h('p', withBreaks(b.lines))
    case 'quote':
      return h('blockquote', withBreaks(b.lines))
    case 'ul':
      return h('ul', b.items.map((it) => h('li', inline(it.children))))
    case 'ol':
      return h('ol', { start: b.start }, b.items.map((it) => h('li', inline(it.children))))
    case 'check':
      return h(
        'ul',
        { class: 'checklist' },
        b.items.map((it) =>
          h('li', { class: { done: it.done } }, [
            h('input', {
              type: 'checkbox',
              class: 'ck',
              checked: it.done,
              'aria-label': flat(it.children) || 'Checklist item',
              onClick: (e) => e.stopPropagation(),
              onChange: () => toggleCheck(it.line),
            }),
            h('span', inline(it.children)),
          ]),
        ),
      )
  }
}

const Rendered = () => blocks.value.map(renderBlock)

function onViewClick(e) {
  if (e.target.closest('a, input')) return
  // Selecting text to copy shouldn't switch to editing.
  if (String(window.getSelection?.() ?? '').length) return
  void startEdit()
}

function onViewKey(e) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    void startEdit()
  }
}
</script>

<template>
  <div ref="root" class="notes" :class="{ editing }" @focusout="onFocusOut">
    <template v-if="editing">
      <div class="toolbar" role="toolbar" aria-label="Formatting">
        <template v-for="t in tools" :key="t.key">
          <span v-if="t.sep" class="sep" aria-hidden="true" />
          <!-- mousedown.prevent keeps the caret (and the phone keyboard) in the text box -->
          <button
            type="button"
            class="tool"
            :aria-label="t.label"
            :title="t.hint ? `${t.label} (${t.hint})` : t.label"
            @mousedown.prevent
            @click="t.act()"
          >
            <component :is="t.icon" />
          </button>
        </template>
      </div>
      <textarea
        ref="ta"
        v-model="draft"
        class="editor"
        placeholder="Write notes… use the toolbar for bold, lists and more"
        aria-label="Notes"
        maxlength="10000"
        autocomplete="off"
        autocapitalize="sentences"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        @input="autosize"
        @keydown="onKeydown"
      />
      <div class="foot">
        <span class="tip"><b>**bold**</b> <i>*italic*</i> <span>- list</span> <span>- [ ] to-do</span></span>
        <button type="button" class="btn btn-sm btn-primary done" @mousedown.prevent @click="finish(); ta?.blur()">Done</button>
      </div>
    </template>

    <button v-else-if="isEmpty" type="button" class="empty" @click="startEdit">
      <PencilLine />
      Add notes, links or a checklist…
    </button>

    <div
      v-else
      class="view"
      role="button"
      tabindex="0"
      aria-label="Notes — press Enter to edit"
      @click="onViewClick"
      @keydown="onViewKey"
    >
      <Rendered />
      <PencilLine class="edit-ic" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.notes { position: relative; min-width: 0; max-width: 100%; }

/* ---------- Editing ---------- */
.notes.editing {
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--surface-2);
  overflow-x: auto;
  scrollbar-width: none;
}
.toolbar::-webkit-scrollbar { display: none; }
.tool {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--text-2);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.tool svg { width: 17px; height: 17px; }
.tool:hover { background: var(--surface-hover); color: var(--text); }
.tool:active { background: var(--primary-soft); color: var(--primary-text); }
.sep { flex-shrink: 0; width: 1px; height: 20px; margin: 0 4px; background: var(--border); }
.editor {
  display: block;
  width: 100%;
  min-height: 140px;
  padding: var(--space-3);
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--text-base);
  line-height: var(--leading);
  resize: none;
  overflow: hidden;
  outline: none;
}
.editor::placeholder { color: var(--text-3); }
.foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 6px 6px var(--space-3);
}
.tip { flex: 1; display: flex; gap: 10px; flex-wrap: wrap; font-size: var(--text-xs); color: var(--text-3); }
.tip b, .tip i { font-weight: inherit; font-style: inherit; }
.done { margin-left: auto; }

/* ---------- Empty ---------- */
.empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 52px;
  padding: var(--space-3);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: none;
  color: var(--text-3);
  font-size: var(--text-base);
  text-align: left;
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.empty svg { width: 16px; height: 16px; flex-shrink: 0; }
.empty:hover { border-color: var(--primary); background: var(--surface-hover); color: var(--text-2); }

/* ---------- Formatted view ---------- */
.view {
  position: relative;
  padding: var(--space-3) var(--space-8) var(--space-3) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-base);
  line-height: var(--leading);
  overflow-wrap: anywhere;
  cursor: text;
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.view:hover { border-color: var(--border-strong); }
.view:focus-visible { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
.edit-ic {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 15px;
  height: 15px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease);
}
.view:hover .edit-ic, .view:focus-visible .edit-ic { opacity: 1; }
@media (pointer: coarse) {
  .edit-ic { opacity: 0.6; }
  .tool { width: 40px; height: 40px; }
  .editor { font-size: 16px; } /* prevents iOS zoom on focus */
}

.view :deep(:is(p, h4, ul, ol, blockquote)) { margin: 0; }
.view :deep(:is(p, h4, ul, ol, blockquote) + :is(p, h4, ul, ol, blockquote)) { margin-top: var(--space-2); }
.view :deep(h4) { font-size: var(--text-md); font-weight: var(--weight-bold); line-height: var(--leading-tight); margin-top: var(--space-3); }
.view :deep(h4:first-child) { margin-top: 0; }
.view :deep(strong) { font-weight: var(--weight-bold); }
.view :deep(em) { font-style: italic; }
.view :deep(s) { color: var(--text-3); }
.view :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-sunken);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.view :deep(a) {
  color: var(--primary-text);
  font-weight: var(--weight-medium);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--primary) 40%, transparent);
  text-underline-offset: 2px;
}
.view :deep(a:hover) { text-decoration-color: currentColor; }
.view :deep(ul), .view :deep(ol) { margin: 0; padding-left: 1.35em; }
.view :deep(li + li) { margin-top: 2px; }
.view :deep(li::marker) { color: var(--text-3); }
.view :deep(blockquote) {
  margin: 0;
  padding: 2px 0 2px var(--space-3);
  border-left: 3px solid var(--border-strong);
  color: var(--text-2);
}
.view :deep(.checklist) { list-style: none; padding-left: 0; }
.view :deep(.checklist li) { display: flex; align-items: flex-start; gap: var(--space-2); }
.view :deep(.checklist li.done span) { color: var(--text-3); text-decoration: line-through; }
.view :deep(.ck) {
  appearance: none;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  margin: 3px 0 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.view :deep(.ck:hover) { border-color: var(--primary); }
.view :deep(.ck:checked) { border-color: var(--primary); background: var(--primary); }
.view :deep(.ck:checked::after) {
  content: '';
  width: 9px;
  height: 5px;
  margin-top: -2px;
  border: 2px solid var(--primary-contrast);
  border-top: 0;
  border-right: 0;
  transform: rotate(-45deg);
}
.view :deep(.ck:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (pointer: coarse) {
  /* Bigger tap target for checklist boxes on phones. */
  .view :deep(.ck) { width: 20px; height: 20px; margin-top: 1px; }
}
</style>
