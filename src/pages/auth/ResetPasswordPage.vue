<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import PasswordField from '@/components/auth/PasswordField.vue'
import { useAuthStore } from '@/stores/auth'
import { checkPassword } from '@/utils/authValidation'

/** Opened from the reset email: the link signs the user in for recovery. */
const auth = useAuthStore()
const router = useRouter()
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref(null)
const touched = ref(false)

// Only a session created by the reset link may set a password without the old one.
const hasSession = computed(() => !!auth.user && auth.recovery)
const errors = computed(() => ({
  password: touched.value && !checkPassword(password.value).ok ? 'Use at least 6 characters.' : null,
  confirm: touched.value && confirm.value !== password.value ? 'Passwords don’t match.' : null,
}))

async function submit() {
  if (busy.value) return
  touched.value = true
  error.value = null
  if (errors.value.password || errors.value.confirm) return
  busy.value = true
  try {
    await auth.updatePassword(password.value)
    await router.replace({ name: 'today' })
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1 class="auth-title">Choose a new password</h1>
  <template v-if="hasSession">
    <p class="auth-sub">Pick something you haven’t used here before.</p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <PasswordField id="rp-password" v-model="password" label="New password" autocomplete="new-password" show-strength :error="errors.password" />
      <PasswordField id="rp-confirm" v-model="confirm" label="Confirm new password" autocomplete="new-password" :error="errors.confirm" />
      <p v-if="error" class="auth-alert" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save new password' }}</button>
    </form>
  </template>
  <template v-else>
    <p class="auth-alert" role="alert" style="margin-top: 16px">This reset link is invalid or has expired.</p>
    <p class="auth-foot"><RouterLink :to="{ name: 'forgot-password' }" class="auth-link">Request a new link</RouterLink></p>
  </template>
</template>
