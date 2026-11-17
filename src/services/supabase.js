import { createClient } from '@supabase/supabase-js'

/**
 * The single Supabase client for the app.
 *
 * Configured from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see
 * .env.example). Only the public anon/publishable key belongs in the
 * frontend: every table is protected by Row Level Security, so the key alone
 * grants nothing. The service-role key must never be used here.
 *
 * Without these variables Daynest runs in local-only mode (no accounts,
 * data stays in this browser) exactly as before.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const cloudEnabled = !!(url && anonKey)

export const supabase = cloudEnabled
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true, // keep users signed in across reloads
        autoRefreshToken: true,
        detectSessionInUrl: true, // email verification / password reset links
        flowType: 'pkce',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

/**
 * True once a password-reset email link has signed this browser in for
 * recovery. Subscribed at import time so the PASSWORD_RECOVERY event that
 * supabase-js fires while it reads the link is never missed. Only this event
 * unlocks the reset form: visiting /reset-password with an ordinary session
 * does not, so nobody can change the password without the current one.
 */
let recoveryFromLink = false
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recoveryFromLink = true
  else if (event === 'SIGNED_OUT') recoveryFromLink = false
})
export const cameFromRecoveryLink = () => recoveryFromLink
export function clearRecoveryLink() {
  recoveryFromLink = false
}

/** For code paths that only run in cloud mode. */
export function sb() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Turns Supabase / network errors into short, human messages. */
export function friendlyError(e) {
  const err = e
  const msg = err?.message ?? String(e)
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Can’t reach the server. Check your internet connection.'
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first. Check your inbox for the link.'
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.'
  if (/Password should|weak password|password.*characters/i.test(msg))
    return 'Choose a password with at least 6 characters.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.'
  if (/same_password|different from the old/i.test(msg)) return 'Choose a password you haven’t used for this account.'
  if (err?.code === '42501' || /row-level security/i.test(msg)) return 'You don’t have permission to do that.'
  return msg || 'Something went wrong. Please try again.'
}
