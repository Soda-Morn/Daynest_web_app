import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** A ref that follows `source` after `delay` ms of quiet. */
export function useDebounced<T>(source: Ref<T>, delay = 150): Ref<T> {
  const out = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(source, (v) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (out.value = v), delay)
  })
  onScopeDispose(() => timer && clearTimeout(timer))
  return out
}
