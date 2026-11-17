<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { validateEmail } from '@/utils/authValidation'

const auth = useAuthStore()
const route = useRoute()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const busy = ref(false)
const error = ref(null)
const sent = ref(false)

async function submit() {
  if (busy.value) return
  error.value = validateEmail(email.value)
  if (error.value) return
  busy.value = true
  try {
    await auth.sendPasswordReset(email.value)
    // Same message whether or not the account exists (no account probing).
    sent.value = true
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1 class="auth-title">Reset your password</h1>
  <p class="auth-sub">Enter your email and we’ll send you a link to choose a new password.</p>
  <div v-if="sent" class="auth-form">
    <p class="auth-alert ok" role="status">If an account exists for {{ email.trim() }}, a reset link is on its way. It expires in one hour.</p>
  </div>
  <form v-else class="auth-form" novalidate @submit.prevent="submit">
    <div class="field">
      <label for="fp-email" class="field-label">Email</label>
      <input id="fp-email" v-model="email" class="input" type="email" autocomplete="email" inputmode="email" data-autofocus />
    </div>
    <p v-if="error" class="auth-alert" role="alert">{{ error }}</p>
    <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Sending…' : 'Send reset link' }}</button>
  </form>
  <p class="auth-foot"><RouterLink :to="{ name: 'login' }" class="auth-link">Back to sign in</RouterLink></p>
</template>
