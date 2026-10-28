import {
  canAccessManagementCenter,
  clearAuthStorage,
  isValidAuthSession,
} from '~/utils/auth-session'

const NO_ACCESS_QUERY = { reason: 'no_access' } as const

/**
 * 控制台布局鉴权闸门：有效会话且 role 为 10/100 才渲染管理界面。
 */
export function useAuthGate() {
  const localePath = useLocalePath()
  const { user, hydrate, setUser } = useAuth()
  const ready = ref(false)

  async function enforceLogin() {
    if (!import.meta.client)
      return false

    hydrate()

    if (!isValidAuthSession(user.value)) {
      clearAuthStorage()
      setUser(null)
      ready.value = false
      await navigateTo(localePath('/login'))
      return false
    }

    if (!canAccessManagementCenter(user.value)) {
      clearAuthStorage()
      setUser(null)
      ready.value = false
      await navigateTo(localePath({ path: '/login', query: NO_ACCESS_QUERY }))
      return false
    }

    ready.value = true
    return true
  }

  onMounted(() => {
    void enforceLogin()
  })

  return { ready, enforceLogin, user }
}
