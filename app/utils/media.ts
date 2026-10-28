import { OFFICIAL_SITE_URL } from '~/utils/officialSite'

/** 列表封面缺省图，接口未返回封面时使用 */
export const DEFAULT_WORK_COVER = '/images/work-cover.svg'

/**
 * 媒体地址解析（管理端与创作台不同源）：
 * - `/upload/...`：后端本地存储，拼 API Base URL
 * - `http(s)://...`：原样
 * - 其它相对路径（如 `/images/showcase/x.jpg`）：创作台 public 静态资源，拼官网地址
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  const value = String(url ?? '').trim()
  if (!value)
    return ''
  if (/^(https?:|data:|blob:)/i.test(value))
    return value
  if (value.startsWith('/upload/')) {
    const base = String(useRuntimeConfig().public.apiBaseUrl || '').replace(/\/$/, '')
    return `${base}${value}`
  }
  return `${OFFICIAL_SITE_URL}${value.startsWith('/') ? '' : '/'}${value}`
}
