import { canAccessSystemSettings, isValidAuthSession } from '~/utils/auth-session'

/** 系统设置页：仅超级管理员（role 100）可访问 */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server)
    return

  const { user, hydrate } = useAuth()
  hydrate()

  if (!isValidAuthSession(user.value) || !canAccessSystemSettings(user.value)) {
    const localePath = useLocalePath()
    return navigateTo(localePath('/user'))
  }
})
