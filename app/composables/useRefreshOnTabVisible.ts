import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { registerTabVisibleHandler } from '~/utils/tabVisibleRefresh'

export interface RefreshOnTabVisibleOptions {
  /** 为 false 时不刷新。默认 true */
  enabled?: MaybeRefOrGetter<boolean>
}

/**
 * 浏览器切到其他标签再回来时，重新拉取当前组件的数据。
 */
export function useRefreshOnTabVisible(
  refresh: () => void | Promise<void>,
  options?: RefreshOnTabVisibleOptions,
) {
  if (!import.meta.client)
    return

  const stop = registerTabVisibleHandler(() => {
    if (options?.enabled !== undefined && !toValue(options.enabled))
      return
    return refresh()
  })

  onScopeDispose(stop)
}
