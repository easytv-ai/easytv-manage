import http from '~/api/http'

/**
 * 站外投稿审核（T31）：与 easytv-api/API.md 8.5 对齐。
 * status 0 待审 / 1 通过 / 2 驳回；platform douyin | xiaohongshu | bilibili | other。
 */

export type UgcPlatform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'other'

export interface UgcSubmission {
  id: number
  user_id: number
  /** 列表附带的投稿人昵称（API.md：items 含 user 昵称） */
  user?: { id?: number, nickname?: string } | null
  nickname?: string
  work_id: number
  /** 列表附带的关联作品标题 / 封面 */
  work?: { id?: number, title?: string, cover_url?: string } | null
  work_title?: string
  work_cover?: string
  platform: UgcPlatform | string
  url: string
  duration_tier: number
  likes: number
  status: number
  points: number
  viral: number | boolean
  reviewed_by: number
  reviewed_at: number
  remark: string
  created_at: number
}

export interface UgcListQuery {
  status?: number | string
  platform?: string
  keyword?: string
  page?: number
  page_size?: number
}

export interface UgcReviewPayload {
  action: 'approve' | 'reject'
  duration_tier: 30 | 60 | 120
  likes: number
  remark?: string
  /** 通过时用作品封面创建首页 Banner（后端处理） */
  to_banner?: boolean
}

export const adminUgcApi = {
  /** GET /admin/ugc?status=&platform=&keyword=&page=&page_size= → { items, total } */
  list(query: UgcListQuery = {}) {
    return http.get('/admin/ugc', query as Record<string, unknown>)
  },
  /** PUT /admin/ugc/:id/review */
  review(id: number, data: UgcReviewPayload) {
    return http.put(`/admin/ugc/${id}/review`, data)
  },
}

export default adminUgcApi
