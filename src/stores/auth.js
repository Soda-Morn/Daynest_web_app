import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { cameFromRecoveryLink, clearRecoveryLink, cloudEnabled, friendlyError, sb, supabase } from '@/services/supabase'

/**
 * Authentication and profile, backed by Supabase Auth. Passwords never touch
 * our database: Supabase Auth stores and checks them. The session is kept by
 * supabase-js (refreshed automatically) so users stay signed in on reload.
 */

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const AVATAR_MAX = 2 * 1024 * 1024

export const useAuthStore = defineStore('auth', () => {
  const session = shallowRef(null)
  const user = computed(() => session.value?.user ?? null)
  const ready = ref(!cloudEnabled)
  /** True after opening a password-reset link (until the new password is set). */
  const recovery = ref(false)
  const profile = shallowRef(null)

  let readyPromise = null

  /** Restores any saved session and listens for sign-in / sign-out. */
  function init() {
    if (!cloudEnabled) return Promise.resolve()
    if (readyPromise) return readyPromise
    readyPromise = (async () => {
      // Opening a password-reset link signs the user in for recovery.
      recovery.value = cameFromRecoveryLink()
      supabase.auth.onAuthStateChange((event, s) => {
        if (event === 'PASSWORD_RECOVERY') recovery.value = true
        if (event === 'SIGNED_OUT') {
          clearRecoveryLink()
          recovery.value = false
          profile.value = null
        }
        // Watchers key on user id, so token refreshes don't reload any data.
        session.value = s
      })
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      ready.value = true
    })()
    return readyPromise
  }

  /* ---------------- Account actions ---------------- */

  async function signUp(email, password, fullName) {
    const { data, error } = await sb().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${location.origin}/login?confirmed=1`,
      },
    })
    if (error) throw new Error(friendlyError(error))
    // With email confirmation on, an existing address returns a user with no
    // identities (Supabase hides whether the email exists).
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Try signing in.')
    }
    return { needsConfirmation: !data.session }
  }

  async function signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      const e = new Error(friendlyError(error))
      e.unconfirmed = /not confirmed/i.test(error.message)
      throw e
    }
  }

  async function resendConfirmation(email) {
    const { error } = await sb().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/login?confirmed=1` },
    })
    if (error) throw new Error(friendlyError(error))
  }

  async function sendPasswordReset(email) {
    const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` })
    if (error) throw new Error(friendlyError(error))
  }

  /** Sets a new password. From settings, the current password is re-checked first. */
  async function updatePassword(newPassword, currentPassword) {
    if (currentPassword !== undefined) {
      const email = user.value?.email
      if (!email) throw new Error('You’re not signed in.')
      const { error } = await sb().auth.signInWithPassword({ email, password: currentPassword })
      if (error) throw new Error('Your current password is incorrect.')
    }
    const { error } = await sb().auth.updateUser({ password: newPassword })
    if (error) throw new Error(friendlyError(error))
    recovery.value = false
    clearRecoveryLink()
  }

  async function signOut() {
    // scope 'local': this device only; other devices stay signed in.
    const { error } = await sb().auth.signOut({ scope: 'local' })
    if (error && !/session/i.test(error.message)) throw new Error(friendlyError(error))
    session.value = null
    profile.value = null
  }

  /* ---------------- Profile ---------------- */

  async function loadProfile() {
    if (!user.value) return
    const { data, error } = await sb().from('profiles').select('full_name,avatar_url,created_at').eq('id', user.value.id).maybeSingle()
    if (error) throw new Error(friendlyError(error))
    const avatarPath = data?.avatar_url ?? null
    profile.value = {
      fullName: data?.full_name ?? '',
      avatarPath,
      avatarUrl: avatarPath ? await signedAvatarUrl(avatarPath) : null,
      createdAt: user.value.created_at ?? data?.created_at ?? null,
    }
  }

  async function signedAvatarUrl(path) {
    const { data } = await sb()
      .storage.from('avatars')
      .createSignedUrl(path, 60 * 60)
    return data?.signedUrl ?? null
  }

  async function uploadAvatar(file) {
    if (!user.value) throw new Error('You’re not signed in.')
    if (!AVATAR_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPG, WebP or GIF image.')
    if (file.size > AVATAR_MAX) throw new Error('The image must be 2 MB or smaller.')
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `${user.value.id}/avatar-${Date.now()}.${ext}`
    const { error } = await sb().storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(friendlyError(error))
    const old = profile.value?.avatarPath
    const { error: e2 } = await sb().from('profiles').update({ avatar_url: path }).eq('id', user.value.id)
    if (e2) throw new Error(friendlyError(e2))
    if (old) await sb().storage.from('avatars').remove([old])
    await loadProfile()
  }

  async function removeAvatar() {
    if (!user.value || !profile.value?.avatarPath) return
    const path = profile.value.avatarPath
    const { error } = await sb().from('profiles').update({ avatar_url: null }).eq('id', user.value.id)
    if (error) throw new Error(friendlyError(error))
    await sb().storage.from('avatars').remove([path])
    await loadProfile()
  }

  return {
    session,
    user,
    ready,
    recovery,
    profile,
    init,
    signUp,
    signIn,
    resendConfirmation,
    sendPasswordReset,
    updatePassword,
    signOut,
    loadProfile,
    uploadAvatar,
    removeAvatar,
  }
})
