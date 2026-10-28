type TabVisibleHandler = () => void | Promise<void>

const handlers = new Set<TabVisibleHandler>()
let listening = false
let hiddenAt = 0

/** 离开标签至少这么久，回焦才触发刷新 */
const MIN_HIDDEN_MS = 300

function flushHandlers() {
  for (const fn of [...handlers]) {
    try {
      void fn()
    }
    catch (e) {
      console.error('[refresh-on-tab-visible]', e)
    }
  }
}

function onVisibilityChange() {
  if (typeof document === 'undefined')
    return

  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
    return
  }

  if (document.visibilityState !== 'visible')
    return
  if (!hiddenAt)
    return

  const elapsed = Date.now() - hiddenAt
  hiddenAt = 0
  if (elapsed < MIN_HIDDEN_MS)
    return

  flushHandlers()
}

/** 挂上全局 visibility 监听（可重复调用，只生效一次） */
export function ensureTabVisibleListener() {
  if (listening || typeof document === 'undefined')
    return
  listening = true
  document.addEventListener('visibilitychange', onVisibilityChange)
}

export function registerTabVisibleHandler(handler: TabVisibleHandler): () => void {
  ensureTabVisibleListener()
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
