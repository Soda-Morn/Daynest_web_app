<script setup lang="ts">
import { onMounted } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import AppShell from '@/layouts/AppShell.vue'
import DaynestLogo from '@/components/brand/DaynestLogo.vue'
import { APP_TAGLINE } from '@/constants/brand'
import { useBootstrap } from '@/composables/useBootstrap'

const { status, error, load } = useBootstrap()
onMounted(load)
</script>

<template>
  <AppShell v-if="status === 'ready'" />
  <div v-else-if="status === 'error'" class="boot" role="alert">
    <DaynestLogo :size="40" />
    <p class="t">Daynest couldn't open its storage</p>
    <p class="m">{{ error }}. Private browsing or blocked site data can cause this.</p>
    <button type="button" class="btn btn-primary" @click="load"><RotateCcw />Try again</button>
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
.tag { font-family: var(--font-display); color: var(--text-3); }
.t { font-weight: var(--weight-semibold); font-size: var(--text-lg); margin-top: var(--space-3); }
.m { color: var(--text-2); max-width: 420px; }
</style>
