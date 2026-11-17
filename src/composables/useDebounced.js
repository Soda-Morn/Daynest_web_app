import { onScopeDispose, ref, watch } from 'vue'

/** A ref that follows `source` after `delay` ms of quiet. */
export function useDebounced(source, delay = 150) {
  const out = ref(source.value)
  let timer = null
  watch(source, (v) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (out.value = v), delay)
  })
  onScopeDispose(() => timer && clearTimeout(timer))
  return out
}
