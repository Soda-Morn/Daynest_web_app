<script setup>
import { ChevronRight, CircleCheckBig, CircleUser, Search, Settings } from 'lucide-vue-next'
import { cloudEnabled } from '@/services/supabase'
import CollectionsPanel from '@/components/layout/CollectionsPanel.vue'
import SyncStatus from '@/components/layout/SyncStatus.vue'
import { canInstall, promptInstall } from '@/pwa/pwa'
import { useUiStore } from '@/stores/ui'

/** Mobile "More" tab: secondary pages, calendars and lists. */
const ui = useUiStore()
</script>

<template>
  <div class="page">
    <div class="page-inner more">
      <nav class="card links" aria-label="More">
        <RouterLink to="/completed" class="link"><CircleCheckBig class="ic" />Completed<ChevronRight class="chev" /></RouterLink>
        <RouterLink to="/search" class="link"><Search class="ic" />Search &amp; filters<ChevronRight class="chev" /></RouterLink>
        <RouterLink v-if="cloudEnabled" to="/account" class="link"><CircleUser class="ic" />Account<ChevronRight class="chev" /></RouterLink>
        <button type="button" class="link" @click="ui.settingsOpen = true"><Settings class="ic" />Settings &amp; data<ChevronRight class="chev" /></button>
      </nav>
      <div class="card status">
        <SyncStatus />
        <button v-if="canInstall" type="button" class="btn btn-primary btn-sm" @click="promptInstall()">Install Daynest</button>
      </div>
      <div class="card panel">
        <CollectionsPanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.more { display: grid; gap: var(--space-4); }
.links { display: grid; padding: 4px; }
.link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 52px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius);
  background: none;
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  text-align: left;
}
.link:active { background: var(--surface-hover); }
.ic { width: 20px; height: 20px; color: var(--primary-text); }
.chev { margin-left: auto; width: 18px; height: 18px; color: var(--text-3); }
.status { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); }
.panel { display: grid; gap: var(--space-5); padding: var(--space-4) var(--space-2); }
</style>
