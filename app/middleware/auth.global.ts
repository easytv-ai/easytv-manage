import {
  canAccessManagementCenter,
  isAuthPublicPath,
  isValidAuthSession,
} from '~/utils/auth-session'

/**
 * 全局路由鉴权（仅客户端）：
 * - /login 公开
 * - 其它页面须有效会话且 role 为 10（管理员）或 100（超级管理员）
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server)
    return

  if (isAuthPublicPath(to.path))
    return

  const { user, hydrate, setUser } = useAuth()
  hydrate()

  if (!isValidAuthSession(user.value)) {
    const localePath = useLocalePath()
    return navigateTo(localePath('/login'))
  }

  if (!canAccessManagementCenter(user.value)) {
    setUser(null)
    const localePath = useLocalePath()
    return navigateTo(localePath({ path: '/login', query: { reason: 'no_access' } }))
  }
})
