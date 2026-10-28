import { authUserHeaders } from '~/utils/auth-user'
import {
  isAccessTokenInvalidResponse,
  isAuthEntryApiPath,
  SESSION_EXPIRED_QUERY,
  tryBeginUnauthorizedRedirect,
} from '~/utils/auth-session'

const REQUEST_TIMEOUT = 120000

function extractHttpStatus(error: unknown): number | undefined {
  const err = error as {
    statusCode?: number
    status?: number
    response?: { status?: number }
    data?: { statusCode?: number }
  }
  return err.statusCode ?? err.status ?? err.response?.status ?? err.data?.statusCode
}

function handleUnauthorized(url: string) {
  if (!tryBeginUnauthorizedRedirect() || isAuthEntryApiPath(url))
    return

  const { setUser } = useAuth()
  setUser(null)

  const localePath = useLocalePath()
  void navigateTo(localePath({ path: '/login', query: SESSION_EXPIRED_QUERY }))
}

export interface HttpRequestOpts {
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

function resolveUrl(url: string): string {
  if (/^https?:\/\//i.test(url))
    return url
  const base = useRuntimeConfig().public.apiBaseUrl.replace(/\/$/, '')
  return `${base}${url.startsWith('/') ? url : `/${url}`}`
}

async function request(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: Record<string, unknown> | unknown,
  opts?: HttpRequestOpts,
): Promise<any> {
  try {
    const result = await $fetch<any>(resolveUrl(url), {
      method,
      body: body as Record<string, unknown> | undefined,
      query: opts?.query,
      headers: authUserHeaders(opts?.headers),
      timeout: REQUEST_TIMEOUT,
    })
    if (isAccessTokenInvalidResponse(result))
      handleUnauthorized(url)
    return result
  }
  catch (error: unknown) {
    if (extractHttpStatus(error) === 401)
      handleUnauthorized(url)
    return (error as { data?: any }).data
  }
}

export default new class Http {
  get(url: string, query?: Record<string, unknown>, headers?: Record<string, string>) {
    return request(url, 'GET', undefined, { query, headers })
  }

  post(url: string, data?: unknown, opts?: HttpRequestOpts) {
    return request(url, 'POST', data, opts)
  }

  put(url: string, data?: unknown, opts?: HttpRequestOpts) {
    return request(url, 'PUT', data, opts)
  }

  delete(url: string, opts?: HttpRequestOpts & { body?: unknown }) {
    return request(url, 'DELETE', opts?.body, opts)
  }
}()
