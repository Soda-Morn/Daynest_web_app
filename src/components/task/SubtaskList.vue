<script setup lang="ts">
import { ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import type { Subtask } from '@/types/models'
import TaskCheck from '@/components/ui/TaskCheck.vue'
import { uid } from '@/utils/validation'

const props = defineProps<{ modelValue: Subtask[] }>()
const emit = defineEmits<{ 'update:modelValue': [Subtask[]] }>()
const draft = ref('')

function add() {
  const title = draft.value.trim()
  if (!title) return
  emit('update:modelValue', [...props.modelValue, { id: uid(), title, done: false }])
  draft.value = ''
}
function toggle(id: string) {
  emit('update:modelValue', props.modelValue.map((s) => (s.id === id ? { ...s, done: !s.done } : s)))
}
function rename(id: string, title: string) {
  const t = title.trim()
  if (!t) return remove(id)
  const cur = props.modelValue.find((s) => s.id === id)
  if (cur && cur.title !== t) emit('update:modelValue', props.modelValue.map((s) => (s.id === id ? { ...s, title: t } : s)))
}
function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter((s) => s.id !== id))
}
</script>

<template>
  <div class="subs">
    <div v-for="s in modelValue" :key="s.id" class="sub" :class="{ done: s.done }">
      <TaskCheck size="sm" :checked="s.done" priority="low" :label="`Complete ${s.title}`" @toggle="toggle(s.id)" />
      <input
        class="sub-input"
        :value="s.title"
        :aria-label="`Subtask: ${s.title}`"
        maxlength="200"
        @change="rename(s.id, ($event.target as HTMLInputElement).value)"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <button type="button" class="icon-btn sm del" :aria-label="`Remove ${s.title}`" @click="remove(s.id)"><X /></button>
    </div>
    <form class="add" @submit.prevent="add">
      <Plus class="plus" aria-hidden="true" />
      <input v-model="draft" class="sub-input" placeholder="Add subtask" aria-label="Add subtask" maxlength="200" />
    </form>
  </div>
</template>

<style scoped>
.subs { display: grid; gap: 2px; }
.sub, .add { display: flex; align-items: center; gap: var(--space-3); min-height: 36px; padding: 0 var(--space-2); border-radius: var(--radius-sm); }
.sub:hover { background: var(--surface-hover); }
.sub-input { flex: 1; min-width: 0; height: 32px; border: 0; background: transparent; outline: none; font-size: var(--text-base); }
.done .sub-input { color: var(--text-3); text-decoration: line-through; }
.del { opacity: 0; }
.sub:hover .del, .sub:focus-within .del { opacity: 1; }
@media (pointer: coarse) { .del { opacity: 0.6; } }
.plus { width: 15px; height: 15px; color: var(--text-3); margin: 0 1px; }
</style>
