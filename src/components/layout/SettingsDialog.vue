<script setup>
import { computed, ref, watch } from 'vue'
import { Download, LogOut, MonitorDown, Upload } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { cloudEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { useAccount } from '@/composables/useAccount'
import Modal from '@/components/ui/Modal.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useCollectionsStore } from '@/stores/collections'
import { useTaskStore } from '@/stores/tasks'
import { useToast } from '@/composables/useToast'
import { confirmDialog } from '@/composables/useDialogs'
import { notificationSupport, requestNotificationPermission } from '@/composables/useReminders'
import { canInstall, installed, isIOS, promptInstall } from '@/pwa/pwa'
import { REMINDER_OPTIONS } from '@/constants'
import { createBackup, downloadJson, parseBackup } from '@/services/backup'
import { persistence } from '@/services/persistence'
import { ValidationError } from '@/utils/validation'

const ui = useUiStore()
const settings = useSettingsStore()
const collections = useCollectionsStore()
const tasks = useTaskStore()
const toast = useToast()

const auth = useAuthStore()
const router = useRouter()
const { signOut } = useAccount()
function goAccount() {
  ui.settingsOpen = false
  void router.push({ name: 'account' })
}
function doSignOut() {
  ui.settingsOpen = false
  void signOut()
}

const name = ref(settings.settings.userName)
watch(
  () => ui.settingsOpen,
  (o) => o && (name.value = settings.settings.userName),
)

function saveName() {
  const n = name.value.trim().slice(0, 60)
  if (n !== settings.settings.userName) settings.update({ userName: n })
}

/* Permission is only requested here, after the user turns reminders on. */
const permission = ref(notificationSupport())
async function toggleReminders(on) {
  if (on) {
    const granted = await requestNotificationPermission()
    permission.value = notificationSupport()
    if (!granted) toast.show('System notifications aren’t allowed, so reminders will appear inside Daynest.')
  }
  settings.update({ remindersEnabled: on })
}
const notifyHint = computed(() => {
  switch (permission.value) {
    case 'unsupported':
      return 'This browser has no system notifications; reminders appear inside Daynest.'
    case 'denied':
      return 'Notifications are blocked in your browser settings; reminders appear inside Daynest.'
    default:
      return 'Shown while Daynest is open or running in the background. Not guaranteed when fully closed.'
  }
})
function setDefaultReminder(v) {
  settings.update({ defaultReminder: v === '' ? null : +v })
}

const ios = isIOS()
async function install() {
  if (await promptInstall()) toast.show('Daynest is installed.')
}

function exportData() {
  const backup = createBackup({
    tasks: tasks.tasks,
    calendars: collections.calendars,
    lists: collections.lists,
    settings: settings.settings,
  })
  downloadJson(backup, `daynest-backup-${ui.today}.json`)
}

const fileInput = ref(null)
async function importData(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  // Restoring replaces everything; with an account that would not reach the server, so it is local-only.
  if (!file || cloudEnabled) return
  try {
    const backup = parseBackup(await file.text())
    const ok = await confirmDialog({
      title: 'Replace your data?',
      message: `This replaces everything with ${backup.tasks.length} tasks, ${backup.calendars.length} calendars and ${backup.lists.length} lists from the backup.`,
      confirmLabel: 'Import',
      danger: true,
    })
    if (!ok) return
    collections.hydrate(backup.calendars, backup.lists)
    tasks.replaceAll(backup.tasks)
    persistence.replaceAll({ tasks: tasks.tasks, calendars: backup.calendars, lists: backup.lists, settings: undefined })
    toast.show('Backup imported')
  } catch (err) {
    toast.error(err instanceof ValidationError ? err.message : 'Could not read that file.')
  }
}

async function eraseAll() {
  const ok = await confirmDialog({
    title: 'Delete all tasks?',
    message: `All ${tasks.count} tasks will be permanently deleted. Calendars, lists and settings are kept. Export a backup first if you might need them.`,
    confirmLabel: 'Delete all tasks',
    danger: true,
  })
  if (!ok) return
  tasks.deleteTasks(tasks.tasks.map((t) => t.id))
  toast.show('All tasks deleted')
}

const weekStart = computed(() => String(settings.settings.weekStartsOn))

const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
</script>

<template>
  <Modal :open="ui.settingsOpen" title="Settings" size="md" @close="ui.settingsOpen = false">
    <div class="settings">
      <section v-if="cloudEnabled" class="grp">
        <h3 class="section-title">Account</h3>
        <div class="line">
          <span>{{ auth.user?.email }}<small>Profile, password and sync</small></span>
          <button type="button" class="btn btn-secondary btn-sm" @click="goAccount">Manage account</button>
        </div>
      </section>
      <section v-else class="grp">
        <h3 class="section-title">Profile</h3>
        <label class="field">
          <span class="field-label">Your name</span>
          <input v-model="name" class="input" maxlength="60" placeholder="Used for your greeting" @blur="saveName" @keydown.enter="saveName" />
        </label>
      </section>

      <section class="grp">
        <h3 class="section-title">Appearance</h3>
        <div class="line">
          <span>Theme</span>
          <Segmented :model-value="settings.settings.theme" :options="themeOptions" label="Theme" @update:model-value="(v) => settings.update({ theme: v })" />
        </div>
        <div class="line">
          <span>Week starts on</span>
          <Segmented
            :model-value="weekStart"
            :options="[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]"
            label="Week starts on"
            @update:model-value="(v) => settings.update({ weekStartsOn: +v })"
          />
        </div>
        <div class="line">
          <span>Time format</span>
          <Segmented
            :model-value="settings.settings.timeFormat"
            :options="[{ value: '12h', label: '1:00 PM' }, { value: '24h', label: '13:00' }]"
            label="Time format"
            @update:model-value="(v) => settings.update({ timeFormat: v })"
          />
        </div>
      </section>

      <section class="grp">
        <h3 class="section-title">Tasks</h3>
        <label class="line">
          <span>Default calendar</span>
          <select class="select narrow" :value="collections.defaultCalendarId" @change="settings.update({ defaultCalendarId: ($event.target).value })">
            <option v-for="c in collections.sortedCalendars" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
      </section>

      <section class="grp">
        <h3 class="section-title">Reminders</h3>
        <label class="line">
          <span>Task reminders<small>{{ notifyHint }}</small></span>
          <input type="checkbox" class="switch" :checked="settings.settings.remindersEnabled" @change="toggleReminders(($event.target).checked)" />
        </label>
        <label class="line">
          <span>Default for new timed tasks</span>
          <select class="select narrow" :value="settings.settings.defaultReminder ?? ''" @change="setDefaultReminder(($event.target).value)">
            <option value="">No reminder</option>
            <option v-for="o in REMINDER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
      </section>

      <section v-if="!installed" class="grp">
        <h3 class="section-title">Install Daynest</h3>
        <template v-if="canInstall">
          <p class="note">Open Daynest in its own window from your desktop or home screen. It works offline.</p>
          <button type="button" class="btn btn-primary install-btn" @click="install"><MonitorDown />Install app</button>
        </template>
        <p v-else-if="ios" class="note">On iPhone or iPad: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
        <p v-else class="note">Use your browser’s menu (“Install app” or “Add to Home screen”) to install Daynest. Some browsers don’t support installing web apps.</p>
      </section>

      <section class="grp">
        <h3 class="section-title">Your data</h3>
        <p v-if="cloudEnabled" class="note">Your {{ tasks.count }} tasks are saved to your Daynest account and a copy is kept on this device, so it works offline. Export a backup any time.</p>
        <p v-else class="note">Everything is stored privately on this device ({{ tasks.count }} tasks) and works offline. Other Daynest windows on this device stay in sync. To move to another device, export a backup and import it there.</p>
        <div class="btns">
          <button type="button" class="btn btn-secondary" @click="exportData"><Download />Export backup</button>
          <button v-if="!cloudEnabled" type="button" class="btn btn-secondary" @click="fileInput?.click()"><Upload />Import backup</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData" />
        </div>
        <button type="button" class="btn btn-ghost danger" :disabled="!tasks.count" @click="eraseAll">Delete all tasks…</button>
      </section>

      <section v-if="cloudEnabled" class="grp">
        <button type="button" class="btn btn-secondary signout" @click="doSignOut"><LogOut />Sign out</button>
      </section>

      <section class="grp">
        <h3 class="section-title">Keyboard shortcuts</h3>
        <ul class="keys">
          <li><span class="kbd">N</span> New task</li>
          <li><span class="kbd">/</span> Search</li>
          <li><span class="kbd">T</span> Go to today</li>
          <li><span class="kbd">←</span><span class="kbd">→</span> Previous / next</li>
          <li><span class="kbd">M</span><span class="kbd">W</span><span class="kbd">D</span><span class="kbd">A</span> Calendar views</li>
          <li><span class="kbd">Alt</span>+<span class="kbd">↑</span><span class="kbd">↓</span> Reorder a task</li>
        </ul>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.settings { display: grid; gap: var(--space-6); }
.grp { display: grid; gap: var(--space-3); }
.line { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.line > span { display: grid; font-weight: var(--weight-medium); }
.line small { font-weight: var(--weight-regular); color: var(--text-3); font-size: var(--text-xs); }
.narrow { width: auto; min-width: 160px; }
.install-btn { justify-self: start; }
.signout { justify-self: start; color: var(--danger-text); }
.note { font-size: var(--text-sm); color: var(--text-2); }
.btns { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.danger { color: var(--danger); justify-self: start; }
.keys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: var(--text-sm); color: var(--text-2); }
.keys li { display: flex; align-items: center; gap: 4px; }
.keys .kbd:last-of-type { margin-right: 6px; }
.switch {
  appearance: none;
  position: relative;
  width: 40px;
  height: 24px;
  border-radius: 12px;
  background: var(--border-strong);
  cursor: pointer;
  transition: background var(--dur) var(--ease);
  flex-shrink: 0;
}
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--dur) var(--ease-out); }
.switch:checked { background: var(--primary); }
.switch:checked::after { transform: translateX(16px); }
@media (max-width: 767px) { .keys { display: none; } .grp:last-child { display: none; } }
</style>
