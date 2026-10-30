import http from '~/api/http'
import { authUserHeaders } from '~/utils/auth-user'

/** 口令红包，与后端管理接口一致。kind 1 首充加赠 2 定额积分 3 会员天数；status 1 启用 0 停用 */
export interface BonusCodeItem {
  id: number
  code: string
  kind: 1 | 2 | 3
  partner_name: string
  partner_user_id: number
  bonus_points: number
  bonus_valid_days: number
  first_recharge_rate: number
  first_recharge_cap_points: number
  reward_valid_days: number
  member_days: number
  plan_code: string
  max_claims: number
  claimed_count: number
  starts_at: number
  expires_at: number
  status: number
  remark: string
  created_at: number
  updated_at: number
}

export interface BonusCodePayload {
  code?: string
  kind: 1 | 2 | 3
  partner_name: string
  partner_user_id: number
  bonus_points: number
  bonus_valid_days: number
  first_recharge_rate: number
  first_recharge_cap_points: number
  reward_valid_days: number
  member_days: number
  plan_code: string
  max_claims: number
  starts_at: number
  expires_at: number
  status?: number
  remark: string
}

export interface BonusCodeStats {
  claimed: number
  registered: number
  paid: number
  amount: number
  reward_points: number
  bonus_points: number
}

export const adminBonusCodeApi = {
  /** GET /admin/bonus-code?kind&status&partner&partner_user_id&keyword&page&page_size → { items, total } */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/bonus-code', query)
  },
  create(data: BonusCodePayload) {
    return http.post('/admin/bonus-code', data)
  },
  update(id: number, data: BonusCodePayload) {
    return http.put(`/admin/bonus-code/${id}`, data)
  },
  /** 有领取记录的码只会被停用（响应 message 会说明） */
  remove(id: number) {
    return http.delete(`/admin/bonus-code/${id}`)
  },
  /** POST /admin/bonus-code/batch { prefix, count(≤500), ...创建字段 } → { count, codes } */
  batch(data: BonusCodePayload & { prefix: string, count: number }) {
    return http.post('/admin/bonus-code/batch', data)
  },
  stats(id: number) {
    return http.get(`/admin/bonus-code/${id}/stats`)
  },
  /** GET /admin/bonus-code/export?ids=1,2,3 → CSV（带 BOM，最多 2000 个） */
  async exportCsv(ids: number[]): Promise<Blob> {
    const base = useRuntimeConfig().public.apiBaseUrl.replace(/\/$/, '')
    return await $fetch<Blob>(`${base}/admin/bonus-code/export`, {
      query: { ids: ids.join(',') },
      headers: authUserHeaders(),
      responseType: 'blob',
    })
  },
}

export default adminBonusCodeApi
