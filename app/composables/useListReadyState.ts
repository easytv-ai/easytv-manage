/**
 * 列表页加载态：第一次进页整表转圈，之后切标签 / 保存刷新保留当前表格。
 */
export function useListReadyState() {
  const loading = ref(true)
  const listReady = ref(false)

  function beginListLoad() {
    if (!listReady.value)
      loading.value = true
  }

  function markListReady() {
    listReady.value = true
    loading.value = false
  }

  return { loading, listReady, beginListLoad, markListReady }
}
