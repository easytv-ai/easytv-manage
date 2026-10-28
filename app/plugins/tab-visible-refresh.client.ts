import { ensureTabVisibleListener } from '~/utils/tabVisibleRefresh'

/**
 * 尽早挂上「切回浏览器标签刷新数据」的全局 visibility 监听。
 */
export default defineNuxtPlugin(() => {
  ensureTabVisibleListener()
})
