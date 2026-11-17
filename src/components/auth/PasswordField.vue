<script setup>
import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { checkPassword } from '@/utils/authValidation'

/** Password input with show/hide and an optional strength meter. */
const props = defineProps({
  modelValue: { type: String, required: true },
  label: { type: String, required: true },
  autocomplete: { type: String, required: true },
  showStrength: { type: Boolean, default: false },
  error: { type: [String, null], default: null },
  id: { type: String, required: true },
})
defineEmits(['update:modelValue'])

const visible = ref(false)
const check = computed(() => checkPassword(props.modelValue))
</script>

<template>
  <div class="field">
    <label :for="id" class="field-label">{{ label }}</label>
    <div class="pw">
      <input
        :id="id"
        class="input"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        :autocomplete="autocomplete"
        :aria-invalid="!!error"
        :aria-describedby="showStrength ? `${id}-strength` : undefined"
        @input="$emit('update:modelValue', ($event.target).value)"
      />
      <button type="button" class="icon-btn sm eye" :aria-label="visible ? 'Hide password' : 'Show password'" @click="visible = !visible">
        <EyeOff v-if="visible" /><Eye v-else />
      </button>
    </div>
    <div v-if="showStrength && modelValue" :id="`${id}-strength`" class="strength" aria-live="polite">
      <div class="bars" aria-hidden="true">
        <span v-for="i in 4" :key="i" class="bar" :class="{ on: i <= Math.max(1, check.score) }" :data-score="check.score" />
      </div>
      <span class="s-label">{{ check.label }}</span>
      <span v-if="check.problems.length" class="s-hint">· {{ check.problems.join(', ') }}</span>
    </div>
    <p v-if="error" class="auth-err" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.pw { position: relative; }
.pw .input { padding-right: 44px; }
.eye { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); }
.strength { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--text-xs); color: var(--text-3); }
.bars { display: flex; gap: 4px; }
.bar { width: 28px; height: 4px; border-radius: 2px; background: var(--surface-sunken); }
.bar.on[data-score='0'], .bar.on[data-score='1'] { background: var(--rose); }
.bar.on[data-score='2'] { background: var(--yellow); }
.bar.on[data-score='3'], .bar.on[data-score='4'] { background: var(--green); }
.s-label { font-weight: var(--weight-semibold); color: var(--text-2); }
</style>
