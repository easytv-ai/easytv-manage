import http from '~/api/http'

/**
 * 活动管理（T33）：与 easytv-api/API.md 8.6 对齐。
 * CRUD / 结算为 RootAuth，投稿审核为 AdminAuth。
 * status 0 草稿 / 1 进行中 / 2 已结束 / 3 已发奖；投稿 status 0 待审 / 1 通过 / 2 驳回。
 */

export interface CampaignPrize {
  rank_from: number
  rank_to: number
  points: number
  member_days: number
}

export interface CampaignItem {
  id: number
  title: string
  slug: string
  banner_url: string
  rules: string
  tag: string
  starts_at: number
  ends_at: number
  status: number
  /** 后端可能回 JSON 字符串或已解析数组 */
  prizes: CampaignPrize[] | string | null
  model_promo: Record<string, unknown> | string | null
  entries_count: number
  created_at: number
  updated_at: number
}

export interface CampaignPayload {
  title: string
  slug: string
  banner_url: string
  rules: string
  tag: string
  starts_at: number
  ends_at: number
  status: number
  prizes: CampaignPrize[]
  /** JSON 字符串，空串表示无 */
  model_promo?: string
}

export interface CampaignEntry {
  id: number
  campaign_id: number
  work_id: number
  user_id: number
  status: number
  likes_snapshot: number
  rank: number
  prize_points: number
  created_at: number
  work?: { id?: number, title?: string, cover_url?: string } | null
  work_title?: string
  work_cover?: string
  user?: { id?: number, nickname?: string } | null
  nickname?: string
}

export interface CampaignListQuery {
  keyword?: string
  status?: number | string
  page?: number
  page_size?: number
}

export const adminCampaignApi = {
  /** GET /admin/campaign → { items, total } */
  list(query: CampaignListQuery = {}) {
    return http.get('/admin/campaign', query as Record<string, unknown>)
  },
  create(data: CampaignPayload) {
    return http.post('/admin/campaign', data)
  },
  update(id: number, data: CampaignPayload) {
    return http.put(`/admin/campaign/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/campaign/${id}`)
  },
  /** GET /admin/campaign/:id/entries?status=&page=&page_size= → { items, total } */
  entries(id: number, query: { status?: number | string, page?: number, page_size?: number } = {}) {
    return http.get(`/admin/campaign/${id}/entries`, query as Record<string, unknown>)
  },
  /** PUT /admin/campaign/entry/:id/review { action } */
  reviewEntry(entryId: number, data: { action: 'approve' | 'reject' }) {
    return http.put(`/admin/campaign/entry/${entryId}/review`, data)
  },
  /** POST /admin/campaign/:id/settle：结束后按点赞快照发奖，幂等 */
  settle(id: number) {
    return http.post(`/admin/campaign/${id}/settle`)
  },
}

export default adminCampaignApi
