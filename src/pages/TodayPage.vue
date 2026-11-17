<script setup>
import { computed } from 'vue'
import { ArrowRight, Flame } from 'lucide-vue-next'
import TaskItem from '@/components/task/TaskItem.vue'
import InlineAdd from '@/components/task/InlineAdd.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SunnyMascot from '@/components/brand/SunnyMascot.vue'
import { MOTIVATION } from '@/constants'
import { useTaskStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useStats } from '@/composables/useStats'
import { useReorder } from '@/composables/useReorder'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/utils/date'
import { compareByOrder } from '@/utils/task'

const store = useTaskStore()
const ui = useUiStore()
const settings = useSettingsStore()
const stats = useStats()
const toast = useToast()

const greeting = computed(() => {
  const h = ui.now.getHours()
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const name = settings.settings.userName.trim().split(/\s+/)[0]
  return name ? `${part}, ${name}` : part
})
const motivation = computed(() => {
  const n = +ui.today.replace(/-/g, '')
  return MOTIVATION[n % MOTIVATION.length]
})

/** Everything on today's date (across all calendars), manual order. */
const todayItems = computed(() => [...(store.dayMap(ui.today, ui.today).get(ui.today) ?? [])].sort(compareByOrder))

const overdue = computed(() => store.overdueInstances(ui.today))

const total = computed(() => todayItems.value.filter((i) => i.status !== 'cancelled').length)
const completed = computed(() => todayItems.value.filter((i) => i.status === 'completed').length)

const { ordered, dragKey, grab, nudge } = useReorder(todayItems, (list) => store.reorder(list))

function moveOverdueToToday() {
  const snap = new Map()
  for (const i of overdue.value) {
    const s = store.moveInstance(i, ui.today)
    for (const [k, v] of s) if (!snap.has(k)) snap.set(k, v)
  }
  toast.undoable(`Moved ${snap.size} task${snap.size === 1 ? '' : 's'} to today`, () => store.restore(snap))
}

/** Sunny follows the day: cheers when all is done, dozes late at night. */
const allDone = computed(() => total.value > 0 && completed.value === total.value)
const sunnyMood = computed(() => {
  const h = ui.now.getHours()
  if (allDone.value) return 'happy'
  if (h >= 22 || h < 5) return 'sleepy'
  if (overdue.value.length) return 'curious'
  return 'idle'
})

const addDefaults = computed(() => ({ startDate: ui.today }))
const maxBar = computed(() => Math.max(1, ...stats.week.value.counts))
</script>

<template>
  <div class="page">
    <div class="page-inner today">
      <header class="head">
        <div class="head-text">
          <p class="date">{{ formatDate(ui.today, { weekday: 'long', month: 'long', day: 'numeric' }) }}</p>
          <h1 class="greet display">{{ greeting }}.</h1>
          <p class="motto">{{ motivation }}</p>
        </div>
        <div class="head-sunny" :title="allDone ? 'All done — Sunny is proud of you!' : 'Hi, I’m Sunny!'"><SunnyMascot :mood="sunnyMood" /></div>
        <div class="progress">
          <p class="p-text"><strong>{{ completed }}</strong> of {{ total }} done</p>
          <div
            class="bar-track"
            role="progressbar"
            :aria-valuenow="completed"
            aria-valuemin="0"
            :aria-valuemax="total"
            :aria-label="`${completed} of ${total} tasks completed`"
          >
            <span class="bar-fill" :style="{ transform: `scaleX(${total ? completed / total : 0})` }" />
          </div>
        </div>
      </header>

      <dl class="ledger" aria-label="Today's overview">
        <div><dt>Planned</dt><dd>{{ total }}</dd></div>
        <div><dt>Done</dt><dd>{{ completed }}</dd></div>
        <div><dt>Left</dt><dd>{{ total - completed }}</dd></div>
        <div :class="{ warn: overdue.length }"><dt>Overdue</dt><dd>{{ overdue.length }}</dd></div>
      </dl>

      <section v-if="overdue.length" class="block">
        <div class="block-head">
          <h2 class="b-title late">Overdue</h2>
          <span class="count">{{ overdue.length }}</span>
          <button type="button" class="btn btn-soft btn-sm" @click="moveOverdueToToday">Move all to today<ArrowRight /></button>
        </div>
        <div class="list">
          <TaskItem v-for="i in overdue.slice(0, 20)" :key="i.key" :inst="i" />
        </div>
        <RouterLink v-if="overdue.length > 20" to="/tasks?filter=overdue" class="see-all">See all {{ overdue.length }} overdue tasks</RouterLink>
      </section>

      <section class="block">
        <div class="block-head">
          <h2 class="b-title">Today</h2>
          <span class="count">{{ todayItems.length }}</span>
        </div>
        <TransitionGroup tag="div" name="list" class="list">
          <TaskItem
            v-for="i in ordered"
            :key="i.key"
            :inst="i"
            :show-date="false"
            reorderable
            :dragging="dragKey === i.key"
            @grab="(e) => grab(e, i.key)"
            @nudge="(d) => nudge(i.key, d)"
          />
        </TransitionGroup>
        <Transition name="cheer">
          <div v-if="allDone" class="all-done" role="status">
            <div class="ad-sunny"><SunnyMascot mood="happy" /></div>
            <div>
              <p class="ad-title">All done for today!</p>
              <p class="ad-text">Every task is ticked off. Time to rest — Sunny is proud of you.</p>
            </div>
          </div>
        </Transition>
        <EmptyState v-if="!todayItems.length" mood="happy" title="Your day is wide open" text="Add something you would like to get done today." />
        <InlineAdd :defaults="addDefaults" placeholder="Add a task for today — try “Call mom at 6pm”" />
      </section>

      <section class="block" aria-label="This week">
        <div class="block-head">
          <h2 class="b-title">This week</h2>
          <span v-if="stats.streak.value" class="streak" :title="`${stats.streak.value}-day streak`"><Flame />{{ stats.streak.value }}-day streak</span>
        </div>
        <div class="week-body">
          <div class="bars" role="img" :aria-label="`Completed per day this week: ${stats.week.value.counts.join(', ')}`">
            <div v-for="(c, idx) in stats.week.value.counts" :key="idx" class="bar-col">
              <span class="bar" :class="{ today: stats.week.value.days[idx] === ui.today }" :style="{ transform: `scaleY(${Math.max(0.04, c / maxBar)})` }" />
              <span class="bar-lbl">{{ formatDate(stats.week.value.days[idx], { weekday: 'narrow' }) }}</span>
            </div>
          </div>
          <p class="ins-nums">
            <span><strong>{{ stats.week.value.total }}</strong> done this week</span>
            <span><strong>{{ stats.week.value.lastWeek }}</strong> last week</span>
            <span><strong>{{ stats.month.value.total }}</strong> this month</span>
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.today { display: grid; gap: var(--space-8); }
.head { display: flex; align-items: flex-end; gap: var(--space-8); padding-top: var(--space-2); }
.head-text { flex: 1; min-width: 0; }
.date { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--primary-text); text-transform: uppercase; letter-spacing: 0.08em; }
.greet { font-size: var(--text-3xl); line-height: 1.15; margin: 6px 0 4px; color: var(--brand-ink); }
.motto { color: var(--text-2); }
.progress { width: 180px; display: grid; gap: 8px; padding-bottom: 4px; }
.p-text { font-size: var(--text-sm); color: var(--text-3); text-align: right; }
.p-text strong { color: var(--text); font-weight: var(--weight-semibold); }
.bar-track { height: 6px; border-radius: 3px; background: var(--surface-sunken); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--primary); transform-origin: left; transition: transform var(--dur-slow) var(--ease-out); }
.head-sunny { width: 78px; flex-shrink: 0; align-self: center; }

/* "All done" card: still drawing + one-time pop (no running animation). */
.all-done {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-5) var(--space-3) var(--space-3);
  border-radius: var(--radius-lg);
  background: linear-gradient(120deg, color-mix(in srgb, var(--yellow) 22%, var(--surface)), color-mix(in srgb, var(--lavender) 55%, var(--surface)));
  border: 1px solid color-mix(in srgb, var(--yellow) 35%, var(--border));
}
.ad-sunny { width: 72px; flex-shrink: 0; }
.ad-title { font-weight: var(--weight-bold); font-size: var(--text-md); }
.ad-text { font-size: var(--text-sm); color: var(--text-2); }
.cheer-enter-active { animation: cheer-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.cheer-enter-active .ad-sunny { animation: cheer-hop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 150ms both; }
.cheer-leave-active { transition: opacity var(--dur) var(--ease); }
.cheer-leave-to { opacity: 0; }
@keyframes cheer-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes cheer-hop { 0% { transform: translateY(12px) scale(0.6); } 50% { transform: translateY(-8px) scale(1.06); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .cheer-enter-active, .cheer-enter-active .ad-sunny { animation: none; }
}


.block { display: grid; gap: var(--space-2); }
.block-head { display: flex; align-items: baseline; gap: var(--space-2); padding: 0 var(--space-1) var(--space-1); }
.b-title { font-size: var(--text-md); font-weight: var(--weight-semibold); }
.late { color: var(--overdue); }
.block-head .btn, .block-head .streak { margin-left: auto; align-self: center; }
.count { font-size: var(--text-sm); color: var(--text-3); }
.list { position: relative; display: grid; }
.see-all { font-size: var(--text-sm); color: var(--primary-text); padding: var(--space-2) var(--space-4); }
.week-body { display: grid; gap: var(--space-4); padding: var(--space-4) var(--space-5) var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.streak { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--accent-text); }
.streak svg { width: 15px; height: 15px; }
.bars { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-3); height: 84px; align-items: end; }
.bar-col { display: grid; grid-template-rows: 1fr auto; justify-items: center; gap: 6px; height: 100%; }
.bar { width: 100%; max-width: 28px; height: 100%; border-radius: 4px; background: var(--primary-soft); transform-origin: bottom; transition: transform var(--dur-slow) var(--ease-out); }
.bar.today { background: var(--primary); }
.bar-lbl { font-size: 11px; color: var(--text-3); font-weight: var(--weight-medium); }
.ins-nums { display: flex; gap: var(--space-5); flex-wrap: wrap; font-size: var(--text-sm); color: var(--text-3); }
.ins-nums strong { color: var(--text); font-weight: var(--weight-semibold); }

@media (max-width: 767px) {
  .today { gap: var(--space-6); }
  .head { position: relative; flex-direction: column; align-items: stretch; gap: var(--space-4); }
  .head-sunny { position: absolute; top: 0; right: 0; width: 60px; }
  .head-text { padding-right: 64px; }
  .progress { width: auto; }
  .p-text { text-align: left; }
  .greet { font-size: 1.75rem; }
}
</style>
