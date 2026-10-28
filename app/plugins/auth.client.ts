import { canAccessManagementCenter, clearAuthStorage, isValidAuthSession } from '~/utils/auth-session'

/** 启动时恢复会话，并清除无效的 localStorage 残留 */
export default defineNuxtPlugin({
  name: 'auth-hydrate',
  enforce: 'pre',
  setup() {
    const { hydrate, setUser, user } = useAuth()
    hydrate()
    if (import.meta.client && (
      !isValidAuthSession(user.value)
      || !canAccessManagementCenter(user.value)
    )) {
      clearAuthStorage()
      setUser(null)
    }
  },
})
