<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DaynestLogo from '@/components/brand/DaynestLogo.vue'
import SunnyMascot from '@/components/brand/SunnyMascot.vue'
import AuthSticker from '@/components/auth/AuthSticker.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { APP_TAGLINE } from '@/constants/brand'

/**
 * Layout for sign-in pages: the form card with "Sunny" peeking over it,
 * soft drifting background, cute stickers and (on wide screens) a panel
 * with a little live "Today" preview. Sunny reacts to the form: looks at
 * the email field, covers its eyes for the password, peeks when the
 * password is shown, and frowns at an error.
 */

/* ---------------- Mascot mood ---------------- */

const card = ref(null)
const focusMood = ref('idle')
const cheer = ref(false)
const sad = ref(false)
const mood = computed(() => (sad.value ? 'sad' : cheer.value ? 'happy' : focusMood.value))

function updateMood() {
  // After Vue has re-rendered (e.g. the show-password toggle flipped the input type).
  setTimeout(() => {
    const a = document.activeElement
    if (!a || !card.value?.contains(a)) return (focusMood.value = 'idle')
    const pw = a.closest('.pw')
    if (pw) focusMood.value = pw.querySelector('input')?.type === 'password' ? 'shy' : 'peek'
    else focusMood.value = a.matches('input') ? 'look' : 'idle'
  })
}

let cheerTimer = null
function doCheer() {
  if (sad.value) return
  cheer.value = false
  requestAnimationFrame(() => (cheer.value = true))
  clearTimeout(cheerTimer)
  cheerTimer = setTimeout(() => (cheer.value = false), 1100)
}

// Frown briefly whenever a new error message appears in the form.
let sadTimer = null
let observer = null
let hadError = false
onMounted(() => {
  if (!card.value || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver(() => {
    const hasError = !!card.value?.querySelector('[role="alert"]')
    if (hasError && !hadError) {
      sad.value = true
      clearTimeout(sadTimer)
      sadTimer = setTimeout(() => (sad.value = false), 2200)
    }
    hadError = hasError
  })
  observer.observe(card.value, { childList: true, subtree: true, characterData: true })
})

/* ---------------- "Today" preview (wide screens) ---------------- */

const demo = [
  { title: 'Morning stretch', time: '7:30' },
  { title: 'Reply to emails', time: '9:00' },
  { title: 'Water the plants', time: '18:00' },
]
const step = ref(1)
let demoTimer = null
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 960px)').matches
onMounted(() => {
  if (reduceMotion || !wide) return
  demoTimer = setInterval(() => (step.value = (step.value + 1) % (demo.length + 2)), 1500)
})
const doneCount = computed(() => Math.min(step.value, demo.length))
const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

onBeforeUnmount(() => {
  observer?.disconnect()
  clearInterval(demoTimer)
  clearTimeout(cheerTimer)
  clearTimeout(sadTimer)
})

/* Sticker placements */
const panelStickers = [
  { name: 'calendar', x: '2%', y: '6%', size: '76px', r: '-8deg', dur: '6.5s', delay: '150ms' },
  { name: 'cloud', x: '52%', y: '0%', size: '64px', r: '4deg', dur: '8s', delay: '300ms' },
  { name: 'star', x: '82%', y: '10%', size: '56px', r: '12deg', dur: '7s', delay: '450ms' },
  { name: 'check', x: '83%', y: '54%', size: '58px', r: '10deg', dur: '5.5s', delay: '600ms' },
  { name: 'sparkle', x: '3%', y: '60%', size: '34px', r: '0deg', dur: '4.5s', delay: '750ms' },
  { name: 'cup', x: '10%', y: '80%', size: '68px', r: '-6deg', dur: '6s', delay: '900ms' },
  { name: 'flower', x: '46%', y: '86%', size: '48px', r: '0deg', dur: '6.8s', delay: '1050ms' },
  { name: 'heart', x: '78%', y: '82%', size: '52px', r: '-12deg', dur: '5s', delay: '1200ms' },
]
const pageStickers = [
  { name: 'sparkle', x: '6%', y: '28px', size: '30px', r: '0deg', dur: '4.5s', delay: '200ms' },
  { name: 'heart', x: 'calc(100% - 64px)', y: '40px', size: '38px', r: '12deg', dur: '5.5s', delay: '350ms' },
  { name: 'star', x: '8%', y: 'calc(100% - 110px)', size: '40px', r: '-12deg', dur: '6.5s', delay: '500ms' },
  { name: 'cloud', x: 'calc(100% - 84px)', y: 'calc(100% - 150px)', size: '48px', r: '6deg', dur: '7.5s', delay: '650ms' },
  { name: 'flower', x: '42%', y: 'calc(100% - 70px)', size: '32px', r: '0deg', dur: '6s', delay: '800ms' },
]
const vars = (s) => ({ '--x': s.x, '--y': s.y, '--size': s.size, '--r': s.r, '--dur': s.dur, '--delay': s.delay })
</script>

<template>
  <div class="auth">
    <!-- Pinned to the window, so decoration can never make the page scroll. -->
    <div class="bg" aria-hidden="true">
      <div class="blob b1" />
      <div class="blob b2" />
      <div class="blob b3" />
    </div>
    <div class="page-stickers" aria-hidden="true">
      <AuthSticker v-for="s in pageStickers" :key="s.name" :name="s.name" :style="vars(s)" />
    </div>

    <main class="shell">
      <section class="form-col">
        <header class="brand">
          <DaynestLogo :size="36" />
        </header>

        <div class="mascot" title="Hi, I’m Sunny!" @mouseenter="doCheer" @click="doCheer">
          <SunnyMascot :mood="mood" animated />
        </div>

        <section ref="card" class="card" @focusin="updateMood" @focusout="updateMood" @click="updateMood">
          <slot />
        </section>

        <p class="tagline">{{ APP_TAGLINE }}</p>
      </section>

      <aside class="art" aria-hidden="true">
        <div class="art-copy">
          <p class="eyebrow">Your calm little planner</p>
          <h2 class="art-title">Plan your day,<br />gently.</h2>
          <p class="art-text">Tasks, calendar and reminders together in one cosy place, on every device.</p>
        </div>

        <div class="stage">
          <div class="mock">
            <div class="mock-head">
              <span class="mock-title">Today</span>
              <span class="mock-date">{{ todayLabel }}</span>
            </div>
            <div class="mock-progress">
              <span class="mock-bar"><span :style="{ transform: `scaleX(${doneCount / demo.length})` }" /></span>
              <span class="mock-count">{{ doneCount }}/{{ demo.length }}</span>
            </div>
            <ul class="mock-list">
              <li v-for="(t, i) in demo" :key="t.title" class="mock-row" :class="{ on: i < step }">
                <span class="box">
                  <svg viewBox="0 0 16 16"><path d="M4 8.5 l2.6 2.6 L12 5.5" /></svg>
                </span>
                <span class="txt">{{ t.title }}</span>
                <span class="time">{{ t.time }}</span>
              </li>
            </ul>
          </div>
          <AuthSticker v-for="s in panelStickers" :key="s.name" :name="s.name" :style="vars(s)" />
        </div>
      </aside>
    </main>

    <ToastHost />
  </div>
</template>

<style scoped>
.auth {
  position: relative;
  min-height: 100%;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg);
  isolation: isolate;
}

/* ---------- Soft drifting background ---------- */
.bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  animation: drift 18s ease-in-out infinite alternate;
}
.b1 { width: 460px; height: 460px; top: -160px; left: -140px; background: radial-gradient(circle, color-mix(in srgb, var(--lilac) 45%, transparent), transparent 70%); }
.b2 { width: 380px; height: 380px; bottom: -140px; left: 30%; background: radial-gradient(circle, color-mix(in srgb, var(--yellow) 32%, transparent), transparent 70%); animation-duration: 22s; }
.b3 { width: 300px; height: 300px; top: 30%; right: -120px; background: radial-gradient(circle, color-mix(in srgb, var(--rose) 26%, transparent), transparent 70%); animation-duration: 26s; }
@keyframes drift {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(40px, 30px) scale(1.08); }
}
/* Phones and tablets: keep the colours, skip the endless drift (saves battery). */
@media (max-width: 959px), (pointer: coarse) {
  .blob { animation: none; }
}

.page-stickers { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }

/* ---------- Layout ---------- */
.shell {
  position: relative;
  z-index: 1;
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  padding: var(--space-8) var(--space-4);
}
.form-col {
  width: 100%;
  min-width: 0;
  max-width: 420px;
  display: grid;
  justify-items: center;
}
.brand { margin-bottom: var(--space-2); animation: rise 500ms var(--ease-out) both; }
.mascot {
  position: relative;
  z-index: 2;
  width: 132px;
  margin-bottom: -16px; /* the nest sits on the card's edge */
  cursor: pointer;
  animation: mascot-in 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms both;
  -webkit-tap-highlight-color: transparent;
}
.card {
  position: relative;
  width: 100%;
  padding: var(--space-10) var(--space-8) var(--space-6);
  border-radius: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px -24px rgba(68, 55, 80, 0.35), 0 2px 6px rgba(68, 55, 80, 0.06);
  animation: rise 600ms var(--ease-out) 60ms both;
}
.tagline {
  margin-top: var(--space-5);
  color: var(--text-3);
  font-size: var(--text-sm);
  animation: rise 600ms var(--ease-out) 400ms both;
}

/* ---------- Illustrated panel (wide screens) ---------- */
.art { display: none; }

@media (min-width: 960px) {
  .page-stickers { display: none; }
  .shell {
    grid-template-columns: minmax(380px, 440px) minmax(0, 1fr);
    gap: clamp(32px, 5vw, 80px);
    max-width: 1180px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-8);
  }
  .art {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    align-self: stretch;
    min-height: min(680px, calc(100dvh - 64px));
    padding: var(--space-10);
    border-radius: 32px;
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(circle at 85% 15%, rgba(255, 255, 255, 0.22), transparent 40%),
      radial-gradient(rgba(255, 255, 255, 0.14) 1.2px, transparent 1.4px) 0 0 / 22px 22px,
      linear-gradient(160deg, #6f5a8a 0%, #8b72a8 48%, #b9a3d1 100%);
    box-shadow: 0 30px 70px -30px rgba(68, 55, 80, 0.55);
    animation: panel-in 800ms var(--ease-out) 100ms both;
  }
}

.eyebrow {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.18);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
}
.art-title {
  margin-top: var(--space-4);
  font-size: clamp(2rem, 3.4vw, 2.9rem);
  font-weight: var(--weight-bold);
  line-height: 1.08;
  letter-spacing: -0.03em;
}
.art-text { margin-top: var(--space-3); max-width: 340px; font-size: var(--text-md); line-height: var(--leading); opacity: 0.88; }
.art-copy > * { animation: rise 700ms var(--ease-out) both; }
.art-copy > :nth-child(2) { animation-delay: 120ms; }
.art-copy > :nth-child(3) { animation-delay: 220ms; }

.stage { position: relative; display: grid; place-items: center; min-height: 340px; }
.mock {
  width: min(320px, 78%);
  padding: var(--space-5);
  border-radius: 20px;
  background: #fff;
  color: #443750;
  box-shadow: 0 22px 50px -18px rgba(40, 28, 55, 0.5);
  transform: rotate(-2deg);
  animation: mock-in 800ms cubic-bezier(0.34, 1.4, 0.64, 1) 250ms both;
}
.mock-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.mock-title { font-size: var(--text-lg); font-weight: var(--weight-bold); }
.mock-date { font-size: var(--text-xs); color: #8e8399; }
.mock-progress { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 var(--space-2); }
.mock-bar { flex: 1; height: 6px; border-radius: 6px; background: #efe9f5; overflow: hidden; }
.mock-bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b9a3d1, #8b72a8); transform-origin: left; transition: transform 500ms var(--ease-out); }
.mock-count { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: #8b72a8; font-variant-numeric: tabular-nums; }
.mock-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.mock-row { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid #f1ecf6; font-size: var(--text-sm); }
.mock-row:last-child { border-bottom: 0; }
.box {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.8px solid #cdbfdd;
  border-radius: 50%;
  transition: background 300ms var(--ease), border-color 300ms var(--ease), transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.box svg { width: 12px; height: 12px; }
.box path { fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 14; stroke-dashoffset: 14; transition: stroke-dashoffset 300ms var(--ease) 120ms; }
.txt { flex: 1; position: relative; font-weight: var(--weight-medium); transition: color 300ms var(--ease); }
.txt::after { content: ''; position: absolute; left: 0; top: 50%; height: 1.5px; width: 100%; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform 350ms var(--ease) 100ms; }
.time { font-size: var(--text-xs); color: #a497b1; font-variant-numeric: tabular-nums; }
.mock-row.on .box { background: #8baf91; border-color: #8baf91; transform: scale(1.12); }
.mock-row.on .box path { stroke-dashoffset: 0; }
.mock-row.on .txt { color: #a497b1; }
.mock-row.on .txt::after { transform: scaleX(1); }

/* ---------- Motion ---------- */
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes mascot-in { from { opacity: 0; transform: translateY(30px) scale(0.7); } to { opacity: 1; transform: none; } }
@keyframes panel-in { from { opacity: 0; transform: translateX(24px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes mock-in { from { opacity: 0; transform: translateY(30px) rotate(-8deg) scale(0.9); } to { opacity: 1; transform: rotate(-2deg); } }

/* Shorter laptop screens: tighten everything so the page fits without scrolling. */
@media (min-width: 960px) and (max-height: 820px) {
  .shell { padding-block: var(--space-4); }
  .art { min-height: calc(100dvh - 32px); padding: var(--space-8); }
  .art-title { font-size: clamp(1.8rem, 2.8vw, 2.4rem); }
  .stage { min-height: 280px; }
  .mock { transform: rotate(-2deg) scale(0.92); }
  .mascot { width: 112px; margin-bottom: -14px; }
  .card { padding: var(--space-8) var(--space-8) var(--space-5); }
  .tagline { margin-top: var(--space-3); }
}
@media (min-width: 960px) and (max-height: 700px) {
  .brand { display: none; }
  .mascot { width: 96px; margin-bottom: -12px; }
  .stage { min-height: 220px; }
}

@media (max-width: 480px) {
  .shell { place-items: start center; padding-top: var(--space-6); }
  .mascot { width: 116px; margin-bottom: -14px; }
  .card { padding: var(--space-10) var(--space-5) var(--space-5); border-radius: 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .blob, .brand, .mascot, .card, .tagline, .art, .art-copy > *, .mock { animation: none; }
}
</style>

<style>
/* Shared auth-form styles (unscoped so each page can use them). */
.auth-title { font-size: var(--text-2xl); font-weight: var(--weight-bold); letter-spacing: -0.02em; text-align: center; }
.auth-sub { color: var(--text-2); margin-top: 4px; text-align: center; }
.auth-form { display: grid; gap: var(--space-4); margin-top: var(--space-6); }
.auth-form .btn-primary {
  position: relative;
  width: 100%;
  height: 46px;
  margin-top: var(--space-1);
  overflow: hidden;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--lilac)));
  box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--primary) 80%, transparent);
  font-size: var(--text-md);
  transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur) var(--ease), filter var(--dur) var(--ease);
}
.auth-form .btn-primary:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 14px 26px -10px color-mix(in srgb, var(--primary) 85%, transparent); }
.auth-form .btn-primary:active:not(:disabled) { transform: translateY(0) scale(0.98); }
/* A soft shine that sweeps across the button now and then. */
.auth-form .btn-primary::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.28) 50%, transparent 70%);
  transform: translateX(-120%);
  animation: auth-shine 4.5s ease-in-out 1.2s infinite;
  pointer-events: none;
}
@keyframes auth-shine { 0%, 70% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
.auth-form .input { height: 44px; border-radius: 12px; background: var(--surface-2); }
.auth-form .input:focus { background: var(--surface); }
.auth-err { color: var(--danger-text); font-size: var(--text-sm); }
.auth-alert {
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  font-size: var(--text-sm);
  background: color-mix(in srgb, var(--rose) 14%, var(--surface));
  color: var(--danger-text);
  animation: auth-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.auth-alert.ok { background: color-mix(in srgb, var(--green) 18%, var(--surface)); color: var(--success-text); }
.auth-foot { margin-top: var(--space-5); text-align: center; font-size: var(--text-sm); color: var(--text-2); }
.auth-link { color: var(--primary-text); font-weight: var(--weight-semibold); background: none; border: 0; padding: 0; font-size: inherit; cursor: pointer; }
.auth-link:hover { text-decoration: underline; }
.field-row { display: flex; justify-content: space-between; align-items: baseline; }

/* Content of each auth page fades up in a gentle cascade. */
.auth .card > * { animation: auth-rise 520ms var(--ease-out) both; }
.auth .card > :nth-child(1) { animation-delay: 180ms; }
.auth .card > :nth-child(2) { animation-delay: 230ms; }
.auth .card > :nth-child(3) { animation-delay: 280ms; }
.auth .card > :nth-child(n + 4) { animation-delay: 360ms; }
.auth .auth-form > * { animation: auth-rise 480ms var(--ease-out) both; }
.auth .auth-form > :nth-child(1) { animation-delay: 300ms; }
.auth .auth-form > :nth-child(2) { animation-delay: 350ms; }
.auth .auth-form > :nth-child(3) { animation-delay: 400ms; }
.auth .auth-form > :nth-child(4) { animation-delay: 450ms; }
.auth .auth-form > :nth-child(n + 5) { animation-delay: 500ms; }
/* Messages that appear later (errors, notices) pop in right away. */
.auth .auth-form > .auth-alert { animation: auth-pop 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes auth-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes auth-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }

@media (min-width: 960px) and (max-height: 820px) {
  .auth-form { gap: var(--space-3); margin-top: var(--space-4); }
  .auth-foot { margin-top: var(--space-4); }
}

@media (prefers-reduced-motion: reduce) {
  .auth .card > *, .auth .auth-form > *, .auth-alert, .auth-form .btn-primary::after { animation: none; }
}
</style>
