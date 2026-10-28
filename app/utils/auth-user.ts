export const AUTH_USER_STORAGE_KEY = 'easytv_manage_auth_user'

function readAuthUser(): { id?: unknown, access_token?: unknown, token?: unknown } | null {
  if (!import.meta.client)
    return null
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY)
    if (!raw)
      return null
    return JSON.parse(raw) as { id?: unknown, access_token?: unknown, token?: unknown }
  }
  catch {
    return null
  }
}

/** 已登录用用户 id，未登录固定为 -1 */
export function getUserId(): string {
  const id = readAuthUser()?.id
  if (id != null && id !== '')
    return String(id)
  return '-1'
}

export function getAccessToken(): string {
  const user = readAuthUser()
  return String(user?.access_token ?? user?.token ?? '').trim()
}

export function authUserHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'EasyTV-User': getUserId(),
    ...extra,
  }
  const accessToken = getAccessToken()
  if (accessToken)
    headers.Authorization = `Bearer ${accessToken}`
  return headers
}
