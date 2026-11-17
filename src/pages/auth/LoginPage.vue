<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import PasswordField from '@/components/auth/PasswordField.vue'
import { useAuthStore } from '@/stores/auth'
import { validateEmail } from '@/utils/authValidation'

const auth = useAuthStore()
const route = useRoute()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')
const error = ref(null)
const busy = ref(false)
const unconfirmed = ref(false)
const notice = ref(
  route.query.confirmed
    ? 'Your email is confirmed. Sign in to start planning.'
    : route.query.reset
      ? 'Your password was changed. Sign in with the new one.'
      : null,
)

async function submit() {
  if (busy.value) return // no double submits
  error.value = validateEmail(email.value) ?? (password.value ? null : 'Enter your password.')
  if (error.value) return
  busy.value = true
  unconfirmed.value = false
  try {
    await auth.signIn(email.value, password.value)
    // The router guard / App watcher takes it from here.
  } catch (e) {
    error.value = e.message
    unconfirmed.value = !!e.unconfirmed
  } finally {
    busy.value = false
  }
}

async function resend() {
  try {
    await auth.resendConfirmation(email.value)
    notice.value = `We sent a new confirmation link to ${email.value.trim()}.`
    error.value = null
    unconfirmed.value = false
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <h1 class="auth-title">Welcome back</h1>
  <p class="auth-sub">Sign in to your Daynest account.</p>
  <form class="auth-form" novalidate @submit.prevent="submit">
    <p v-if="notice" class="auth-alert ok" role="status">{{ notice }}</p>
    <div class="field">
      <label for="login-email" class="field-label">Email</label>
      <input id="login-email" v-model="email" class="input" type="email" autocomplete="email" inputmode="email" required data-autofocus />
    </div>
    <PasswordField id="login-password" v-model="password" label="Password" autocomplete="current-password" />
    <div class="field-row">
      <span />
      <RouterLink :to="{ name: 'forgot-password', query: email ? { email } : {} }" class="auth-link">Forgot password?</RouterLink>
    </div>
    <p v-if="error" class="auth-alert" role="alert">
      {{ error }}
      <button v-if="unconfirmed" type="button" class="auth-link" @click="resend">Resend the link</button>
    </p>
    <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
  </form>
  <p class="auth-foot">New to Daynest? <RouterLink :to="{ name: 'register' }" class="auth-link">Create an account</RouterLink></p>
</template>
