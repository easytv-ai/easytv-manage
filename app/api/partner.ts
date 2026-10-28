import http from '~/api/http'

/**
 * 渠道伙伴计划（T34）：与 easytv-api/API.md 9.3 对齐。
 * status 0 待审 / 1 已通过 / 2 已驳回 / 3 已停用；rebate_rate 为 0 时取全局 GrowthPartnerRebateRate。
 */

export type PartnerKind = 'mcn' | 'school' | 'kol' | 'dev' | 'other'
export type PartnerCustomerSource = 'code' | 'link' | 'manual'

export interface AdminPartner {
  id: number
  user_id: number
  /** 申请人昵称 */
  nickname?: string
  name: string
  kind: PartnerKind | string
  contact: string
  intro: string
  /** 审核通过时后端生成的 6 位专属码 */
  code: string
  rebate_rate: number
  status: number
  remark: string
  customers: number
  paid_users: number
  amount_total: number
  rebate_total: number
  applied_at: number
  reviewed_at: number
  reviewed_by: number
}

export interface PartnerListQuery {
  status?: number | string
  keyword?: string
  page?: number
  page_size?: number
}

export interface PartnerReviewPayload {
  action: 'approve' | 'reject' | 'disable'
  /** 0 ~ 1，留空表示沿用全局默认返佣比例 */
  rebate_rate?: number
  /** 驳回必填 */
  remark?: string
}

export interface PartnerCustomer {
  id: number
  partner_id: number
  user_id: number
  nickname?: string
  source: PartnerCustomerSource | string
  first_paid_at: number
  amount: number
  rebate: number
  created_at: number
}

export const adminPartnerApi = {
  /** GET /admin/partner?status=&keyword=&page=&page_size= → { items, total }（待审优先） */
  list(query: PartnerListQuery = {}) {
    return http.get('/admin/partner', query as Record<string, unknown>)
  },
  /** PUT /admin/partner/:id/review（Root）→ 更新后的伙伴 */
  review(id: number, data: PartnerReviewPayload) {
    return http.put(`/admin/partner/${id}/review`, data)
  },
  /** GET /admin/partner/:id/customers?page&page_size → { items, total } */
  customers(id: number, query: { page?: number, page_size?: number } = {}) {
    return http.get(`/admin/partner/${id}/customers`, query as Record<string, unknown>)
  },
}

export default adminPartnerApi
