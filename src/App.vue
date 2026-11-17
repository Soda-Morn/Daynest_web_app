<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RotateCcw } from 'lucide-vue-next'
import AppShell from '@/layouts/AppShell.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import DaynestLogo from '@/components/brand/DaynestLogo.vue'
import { APP_TAGLINE } from '@/constants/brand'
import { useBootstrap } from '@/composables/useBootstrap'
import { useAuthStore } from '@/stores/auth'
import { cloudEnabled } from '@/services/supabase'

const { status, error, load, unload, loadedFor } = useBootstrap()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/** Sign-in pages render without the app shell. */
const authPage = computed(() => !!route.meta.auth)

onMounted(async () => {
  if (!cloudEnabled) return load()
  await auth.init()
})

// Cloud mode: load the signed-in user's workspace; wipe it on sign-out or
// when a different user signs in. Runs one change at a time, always acting on
// the latest state, so quick sign-in/sign-out sequences can't interleave.
const userId = computed(() => auth.user?.id ?? null)
let chain = Promise.resolve()
watch(
  [userId, () => auth.ready],
  () => {
    chain = chain.then(syncWorkspace).catch((e) => console.error(e))
  },
  { immediate: true },
)

async function syncWorkspace() {
  if (!cloudEnabled || !auth.ready) return
  const id = userId.value
  if (id && id === loadedFor() && status.value === 'ready') return
  if (status.value !== 'idle') await unload()
  if (id) {
    // Just signed in on a sign-in page: continue to where they were going.
    if (route.meta.auth && route.name !== 'reset-password') {
      const r = route.query.redirect
      const to = typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/today'
      void router.replace(to)
    }
    await load(id)
    auth.loadProfile().catch(() => {})
  } else if (!route.meta.public) {
    await router.replace({ name: 'login' })
  }
}

function retry() {
  void load(cloudEnabled ? userId.value : null)
}
</script>

<template>
  <AuthLayout v-if="authPage">
    <RouterView />
  </AuthLayout>
  <AppShell v-else-if="status === 'ready'" />
  <div v-else-if="status === 'error'" class="boot" role="alert">
    <DaynestLogo :size="40" />
    <p class="t">Daynest couldn’t open your data</p>
    <p class="m">{{ error }}.</p>
    <button type="button" class="btn btn-primary" @click="retry"><RotateCcw />Try again</button>
  </div>
  <div v-else class="boot" aria-busy="true" aria-label="Loading Daynest">
    <DaynestLogo :size="40" class="pulse" />
    <p class="tag">{{ APP_TAGLINE }}</p>
  </div>
</template>

<style scoped>
.boot { display: grid; place-items: center; align-content: center; gap: var(--space-3); height: 100%; padding: var(--space-6); text-align: center; }
.pulse { animation: p 1.1s var(--ease) infinite alternate; }
@keyframes p { to { opacity: 0.55; } }
.tag { color: var(--text-3); }
.t { font-weight: var(--weight-semibold); font-size: var(--text-lg); margin-top: var(--space-3); }
.m { color: var(--text-2); max-width: 420px; }
</style>
