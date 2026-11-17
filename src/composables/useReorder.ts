import { computed, ref, type Ref } from 'vue'
import type { TaskInstance } from '@/types/models'

/**
 * Pointer-based list reordering (mouse + touch via the grip handle) with a
 * live preview, plus keyboard nudging (Alt + ↑/↓). Rows must carry
 * `data-reorder-key`.
 */
export function useReorder(items: Ref<TaskInstance[]>, commit: (ordered: TaskInstance[]) => void) {
  const dragKey = ref<string | null>(null)
  const preview = ref<string[] | null>(null)

  const ordered = computed(() => {
    if (!preview.value) return items.value
    const byKey = new Map(items.value.map((i) => [i.key, i]))
    return preview.value.map((k) => byKey.get(k)).filter((i): i is TaskInstance => !!i)
  })

  function grab(_e: PointerEvent, key: string) {
    preview.value = items.value.map((i) => i.key)
    dragKey.value = key
    document.body.classList.add('is-dragging')

    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-reorder-key]')
      const over = el?.dataset.reorderKey
      if (!el || !over || over === key || !preview.value) return
      const r = el.getBoundingClientRect()
      const list = preview.value.filter((k) => k !== key)
      let idx = list.indexOf(over)
      if (idx === -1) return
      if (ev.clientY > r.top + r.height / 2) idx++
      list.splice(idx, 0, key)
      if (list.join() !== preview.value.join()) preview.value = list
    }
    const end = (save: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.body.classList.remove('is-dragging')
      const result = ordered.value
      const changed = preview.value?.join() !== items.value.map((i) => i.key).join()
      preview.value = null
      dragKey.value = null
      if (save && changed) commit(result)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  function nudge(key: string, dir: -1 | 1) {
    const list = [...items.value]
    const i = list.findIndex((x) => x.key === key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    commit(list)
  }

  return { ordered, dragKey, grab, nudge }
}
