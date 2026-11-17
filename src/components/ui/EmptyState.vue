<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon: Component; title: string; text?: string }>()
</script>

<template>
  <div class="empty">
    <div class="badge"><component :is="icon" /></div>
    <p class="title">{{ title }}</p>
    <p v-if="text" class="text">{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty { display: grid; justify-items: center; gap: 6px; padding: var(--space-10) var(--space-4); text-align: center; }
.badge {
  display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 6px;
  border-radius: 16px; background: var(--primary-soft); color: var(--primary-text);
}
.badge svg { width: 24px; height: 24px; }
.title { font-weight: var(--weight-semibold); font-size: var(--text-md); }
.text { color: var(--text-3); max-width: 320px; font-size: var(--text-sm); }
</style>
