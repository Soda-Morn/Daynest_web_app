<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Ellipsis, Plus, Search, Settings, X } from 'lucide-vue-next'
import Segmented from '@/components/ui/Segmented.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import SyncStatus from './SyncStatus.vue'
import { online } from '@/pwa/pwa'
import { saveStatus } from '@/services/persistence'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { cloudEnabled } from '@/services/supabase'
import { useCalendarNav } from '@/composables/useCalendarNav'
import { useIsMobile, useMediaQuery } from '@/composables/useMediaQuery'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const settings = useSettingsStore()
const nav = useCalendarNav()
const isMobile = useIsMobile()
/** Tablets and phones: view menu instead of tabs, search icon instead of a field. */
const compact = useMediaQuery('(max-width: 1023px)')

const isCalendar = computed(() => route.name === 'calendar')
/** On phones the Day planner shows its own month heading and week arrows. */
const plannerOnPhone = computed(() => isCalendar.value && isMobile.value && (ui.calendarView === 'week' || ui.calendarView === 'day'))
/** Phone calendar: big month title + one "•••" menu, like a native calendar app. */
const phoneCal = computed(() => isCalendar.value && isMobile.value)
const title = computed(() =>
  plannerOnPhone.value
    ? 'Calendar'
    : isCalendar.value
      ? compact.value
        ? nav.shortTitle.value
        : nav.title.value
      : (route.meta.title ?? ''),
)

const views = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
]

/* ---- Search: debounced navigation to /search?q= ---- */
const searchEl = ref(null)
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
let timer = null
let returnTo = null
watch(q, (val) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (val.trim()) {
      if (route.name !== 'search') returnTo = route.fullPath
      router.replace({ name: 'search', query: { ...(route.name === 'search' ? route.query : {}), q: val } })
    } else if (route.name === 'search' && returnTo) {
      router.replace(returnTo)
      returnTo = null
    }
  }, 150)
})
watch(
  () => route.name,
  (n) => {
    if (n !== 'search') q.value = ''
  },
)
function clearSearch() {
  q.value = ''
  searchEl.value?.focus()
}

const auth = useAuthStore()
function openProfile() {
  if (cloudEnabled) void router.push({ name: 'account' })
  else ui.settingsOpen = true
}

const initials = computed(() => {
  const n = settings.settings.userName.trim()
  if (!n) return ''
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
})

defineExpose({ focusSearch: () => (compact.value ? router.push({ name: 'search' }) : searchEl.value?.focus()) })
</script>

<template>
  <header class="topbar" :class="{ mobile: isMobile, 'phone-cal': phoneCal }">
    <div class="left">
      <h1 class="title" aria-live="polite">{{ title }}</h1>
      <div v-if="isCalendar && !phoneCal" class="cal-ctrl">
        <button v-if="!isMobile" type="button" class="btn btn-secondary btn-sm" title="Go to today (T)" @click="nav.goToday()">Today</button>
        <div class="arrows">
          <button type="button" class="icon-btn sm" aria-label="Previous" title="Previous (←)" @click="nav.prev()"><ChevronLeft /></button>
          <button type="button" class="icon-btn sm" aria-label="Next" title="Next (→)" @click="nav.next()"><ChevronRight /></button>
        </div>
      </div>
    </div>

    <div v-if="phoneCal" class="right">
      <SyncStatus v-if="!online || saveStatus.state === 'error'" compact />
      <Dropdown placement="bottom-end" :width="220" label="Calendar options">
        <template #trigger="{ toggle }">
          <button type="button" class="icon-btn more-btn" aria-label="Calendar options" @click="toggle"><Ellipsis /></button>
        </template>
        <template #default="{ close }">
          <button type="button" role="menuitem" class="menu-item" @click="ui.openQuickAdd({ startDate: ui.selectedDate }); close()"><Plus />New task</button>
          <button type="button" role="menuitem" class="menu-item" @click="nav.goToday(); close()"><CalendarCheck />Today</button>
          <button type="button" role="menuitem" class="menu-item" @click="nav.prev(); close()"><ChevronLeft />Previous</button>
          <button type="button" role="menuitem" class="menu-item" @click="nav.next(); close()"><ChevronRight />Next</button>
          <div class="menu-sep" />
          <div class="menu-label">View</div>
          <button
            v-for="v in views"
            :key="v.value"
            type="button"
            role="menuitemradio"
            class="menu-item"
            :aria-checked="ui.calendarView === v.value"
            @click="nav.setView(v.value); close()"
          >
            {{ v.label }}<Check v-if="ui.calendarView === v.value" class="tick" />
          </button>
          <div class="menu-sep" />
          <button type="button" role="menuitem" class="menu-item" @click="router.push({ name: 'search' }); close()"><Search />Search</button>
        </template>
      </Dropdown>
    </div>

    <div v-else class="right">
      <template v-if="isCalendar">
        <Segmented v-if="!compact" :model-value="ui.calendarView" :options="views" label="Calendar view" @update:model-value="nav.setView" />
        <template v-else>
          <button v-if="isMobile && !plannerOnPhone && ui.selectedDate !== ui.today" type="button" class="btn btn-secondary btn-sm" @click="nav.goToday()">Today</button>
          <Dropdown placement="bottom-end" label="Calendar view">
            <template #trigger="{ toggle }">
              <button type="button" class="btn btn-secondary btn-sm" aria-label="Change view" @click="toggle">{{ views.find((v) => v.value === ui.calendarView)?.label }}</button>
            </template>
            <template #default="{ close }">
              <button
                v-for="v in views"
                :key="v.value"
                type="button"
                role="menuitemradio"
                class="menu-item"
                :aria-checked="ui.calendarView === v.value"
                @click="nav.setView(v.value); close()"
              >
                {{ v.label }}
              </button>
            </template>
          </Dropdown>
        </template>
      </template>

      <SyncStatus v-if="isMobile && (!online || saveStatus.state === 'error')" compact />
      <div v-if="!compact" class="search">
        <Search class="s-ic" aria-hidden="true" />
        <input ref="searchEl" v-model="q" type="search" class="input s-input" placeholder="Search" aria-label="Search tasks" @keydown.esc="clearSearch" />
        <button v-if="q" type="button" class="s-clear" aria-label="Clear search" @click="clearSearch"><X /></button>
        <span v-else class="kbd s-kbd" aria-hidden="true">/</span>
      </div>
      <RouterLink v-else-if="route.name !== 'search'" :to="{ name: 'search' }" class="icon-btn" aria-label="Search"><Search /></RouterLink>

      <button v-if="!isMobile" type="button" class="btn btn-primary btn-sm add" title="Quick add (N)" :aria-label="compact ? 'Add task' : undefined" @click="ui.openQuickAddFor(route.name)"><Plus /><span v-if="!compact">Add</span></button>
      <button v-if="!isMobile" type="button" class="icon-btn" aria-label="Settings" title="Settings" @click="ui.settingsOpen = true"><Settings /></button>
      <button type="button" class="avatar" :aria-label="`Profile${settings.settings.userName ? ': ' + settings.settings.userName : ''}`" :title="cloudEnabled ? 'Account' : 'Profile & settings'" @click="openProfile">
        <img v-if="auth.profile?.avatarUrl" :src="auth.profile.avatarUrl" alt="" class="avatar-img" />
        <span v-else-if="initials">{{ initials }}</span>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" fill="currentColor" /><path d="M4 20c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5" fill="currentColor" /></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--topbar-height);
  padding: 0 var(--space-6);
  flex-shrink: 0;
}
.left, .right { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.left { flex: 1; }
.title { font-size: var(--text-xl); font-weight: var(--weight-bold); letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.cal-ctrl { display: flex; align-items: center; gap: var(--space-2); }
.arrows { display: flex; }
.search { position: relative; width: 220px; }
.s-input { padding-left: 34px; padding-right: 30px; height: 34px; background: var(--surface); }
.s-input::-webkit-search-cancel-button { display: none; }
.s-ic { position: absolute; left: 11px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
.s-kbd { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); }
.s-clear { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--text-3); }
.s-clear svg { width: 14px; height: 14px; }
.add { padding: 0 12px 0 10px; }
.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  flex-shrink: 0;
  overflow: hidden;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar svg { width: 22px; height: 22px; margin-top: 6px; opacity: 0.9; }
.title { flex-shrink: 0; max-width: 100%; }
@media (max-width: 1440px) { .search { width: 168px; } }
@media (max-width: 1100px) { .search { width: 132px; } .title { font-size: var(--text-lg); } }
@media (max-width: 1023px) { .title { flex-shrink: 1; } .cal-ctrl { flex-shrink: 0; } .right { flex-shrink: 0; } }

.mobile { padding: 0 var(--space-3) 0 var(--space-4); gap: var(--space-2); padding-top: env(safe-area-inset-top); height: calc(var(--topbar-height) + env(safe-area-inset-top)); }
.mobile .title { font-size: var(--text-lg); flex-shrink: 1; }
.phone-cal { padding-left: var(--space-5); }
.phone-cal .title { font-size: 1.75rem; font-weight: var(--weight-bold); letter-spacing: -0.03em; }
.more-btn { color: var(--text-3); }
.tick { margin-left: auto; color: var(--primary-text) !important; }
.mobile .cal-ctrl { flex-shrink: 0; }
.mobile .left { gap: var(--space-1); }
.mobile .right { gap: var(--space-1); }
</style>
