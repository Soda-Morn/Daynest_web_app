import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { currentSync, useBootstrap } from './useBootstrap'
import { confirmDialog } from './useDialogs'
import { useToast } from './useToast'
import { closeDb } from '@/services/db'
import { persistence } from '@/services/persistence'

/**
 * Sign-out with care for unsynced work:
 *  - everything synced → sign out and delete this device's copy of the
 *    account (privacy on shared computers);
 *  - unsynced changes → warn; if the user goes ahead, the copy is kept on
 *    this device and syncs the next time they sign in here.
 */
export function useAccount() {
  const auth = useAuthStore()
  const router = useRouter()
  const toast = useToast()
  const { unload } = useBootstrap()

  async function signOut() {
    const userId = auth.user?.id
    const sync = currentSync()
    // Write edits still in memory first, so they are counted (and kept).
    await persistence.flush()
    let pending = persistence.unsavedCount()
    if (sync) {
      await sync.push()
      // If the outbox can't be read, assume there are changes: never delete unsynced work.
      pending += await sync.pendingCount().catch(() => 1)
    }
    if (pending > 0) {
      const ok = await confirmDialog({
        title: 'Some changes haven’t synced yet',
        message: `${pending} change${pending === 1 ? '' : 's'} couldn’t reach the server (are you offline?). If you sign out, they stay on this device and sync the next time you sign in here.`,
        confirmLabel: 'Sign out anyway',
      })
      if (!ok) return
    }
    try {
      await auth.signOut()
    } catch (e) {
      toast.error(e.message)
      return
    }
    await unload()
    if (userId && pending === 0) await deleteLocalCopy(`daynest-user-${userId}`)
    await router.replace({ name: 'login' })
  }

  return { signOut }
}

function deleteLocalCopy(name) {
  return closeDb().then(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(name)
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      }),
  )
}
