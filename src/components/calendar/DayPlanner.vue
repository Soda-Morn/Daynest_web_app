<script setup lang="ts">
import { computed } from 'vue'
import WeekStrip from './WeekStrip.vue'
import TimeGridView from './TimeGridView.vue'
import { useUiStore } from '@/stores/ui'
import { useIsMobile } from '@/composables/useMediaQuery'

/**
 * Day planner: week strip on top, the selected day below as a roomy
 * timeline of pastel cards (title, description, time). Used for the Day
 * view, and for the Week view on phones.
 */
const ui = useUiStore()
const isMobile = useIsMobile()
const day = computed(() => [ui.selectedDate])
</script>

<template>
  <div class="planner">
    <WeekStrip />
    <div class="timeline">
      <TimeGridView :days="day" variant="cards" :hour-height="isMobile ? 72 : 80" />
    </div>
  </div>
</template>

<style scoped>
.planner { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* Keep the day readable on wide screens: a centred column, like a planner page. */
.planner > * { width: 100%; max-width: 860px; margin: 0 auto; }
.timeline { flex: 1; min-height: 0; border-top: 1px solid var(--border); padding-top: var(--space-2); }
</style>
