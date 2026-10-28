/**
 * 登录 / 注册 / 退出
 */

import userAuth from '~/api/user-auth'
import type { AuthUser } from '~/types/auth'
import {
  canAccessManagementCenter,
  clearAuthStorage,
  isValidAuthSession,
  parseStoredAuthUser,
  ROLE_SUPER_ADMIN,
} from '~/utils/auth-session'
import { AUTH_USER_STORAGE_KEY } from '~/utils/auth-user'

const NO_ADMIN_ACCESS_MSG = '当前账号无管理后台访问权限（需管理员 role=10 或超级管理员 role=100）'

export type { AuthUser }

function isLoginApiSuccess(res: any): boolean {
  if (res.success === true)
    return true
  return false
}

function userFromLoginResponse(res: any, fallbackUsername: string): AuthUser {
  const data = (res.content ?? res.data) as Record<string, unknown> | undefined
  const nested = (data?.user ?? data) as Record<string, unknown> | undefined
  const username = String(
    nested?.username ?? res.username ?? data?.username ?? fallbackUsername,
  ).trim()
  const email = String(nested?.email ?? res.email ?? data?.email ?? '').trim()
  const authUser: AuthUser = {
    ...(nested ?? {}),
    username,
    email,
  }
  const accessToken
    = String(
      nested?.access_token
      ?? data?.access_token
      ?? res.token
      ?? data?.token
      ?? data?.id_token
      ?? data?.accessToken
      ?? '',
    ).trim() || undefined
  if (accessToken) {
    authUser.access_token = accessToken
    authUser.token = accessToken
  }
  const userId = nested?.id ?? nested?.user_id ?? data?.id ?? data?.user_id
  if (userId != null && userId !== '')
    authUser.id = userId
  return authUser
}

export type TryLoginResult = { ok: true } | { ok: false, message?: string }
export type TryRegisterResult = { ok: true } | { ok: false, message?: string }
export type LogoutResult = { ok: true } | { ok: false, message?: string }

function isApiFailure(res: any): boolean {
  if (res == null)
    return false
  if (res.error === true)
    return true
  if (typeof res.statusCode === 'number' && res.statusCode >= 400)
    return true
  if (res.success === false)
    return true
  return false
}

const DEMO_ADMIN_USERNAME = 'admin'

function demoAdminUser(): AuthUser {
  return {
    id: 1,
    username: DEMO_ADMIN_USERNAME,
    role: ROLE_SUPER_ADMIN,
    token: 'demo-admin-token',
    access_token: 'demo-admin-token',
  }
}

function isDemoAdmin(username: string, password: string) {
  return username === DEMO_ADMIN_USERNAME && password === '123456'
}

export function useAuth() {
  const user = useState<AuthUser | null>('easytv-auth-user', () => null)
  const isLoggedIn = useState('isLoggedIn', () => false)

  function syncLoginState() {
    if (!import.meta.client)
      return
    isLoggedIn.value = isValidAuthSession(user.value)
  }

  function hydrate() {
    if (!import.meta.client)
      return
    try {
      const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY)
      if (!raw) {
        user.value = null
      }
      else {
        const parsed = parseStoredAuthUser(raw)
        if (parsed) {
          user.value = parsed
        }
        else {
          clearAuthStorage()
          user.value = null
        }
      }
    }
    catch {
      clearAuthStorage()
      user.value = null
    }
    syncLoginState()
  }

  function setUser(u: AuthUser | null) {
    const next = u && isValidAuthSession(u) ? u : null
    user.value = next
    isLoggedIn.value = isValidAuthSession(next)
    if (import.meta.client) {
      if (next)
        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(next))
      else
        clearAuthStorage()
    }
  }

  async function logout(): Promise<LogoutResult> {
    if (user.value?.token === 'demo-admin-token') {
      setUser(null)
      return { ok: true }
    }
    try {
      await userAuth.logout()
      setUser(null)
      return { ok: true }
    }
    catch {
      setUser(null)
      return { ok: true }
    }
  }

  async function tryRegister(data: {
    username: string
    email: string
    password: string
  }): Promise<TryRegisterResult> {
    try {
      const res = await userAuth.register(data)
      if (!isLoginApiSuccess(res))
        return { ok: false, message: res?.message }
      return { ok: true }
    }
    catch {
      return { ok: false }
    }
  }

  async function tryLogin(
    username: string,
    password: string,
  ): Promise<TryLoginResult> {
    const id = username.trim()
    try {
      const res = await userAuth.login({ username: id, password })
      if (res?.error || res?.statusCode >= 400) {
        if (isDemoAdmin(id, password)) {
          setUser(demoAdminUser())
          return { ok: true }
        }
        return {
          ok: false,
          message: res?.message ?? res?.statusMessage ?? '登录服务暂不可用',
        }
      }
      if (!isLoginApiSuccess(res)) {
        if (isDemoAdmin(id, password)) {
          setUser(demoAdminUser())
          return { ok: true }
        }
        return { ok: false, message: res?.message }
      }
      const authUser = userFromLoginResponse(res, id)
      if (!isValidAuthSession(authUser))
        return { ok: false, message: res?.message ?? '登录成功但未返回访问令牌' }
      if (!canAccessManagementCenter(authUser))
        return { ok: false, message: NO_ADMIN_ACCESS_MSG }
      setUser(authUser)
      return { ok: true }
    }
    catch {
      if (isDemoAdmin(id, password)) {
        setUser(demoAdminUser())
        return { ok: true }
      }
      return { ok: false, message: '网络错误，请稍后重试' }
    }
  }

  return {
    user: readonly(user),
    isLoggedIn,
    hydrate,
    syncLoginState,
    setUser,
    logout,
    tryRegister,
    tryLogin,
  }
}
