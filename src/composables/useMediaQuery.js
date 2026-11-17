import { onScopeDispose, ref } from 'vue'
import { MOBILE_BREAKPOINT } from '@/constants'

const shared = new Map()

/** Reactive media query. One listener per query, shared by all components. */
export function useMediaQuery(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return ref(false)
  let entry = shared.get(query)
  if (!entry) {
    const mql = window.matchMedia(query)
    const r = ref(mql.matches)
    const listener = () => (r.value = mql.matches)
    mql.addEventListener('change', listener)
    entry = { ref: r, users: 0, mql, listener }
    shared.set(query, entry)
  }
  entry.users++
  const e = entry
  onScopeDispose(() => {
    if (--e.users === 0) {
      e.mql.removeEventListener('change', e.listener)
      shared.delete(query)
    }
  })
  return e.ref
}

export const useIsMobile = () => useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
