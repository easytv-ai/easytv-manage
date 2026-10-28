import { canAccessManagementCenter, isValidAuthSession } from '~/utils/auth-session'

export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server)
    return

  const { user, hydrate } = useAuth()
  hydrate()

  if (!isValidAuthSession(user.value) || !canAccessManagementCenter(user.value))
    return

  const localePath = useLocalePath()
  return navigateTo(localePath('/user'))
})
