import { useRefreshOnTabVisible } from '~/composables/useRefreshOnTabVisible'

/** 同一 key 在完成后短时间内重复触发时不再请求（应对菜单切换时的重复挂载） */
const DONE_DEDUPE_MS = 500

/**
 * 合并同一 key 下并发中的重复列表请求。
 */
export function useClientListFetch(fetchFn: () => void | Promise<void>) {
  let inflightKey: string | null = null
  let inflightPromise: Promise<void> | null = null
  let lastDoneKey: string | null = null
  let lastDoneAt = 0

  const run = (key: string = '__default__') => {
    if (!import.meta.client)
      return Promise.resolve()

    const now = Date.now()
    if (inflightKey === key && inflightPromise)
      return inflightPromise
    if (lastDoneKey === key && now - lastDoneAt < DONE_DEDUPE_MS)
      return Promise.resolve()

    inflightKey = key
    inflightPromise = Promise.resolve(fetchFn()).finally(() => {
      if (inflightKey === key) {
        lastDoneKey = key
        lastDoneAt = Date.now()
        inflightKey = null
        inflightPromise = null
      }
    })
    return inflightPromise
  }

  useRefreshOnTabVisible(() => {
    lastDoneKey = null
    lastDoneAt = 0
    void run('__tab_visible__')
  })

  return run
}
