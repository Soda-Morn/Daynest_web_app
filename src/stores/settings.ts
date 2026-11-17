import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings } from '@/types/models'
import { DEFAULT_SETTINGS } from '@/constants'
import { persistence } from '@/services/persistence'

const THEME_KEY = 'daynest.theme'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  let media: MediaQueryList | null = null

  function hydrate(saved: Partial<Settings> | undefined) {
    settings.value = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
    applyTheme()
  }

  function update(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    persistence.saveSettings(settings.value)
    if (patch.theme !== undefined) applyTheme()
  }

  function applyTheme() {
    if (typeof window === 'undefined') return
    const pref = settings.value.theme
    try {
      localStorage.setItem(THEME_KEY, pref)
    } catch {
      /* storage may be unavailable (private mode) */
    }
    media ??= window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    const dark = pref === 'dark' || (pref === 'system' && !!media?.matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }

  // Follow OS theme changes while on "system". One listener for the app lifetime.
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.value.theme === 'system') applyTheme()
    })
  }

  return { settings, hydrate, update, applyTheme }
})
