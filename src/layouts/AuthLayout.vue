<script setup>
import DaynestLogo from '@/components/brand/DaynestLogo.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { APP_TAGLINE } from '@/constants/brand'
</script>

<template>
  <div class="auth">
    <main class="card-wrap">
      <header class="brand">
        <DaynestLogo :size="40" />
        <p class="tagline">{{ APP_TAGLINE }}</p>
      </header>
      <section class="card">
        <slot />
      </section>
    </main>
    <ToastHost />
  </div>
</template>

<style scoped>
.auth {
  min-height: 100%;
  height: 100dvh;
  overflow-y: auto;
  display: grid;
  place-items: center;
  padding: var(--space-8) var(--space-4);
  background: var(--bg);
}
.card-wrap { width: 100%; max-width: 420px; display: grid; gap: var(--space-5); }
.brand { display: grid; justify-items: center; gap: var(--space-2); }
.tagline { color: var(--text-3); font-size: var(--text-sm); }
.card {
  padding: var(--space-8) var(--space-8) var(--space-6);
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
@media (max-width: 480px) {
  .auth { place-items: start center; padding-top: var(--space-10); }
  .card { padding: var(--space-6) var(--space-5) var(--space-5); }
}
</style>

<style>
/* Shared auth-form styles (unscoped so each page can use them). */
.auth-title { font-size: var(--text-2xl); font-weight: var(--weight-bold); letter-spacing: -0.02em; }
.auth-sub { color: var(--text-2); margin-top: 4px; }
.auth-form { display: grid; gap: var(--space-4); margin-top: var(--space-6); }
.auth-form .btn-primary { width: 100%; height: 42px; margin-top: var(--space-1); }
.auth-err { color: var(--danger-text); font-size: var(--text-sm); }
.auth-alert {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  background: color-mix(in srgb, var(--rose) 14%, var(--surface));
  color: var(--danger-text);
}
.auth-alert.ok { background: color-mix(in srgb, var(--green) 18%, var(--surface)); color: var(--success-text); }
.auth-foot { margin-top: var(--space-5); text-align: center; font-size: var(--text-sm); color: var(--text-2); }
.auth-link { color: var(--primary-text); font-weight: var(--weight-semibold); background: none; border: 0; padding: 0; font-size: inherit; cursor: pointer; }
.auth-link:hover { text-decoration: underline; }
.field-row { display: flex; justify-content: space-between; align-items: baseline; }
</style>
