<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Camera, CloudOff, LogOut, RefreshCw, Trash2, UploadCloud } from 'lucide-vue-next'
import PasswordField from '@/components/auth/PasswordField.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useCollectionsStore } from '@/stores/collections'
import { useTaskStore } from '@/stores/tasks'
import { useAccount } from '@/composables/useAccount'
import { currentSync } from '@/composables/useBootstrap'
import { useToast } from '@/composables/useToast'
import { confirmDialog } from '@/composables/useDialogs'
import { syncStatus } from '@/services/sync'
import { markLocalOnlyDataImported, readLocalOnlyData } from '@/services/legacyImport'
import { checkPassword } from '@/utils/authValidation'
import { online } from '@/pwa/pwa'

const auth = useAuthStore()
const settings = useSettingsStore()
const collections = useCollectionsStore()
const tasks = useTaskStore()
const toast = useToast()
const { signOut } = useAccount()

onMounted(() => void auth.loadProfile().catch((e) => toast.error(e.message)))

/* ---- Profile ---- */
const name = ref(settings.settings.userName)
watch(
  () => settings.settings.userName,
  (n) => (name.value = n),
)
function saveName() {
  const n = name.value.trim().slice(0, 80)
  if (n !== settings.settings.userName) {
    settings.update({ userName: n }) // syncs to profiles.full_name
    toast.show('Name updated')
  }
}

const initials = computed(() =>
  (settings.settings.userName || auth.user?.email || '?')
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join(''),
)
const memberSince = computed(() =>
  auth.profile?.createdAt
    ? new Date(auth.profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '',
)

const fileInput = ref(null)
const avatarBusy = ref(false)
async function onAvatar(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  avatarBusy.value = true
  try {
    await auth.uploadAvatar(file)
    toast.show('Profile picture updated')
  } catch (err) {
    toast.error(err.message)
  } finally {
    avatarBusy.value = false
  }
}
async function removeAvatar() {
  avatarBusy.value = true
  try {
    await auth.removeAvatar()
  } catch (err) {
    toast.error(err.message)
  } finally {
    avatarBusy.value = false
  }
}

/* ---- Password ---- */
const current = ref('')
const next = ref('')
const confirmPw = ref('')
const pwBusy = ref(false)
const pwTouched = ref(false)
const pwError = ref(null)
const pwErrors = computed(() => ({
  next: pwTouched.value && !checkPassword(next.value).ok ? 'Use at least 8 characters with letters and numbers.' : null,
  confirm: pwTouched.value && confirmPw.value !== next.value ? 'Passwords don’t match.' : null,
}))
async function changePassword() {
  if (pwBusy.value) return
  pwTouched.value = true
  pwError.value = current.value ? null : 'Enter your current password.'
  if (pwError.value || pwErrors.value.next || pwErrors.value.confirm) return
  pwBusy.value = true
  try {
    await auth.updatePassword(next.value, current.value)
    current.value = next.value = confirmPw.value = ''
    pwTouched.value = false
    toast.show('Password changed')
  } catch (e) {
    pwError.value = e.message
  } finally {
    pwBusy.value = false
  }
}

/* ---- Sync ---- */
const lastSynced = computed(() =>
  syncStatus.value.lastSyncedAt
    ? new Date(syncStatus.value.lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'not yet',
)
const syncing = ref(false)
async function syncNow() {
  syncing.value = true
  try {
    await currentSync()?.pull()
    await currentSync()?.push()
  } catch {
    /* status shows the problem */
  } finally {
    syncing.value = false
  }
}

/* ---- Bring data from before accounts ---- */
const legacy = ref(null)
onMounted(async () => {
  const d = await readLocalOnlyData()
  legacy.value = d && d.tasks.length ? d : null
})
async function importLegacy() {
  const d = legacy.value
  if (!d) return
  const ok = await confirmDialog({
    title: `Add ${d.tasks.length} tasks to your account?`,
    message:
      'Tasks saved in this browser before you had an account will be added to your account and synced. Tasks you already have are skipped.',
    confirmLabel: 'Add to my account',
  })
  if (!ok) return
  // Match calendars and lists by name; create any that are missing.
  const calByName = new Map(collections.calendars.map((c) => [c.name.toLowerCase(), c.id]))
  const listByName = new Map(collections.lists.map((l) => [l.name.toLowerCase(), l.id]))
  const calIdMap = new Map()
  const listIdMap = new Map()
  for (const c of d.calendars) calIdMap.set(c.id, calByName.get(c.name.toLowerCase()) ?? collections.createCalendar(c.name, c.color).id)
  for (const l of d.lists) listIdMap.set(l.id, listByName.get(l.name.toLowerCase()) ?? collections.createList(l.name, l.color).id)
  const added = tasks.importTasks(d.tasks, (t) => ({
    calendarId: calIdMap.get(t.calendarId) ?? collections.defaultCalendarId,
    listId: t.listId ? (listIdMap.get(t.listId) ?? null) : null,
  }))
  toast.show(added ? `Added ${added} task${added === 1 ? '' : 's'} to your account` : 'Everything was already in your account')
  // Offer it only once per browser, so it never reaches another account.
  markLocalOnlyDataImported()
  legacy.value = null
}
function dismissLegacy() {
  markLocalOnlyDataImported()
  legacy.value = null
}
</script>

<template>
  <div class="page">
    <div class="page-inner account">
      <section class="card block">
        <div class="profile">
          <div class="avatar-wrap">
            <img v-if="auth.profile?.avatarUrl" :src="auth.profile.avatarUrl" alt="" class="avatar" />
            <span v-else class="avatar initials" aria-hidden="true">{{ initials }}</span>
            <button type="button" class="avatar-btn" :disabled="avatarBusy || !online" aria-label="Change profile picture" @click="fileInput?.click()"><Camera /></button>
            <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="onAvatar" />
          </div>
          <div class="who">
            <p class="who-name">{{ settings.settings.userName || 'Your name' }}</p>
            <p class="who-mail">{{ auth.user?.email }}</p>
            <p v-if="memberSince" class="who-since">Member since {{ memberSince }}</p>
            <button v-if="auth.profile?.avatarPath" type="button" class="link-btn" :disabled="avatarBusy" @click="removeAvatar"><Trash2 />Remove picture</button>
          </div>
        </div>
        <label class="field">
          <span class="field-label">Display name</span>
          <input v-model="name" class="input" maxlength="80" autocomplete="name" @blur="saveName" @keydown.enter="saveName" />
        </label>
        <div class="field">
          <span class="field-label">Email</span>
          <input class="input" :value="auth.user?.email" readonly aria-readonly="true" />
        </div>
      </section>

      <section class="card block">
        <h2 class="h">Change password</h2>
        <form class="form" novalidate @submit.prevent="changePassword">
          <PasswordField id="acc-current" v-model="current" label="Current password" autocomplete="current-password" />
          <PasswordField id="acc-new" v-model="next" label="New password" autocomplete="new-password" show-strength :error="pwErrors.next" />
          <PasswordField id="acc-confirm" v-model="confirmPw" label="Confirm new password" autocomplete="new-password" :error="pwErrors.confirm" />
          <p v-if="pwError" class="auth-alert" role="alert">{{ pwError }}</p>
          <button type="submit" class="btn btn-primary" :disabled="pwBusy || !online">{{ pwBusy ? 'Saving…' : 'Change password' }}</button>
        </form>
      </section>

      <section class="card block">
        <h2 class="h">Sync</h2>
        <p class="note">
          <template v-if="!online"><CloudOff class="ic" /> You’re offline. Changes are saved on this device and sync when you’re back online.</template>
          <template v-else-if="syncStatus.state === 'error'">Some changes couldn’t sync: {{ syncStatus.error }}</template>
          <template v-else>Your tasks sync to your Daynest account. Last synced {{ lastSynced }}<span v-if="syncStatus.pending"> · {{ syncStatus.pending }} waiting</span>.</template>
        </p>
        <button type="button" class="btn btn-secondary" :disabled="syncing || !online" @click="syncNow"><RefreshCw :class="{ spin: syncing }" />Sync now</button>
        <template v-if="legacy">
          <div class="sep" />
          <p class="note">This browser has <strong>{{ legacy.tasks.length }} tasks</strong> from before you signed in.</p>
          <div class="row-btns">
            <button type="button" class="btn btn-soft" @click="importLegacy"><UploadCloud />Add them to my account</button>
            <button type="button" class="btn btn-ghost" @click="dismissLegacy">Not mine</button>
          </div>
        </template>
      </section>

      <button type="button" class="btn btn-secondary signout" @click="signOut"><LogOut />Sign out</button>
    </div>
  </div>
</template>

<style scoped>
.account { display: grid; gap: var(--space-4); max-width: 560px; }
.row-btns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.block { display: grid; gap: var(--space-4); padding: var(--space-5) var(--space-6); }
.profile { display: flex; align-items: center; gap: var(--space-5); }
.avatar-wrap { position: relative; flex-shrink: 0; }
.avatar { display: grid; place-items: center; width: 76px; height: 76px; border-radius: 50%; object-fit: cover; background: var(--accent-soft); }
.initials { font-size: var(--text-xl); font-weight: var(--weight-bold); color: var(--accent-text); }
.avatar-btn {
  position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 30px; height: 30px;
  border: 2px solid var(--surface); border-radius: 50%; background: var(--primary); color: var(--primary-contrast);
}
.avatar-btn svg { width: 14px; height: 14px; }
.who { display: grid; gap: 2px; min-width: 0; }
.who-name { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
.who-mail { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; }
.who-since { color: var(--text-3); font-size: var(--text-sm); }
.link-btn { display: inline-flex; align-items: center; gap: 4px; justify-self: start; margin-top: 4px; padding: 0; border: 0; background: none; color: var(--danger-text); font-size: var(--text-sm); }
.link-btn svg { width: 13px; height: 13px; }
.h { font-size: var(--text-md); font-weight: var(--weight-semibold); }
.form { display: grid; gap: var(--space-3); }
.form .btn { justify-self: start; }
.note { color: var(--text-2); font-size: var(--text-sm); }
.ic { width: 14px; height: 14px; vertical-align: -2px; }
.block > .btn { justify-self: start; }
.sep { height: 1px; background: var(--border); }
.signout { justify-self: start; color: var(--danger-text); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
input[readonly] { color: var(--text-2); background: var(--surface-2); }
</style>
