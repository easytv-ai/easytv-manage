import type { AdminUser } from '~/types/easytv-admin'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'

export interface UserApiItem {
  id?: number
  uuid?: string
  username?: string
  email?: string
  nickname?: string
  display_name?: string
  remark?: string
  phone?: string
  mobile?: string
  wechat_id?: string
  wechat_nickname?: string
  identity?: string
  avatar?: string
  status?: number
  role?: number
  tags?: string[] | string
  created_at?: number | string
  createTime?: string
  deleted_at?: number | string | null
  DeletedAt?: number | string | null
  inviter_id?: number
  inviter_nickname?: string
  aff_code?: string
  source?: string
  bonus_code?: string
  invite_blocked?: boolean
}

export interface AdminUserListResult {
  success: boolean
  rows: AdminUser[]
  total: number
  page: number
  pageSize: number
  message?: string
}

export function isApiSuccess(res: any): boolean {
  if (res == null)
    return false
  if (res.success === false || res.error === true)
    return false
  if (typeof res.statusCode === 'number' && res.statusCode >= 400)
    return false
  if (typeof res.code === 'number' && res.code !== 0 && res.code !== 200)
    return false
  return true
}

export function userRoleLabel(role: number): string {
  switch (Number(role)) {
    case 10:
      return '管理员'
    case 100:
      return '超级管理员'
    case 1:
      return '普通用户'
    default:
      return ''
  }
}

export function isHttpAvatar(avatar: string | null | undefined): boolean {
  return !!avatar && /^https?:\/\//i.test(avatar)
}

function toMs(ts: number | string | null | undefined): number | null {
  if (ts == null || ts === '')
    return null
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (!Number.isFinite(ts) || ts === 0)
    return null
  return ts < 1e12 ? ts * 1000 : ts
}

function formatTime(ts: number | string | null | undefined): string {
  const ms = toMs(ts)
  if (ms == null)
    return ''
  const d = new Date(ms)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseTags(raw: UserApiItem['tags']): string[] {
  if (Array.isArray(raw))
    return raw.map(item => String(item).trim()).filter(Boolean)
  if (typeof raw === 'string' && raw.trim())
    return raw.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  return []
}

function identityTags(item: UserApiItem): string[] {
  const fromTags = parseTags(item.tags)
  if (fromTags.length)
    return fromTags
  const identity = String(item.identity ?? '').trim()
  return identity ? [identity] : []
}

function isUserDeleted(item: UserApiItem): boolean {
  const deletedAt = item.deleted_at ?? item.DeletedAt
  if (deletedAt == null || deletedAt === '' || deletedAt === 0 || deletedAt === '0')
    return false
  if (typeof deletedAt === 'number')
    return deletedAt > 0
  const n = Number(deletedAt)
  if (Number.isFinite(n))
    return n > 0
  return true
}

export function mapUserRow(item: UserApiItem): AdminUser {
  const id = Number(item.id ?? 0)
  const username = String(item.username ?? item.email ?? '').trim()
  const nickname = String(item.nickname ?? item.display_name ?? '').trim() || username || `#${id}`
  const status = Number(item.status) === 2 ? 2 : 1
  return {
    id,
    uuid: String(item.uuid ?? '').trim(),
    username,
    nickname,
    mobile: String(item.mobile ?? item.phone ?? '').trim(),
    wechatId: String(item.wechat_id ?? '').trim(),
    wechatNickname: String(item.wechat_nickname ?? '').trim(),
    identity: String(item.identity ?? '').trim() || (parseTags(item.tags)[0] ?? ''),
    avatar: item.avatar?.trim() ? item.avatar.trim() : null,
    status,
    role: Number(item.role ?? 0),
    tags: identityTags(item),
    createTime: String(item.createTime ?? '').trim() || formatTime(item.created_at),
    deleted: isUserDeleted(item),
    inviterId: Number(item.inviter_id ?? 0) || 0,
    inviterNickname: String(item.inviter_nickname ?? '').trim(),
    affCode: String(item.aff_code ?? '').trim(),
    source: String(item.source ?? '').trim(),
    bonusCode: String(item.bonus_code ?? '').trim(),
    inviteBlocked: Boolean(item.invite_blocked),
  }
}

export function parseUserListResponse(raw: unknown): AdminUserListResult | null {
  const res = raw as {
    success?: boolean
    code?: number
    message?: string
    rows?: UserApiItem[]
    list?: UserApiItem[]
    records?: UserApiItem[]
    total?: number
    count?: number
    page?: number
    pageSize?: number
    page_size?: number
    data?: UserApiItem[] | {
      items?: UserApiItem[]
      list?: UserApiItem[]
      records?: UserApiItem[]
      rows?: UserApiItem[]
      total?: number
      count?: number
      page?: number
      pageSize?: number
      page_size?: number
      data?: {
        items?: UserApiItem[]
        list?: UserApiItem[]
        records?: UserApiItem[]
        rows?: UserApiItem[]
        total?: number
        count?: number
        page?: number
        pageSize?: number
        page_size?: number
      }
    }
  }

  if (!isApiSuccess(res))
    return null

  if (Array.isArray(res.rows)) {
    return {
      success: true,
      rows: res.rows.map(mapUserRow),
      total: res.total ?? res.count ?? res.rows.length,
      page: res.page ?? 1,
      pageSize: res.pageSize ?? res.page_size ?? CONSOLE_DEFAULT_PAGE_SIZE,
    }
  }

  const payload = (!Array.isArray(res.data) && res.data && 'data' in res.data)
    ? res.data.data ?? res.data
    : res.data
  const items = Array.isArray(payload)
    ? payload
    : payload?.items ?? payload?.list ?? payload?.records ?? payload?.rows ?? res.list ?? res.records ?? []
  const total = Array.isArray(payload)
    ? (res.total ?? res.count ?? items.length)
    : (payload?.total ?? payload?.count ?? res.total ?? res.count ?? items.length)

  return {
    success: true,
    rows: items.map(mapUserRow),
    total,
    page: (Array.isArray(payload) ? res.page : payload?.page) ?? res.page ?? 1,
    pageSize: (Array.isArray(payload) ? (res.pageSize ?? res.page_size) : (payload?.pageSize ?? payload?.page_size)) ?? CONSOLE_DEFAULT_PAGE_SIZE,
  }
}
