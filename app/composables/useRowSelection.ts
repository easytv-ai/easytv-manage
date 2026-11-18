import type { Ref } from 'vue'

/** 当前页勾选。列表换页或刷新后，不在本页的 id 会自动清掉。 */
export function useRowSelection<T extends { id: number }>(rows: Ref<T[]>) {
  const selected = ref<number[]>([])
  const selectedSet = computed(() => new Set(selected.value))
  const allSelected = computed(() => rows.value.length > 0 && rows.value.every(item => selectedSet.value.has(item.id)))
  const someSelected = computed(() => !allSelected.value && rows.value.some(item => selectedSet.value.has(item.id)))

  function toggleAll() {
    selected.value = allSelected.value ? [] : rows.value.map(item => item.id)
  }

  function toggleOne(id: number, checked: boolean) {
    if (checked)
      selected.value = selected.value.includes(id) ? selected.value : [...selected.value, id]
    else
      selected.value = selected.value.filter(item => item !== id)
  }

  function clearSelection() {
    selected.value = []
  }

  watch(rows, (list) => {
    const ids = new Set(list.map(item => item.id))
    const next = selected.value.filter(id => ids.has(id))
    if (next.length !== selected.value.length)
      selected.value = next
  })

  return { selected, selectedSet, allSelected, someSelected, toggleAll, toggleOne, clearSelection }
}

/** 有限并发执行。fn 返回 true 记成功。 */
export async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<boolean>) {
  const size = Math.max(1, Math.min(limit, items.length))
  let cursor = 0
  let ok = 0
  let fail = 0
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      if (item === undefined)
        return
      try {
        if (await fn(item))
          ok += 1
        else
          fail += 1
      }
      catch {
        fail += 1
      }
    }
  }
  await Promise.all(Array.from({ length: size }, () => worker()))
  return { ok, fail }
}
