import { canAccessManagementCenter, isValidAuthSession } from '~/utils/auth-session'

export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server)
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
