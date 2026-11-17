<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Check, Pencil, Plus } from 'lucide-vue-next'
import { useCollectionsStore } from '@/stores/collections'
import { useTaskStore } from '@/stores/tasks'
import { openCollectionDialog } from '@/composables/useCollectionDialog'
import { isDone } from '@/utils/task'

/** "My Calendars" + "Task Lists" sections (sidebar and mobile More page). */
const collections = useCollectionsStore()
const store = useTaskStore()
const route = useRoute()

/** Open task count per list — one pass over the tasks. */
const openByList = computed(() => {
  const m = new Map()
  for (const t of store.byId.values()) if (t.listId && !isDone(t.status)) m.set(t.listId, (m.get(t.listId) ?? 0) + 1)
  return m
})
const activeList = computed(() => (route.path === '/tasks' && typeof route.query.list === 'string' ? route.query.list : null))
</script>

<template>
  <section class="sec" aria-labelledby="sec-cals">
    <div class="sec-head">
      <h2 id="sec-cals" class="section-title">My calendars</h2>
      <button type="button" class="icon-btn sm" aria-label="New calendar" title="New calendar" @click="openCollectionDialog('calendar')"><Plus /></button>
    </div>
    <ul>
      <li v-for="c in collections.sortedCalendars" :key="c.id" class="row">
        <button
          type="button"
          class="toggle"
          role="checkbox"
          :aria-checked="c.visible"
          :aria-label="`Show ${c.name}`"
          :style="{ '--c': c.color }"
          @click="collections.toggleCalendar(c.id)"
        >
          <span class="box"><Check :stroke-width="3.5" /></span>
          <span class="name">{{ c.name }}</span>
        </button>
        <button type="button" class="icon-btn sm edit" :aria-label="`Edit ${c.name}`" @click="openCollectionDialog('calendar', c.id)"><Pencil /></button>
      </li>
    </ul>
  </section>

  <section class="sec" aria-labelledby="sec-lists">
    <div class="sec-head">
      <h2 id="sec-lists" class="section-title">Task lists</h2>
      <button type="button" class="icon-btn sm" aria-label="New list" title="New list" @click="openCollectionDialog('list')"><Plus /></button>
    </div>
    <ul>
      <li v-for="l in collections.sortedLists" :key="l.id" class="row">
        <RouterLink :to="{ path: '/tasks', query: { list: l.id } }" class="link" :class="{ active: activeList === l.id }" :aria-current="activeList === l.id ? 'page' : undefined">
          <span class="dot" :style="{ '--c': l.color }" />
          <span class="name">{{ l.name }}</span>
          <span v-if="openByList.get(l.id)" class="count">{{ openByList.get(l.id) }}</span>
        </RouterLink>
        <button type="button" class="icon-btn sm edit" :aria-label="`Edit ${l.name}`" @click="openCollectionDialog('list', l.id)"><Pencil /></button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.sec { display: grid; gap: 2px; }
.sec-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 2px 12px; }
.row { position: relative; display: flex; align-items: center; }
.toggle, .link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  padding: 0 36px 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: var(--text-base);
  text-align: left;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.toggle:hover, .link:hover { background: var(--surface-hover); color: var(--text); }
.link.active { background: var(--primary-soft); color: var(--primary-text); font-weight: var(--weight-medium); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.box {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 2px solid var(--c);
  background: var(--c);
  color: #fff;
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--ease);
}
.box svg { width: 10px; height: 10px; }
.toggle[aria-checked='false'] .box { background: transparent; }
.toggle[aria-checked='false'] .box svg { display: none; }
.toggle[aria-checked='false'] .name { color: var(--text-3); }
.count { font-size: var(--text-xs); color: var(--text-3); font-variant-numeric: tabular-nums; }
.edit { position: absolute; right: 4px; opacity: 0; }
.row:hover .edit, .edit:focus-visible { opacity: 1; }
.row:hover .count { visibility: hidden; }
@media (pointer: coarse) {
  .toggle, .link { height: 44px; }
  .edit { opacity: 0.7; }
  .row:hover .count { visibility: visible; }
  .link { padding-right: 52px; }
}
</style>
