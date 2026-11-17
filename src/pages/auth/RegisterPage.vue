<script setup>
import { computed, ref } from 'vue'
import { MailCheck } from 'lucide-vue-next'
import PasswordField from '@/components/auth/PasswordField.vue'
import { useAuthStore } from '@/stores/auth'
import { checkPassword, validateEmail } from '@/utils/authValidation'

const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref(null)
const sentTo = ref(null)
const touched = ref(false)

const errors = computed(() => ({
  name: name.value.trim().length > 80 ? 'Use 80 characters or fewer.' : null,
  email: touched.value ? validateEmail(email.value) : null,
  password: touched.value && !checkPassword(password.value).ok ? 'Use at least 6 characters.' : null,
  confirm: touched.value && confirm.value !== password.value ? 'Passwords don’t match.' : null,
}))

async function submit() {
  if (busy.value) return
  touched.value = true
  error.value = null
  if (Object.values(errors.value).some(Boolean)) return
  busy.value = true
  try {
    const { needsConfirmation } = await auth.signUp(email.value, password.value, name.value)
    if (needsConfirmation) sentTo.value = email.value.trim()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function resend() {
  if (!sentTo.value) return
  try {
    await auth.resendConfirmation(sentTo.value)
    error.value = null
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <template v-if="sentTo">
    <div class="sent">
      <span class="sent-ic"><MailCheck /></span>
      <h1 class="auth-title">Check your email</h1>
      <p class="auth-sub">
        We sent a confirmation link to <strong>{{ sentTo }}</strong>. Open it to activate your account, then sign in.
      </p>
      <p v-if="error" class="auth-alert" role="alert">{{ error }}</p>
      <p class="auth-foot">
        Didn’t get it? <button type="button" class="auth-link" @click="resend">Send it again</button> ·
        <RouterLink :to="{ name: 'login', query: { email: sentTo } }" class="auth-link">Back to sign in</RouterLink>
      </p>
    </div>
  </template>
  <template v-else>
    <h1 class="auth-title">Create your account</h1>
    <p class="auth-sub">Make room for what matters.</p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <div class="field">
        <label for="reg-name" class="field-label">Your name</label>
        <input id="reg-name" v-model="name" class="input" autocomplete="name" maxlength="80" data-autofocus />
        <p v-if="errors.name" class="auth-err">{{ errors.name }}</p>
      </div>
      <div class="field">
        <label for="reg-email" class="field-label">Email</label>
        <input id="reg-email" v-model="email" class="input" type="email" autocomplete="email" inputmode="email" required :aria-invalid="!!errors.email" />
        <p v-if="errors.email" class="auth-err" role="alert">{{ errors.email }}</p>
      </div>
      <PasswordField id="reg-password" v-model="password" label="Password" autocomplete="new-password" show-strength :error="errors.password" />
      <PasswordField id="reg-confirm" v-model="confirm" label="Confirm password" autocomplete="new-password" :error="errors.confirm" />
      <p v-if="error" class="auth-alert" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Creating account…' : 'Create account' }}</button>
    </form>
    <p class="auth-foot">Already have an account? <RouterLink :to="{ name: 'login' }" class="auth-link">Sign in</RouterLink></p>
  </template>
</template>

<style scoped>
.sent { display: grid; gap: var(--space-2); text-align: center; justify-items: center; }
.sent-ic { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: var(--primary-soft); color: var(--primary-text); margin-bottom: var(--space-2); }
.sent-ic svg { width: 24px; height: 24px; }
</style>
