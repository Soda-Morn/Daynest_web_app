import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Renders long lists in pages: the first `pageSize` items immediately, more
 * as a sentinel element scrolls into view. Keeps DOM size small for
 * thousands of tasks without the complexity of full virtualisation.
 */
export function useIncremental(items, pageSize = 60) {
  const limit = ref(pageSize)
  const sentinel = ref(null)
  const visible = computed(() => items.value.slice(0, limit.value))
  const hasMore = computed(() => items.value.length > limit.value)
  let observer = null

  const more = () => {
    if (hasMore.value) limit.value += pageSize
  }

  // Reset paging when the underlying list identity changes (new filter etc.).
  watch(items, (n, o) => {
    if (n.length < limit.value && o && n.length < o.length) limit.value = pageSize
  })

  watch(sentinel, (el) => {
    observer?.disconnect()
    if (!el || typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: '400px' })
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return { visible, hasMore, sentinel, more, total: computed(() => items.value.length) }
}
