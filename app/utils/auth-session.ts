import type { AuthUser } from '~/types/auth'
import { AUTH_USER_STORAGE_KEY } from '~/utils/auth-user'

/** 管理员（可访问管理后台） */
export const ROLE_ADMIN = 10
/** 超级管理员 */
export const ROLE_SUPER_ADMIN = 100

export function getUserRole(user: AuthUser | null | undefined): number | null {
  if (!user)
    return null
  const role = Number(user.role)
  return Number.isFinite(role) ? role : null
}

/** role 为 10 或 100 时可访问后台管理中心 */
export function canAccessManagementCenter(user: AuthUser | null | undefined): boolean {
  if (!isValidAuthSession(user))
    return false
  const role = getUserRole(user)
  return role === ROLE_ADMIN || role === ROLE_SUPER_ADMIN
}

/** 仅超级管理员（role 100）可访问系统设置 */
export function canAccessSystemSettings(user: AuthUser | null | undefined): boolean {
  if (!isValidAuthSession(user))
    return false
  return getUserRole(user) === ROLE_SUPER_ADMIN
}

export function adminRoleLabel(role: number | null | undefined): string {
  if (role === ROLE_SUPER_ADMIN)
    return '超级管理员'
  if (role === ROLE_ADMIN)
    return '管理员'
  return ''
}

/** 是否为可视为已登录的有效会话（须同时有用户标识与访问令牌） */
export function isValidAuthSession(user: AuthUser | null | undefined): boolean {
  if (!user)
    return false
  const identity = String(user.username ?? user.email ?? '').trim()
  const token = String(user.access_token ?? user.token ?? '').trim()
  return identity.length > 0 && token.length > 0
}

export function parseStoredAuthUser(raw: string): AuthUser | null {
  try {
    const parsed = JSON.parse(raw) as AuthUser
    return isValidAuthSession(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

export function clearAuthStorage() {
  if (!import.meta.client)
    return
  try {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  }
  catch {
    /* ignore */
  }
}

/** 登录页路径（兼容 i18n 前缀，如 /en/login） */
export function isAuthPublicPath(path: string): boolean {
  const last = path.split('/').filter(Boolean).pop() ?? ''
  return last === 'login'
}

export const SESSION_EXPIRED_QUERY = { reason: 'session_expired' } as const

/** 登录/注册接口的 401 表示凭据错误，不应触发会话过期跳转 */
export function isAuthEntryApiPath(url: string): boolean {
  return /\/user\/(?:login|register|logout)(?:\?|$)/.test(url)
}

let unauthorizedRedirectPending = false

/** 避免并发 401 重复跳转登录页 */
export function tryBeginUnauthorizedRedirect(): boolean {
  if (!import.meta.client || unauthorizedRedirectPending)
    return false
  if (isAuthPublicPath(window.location.pathname))
    return false
  unauthorizedRedirectPending = true
  return true
}

/** API 在 access token 无效时可能返回 HTTP 200 + success:false */
export function isAccessTokenInvalidResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object')
    return false
  const body = data as { success?: boolean, message?: string }
  if (body.success !== false)
    return false
  const msg = String(body.message ?? '').toLowerCase()
  return msg.includes('access token')
    || msg.includes('token 无效')
    || msg.includes('token 無效')
    || msg.includes('invalid access token')
}
