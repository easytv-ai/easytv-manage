import http from '~/api/http'

/** 付费域管理接口，路径与 easytv-api/API.md 6.2 对齐。 */

export type PlanPayload = {
  code?: string
  name?: string
  featured?: boolean
  monthly_origin?: number
  monthly_price?: number
  monthly_points?: number
  add_on_points?: number
  add_on_price?: number
  concurrent?: number
  storage_gb?: number
  sort_order?: number
  status?: 1 | 2
}

export type PackPayload = {
  code?: string
  points?: number
  valid_days?: number
  origin?: number
  member_price?: number
  featured?: boolean
  sort_order?: number
  status?: 1 | 2
}

export type PromoPayload = {
  enabled: boolean
  title: string
  subtitle: string
  ends_at: number
  cycle_rate: Record<string, number>
  cycle_off_label: Record<string, string>
  team_seat_min: number
  team_seat_max: number
  team_seat_rate: number
  /** 全站顶部倒计时条（T18/T20）：落 GrowthPromoBanner* setting 键 */
  banner_enabled?: boolean
  banner_link?: string
}

export const adminPlanApi = {
  list() {
    return http.get('/admin/plan')
  },
  create(data: PlanPayload) {
    return http.post('/admin/plan', data)
  },
  update(id: number, data: PlanPayload) {
    return http.put(`/admin/plan/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/plan/${id}`)
  },
}

export const adminPackApi = {
  list() {
    return http.get('/admin/points-pack')
  },
  create(data: PackPayload) {
    return http.post('/admin/points-pack', data)
  },
  update(id: number, data: PackPayload) {
    return http.put(`/admin/points-pack/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/points-pack/${id}`)
  },
}

export const adminPromoApi = {
  get() {
    return http.get('/admin/billing/promo')
  },
  save(data: PromoPayload) {
    return http.put('/admin/billing/promo', data)
  },
}

export const adminOrderApi = {
  list(query: Record<string, unknown>) {
    return http.get('/admin/order', query)
  },
  close(id: number) {
    return http.post(`/admin/order/${id}/close`)
  },
  /** 线下收款 / 联调：手动标记已支付并履约 */
  markPaid(id: number) {
    return http.post(`/admin/order/${id}/mark-paid`)
  },
  refund(id: number, reason: string) {
    return http.post(`/admin/order/${id}/refund`, { reason })
  },
}

export const adminRechargeApi = {
  /** 充值记录（只读）：GET /admin/recharge?status=&page=&page_size= */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/recharge', query)
  },

  /** 主动查单（防 webhook 漏单）：POST /user/recharge/status */
  status(tradeNo: string) {
    return http.post('/user/recharge/status', { trade_no: tradeNo })
  },
}

export const adminBillApi = {
  /** 资金流水（只读）：GET /admin/bills?user_id=&page=&page_size= */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/bills', query)
  },
}

export const adminWalletApi = {
  list(query: Record<string, unknown>) {
    return http.get('/admin/wallet', query)
  },
  /** delta 正数补发、负数扣减 */
  adjust(userId: number, delta: number, reason: string, validDays?: number) {
    return http.post(`/admin/wallet/${userId}/adjust`, { delta, reason, valid_days: validDays })
  },
  logs(query: Record<string, unknown>) {
    return http.get('/admin/points/log', query)
  },
}

export type ModelPricePayload = {
  model?: string
  type?: 'text' | 'image' | 'video' | 'audio'
  label?: string
  unit?: 'second' | 'image' | 'call'
  points_per_unit?: number
  member_points_per_unit?: number
  status?: 1 | 2
  /** 促销价（T18/T20）：0 取消促销；起止为 Unix 秒，0 表示立即 / 不限 */
  promo_points_per_unit?: number
  promo_label?: string
  promo_starts_at?: number
  promo_ends_at?: number
  /** 该模型支持的时长秒数，逗号分隔（如 "4,8,12"）；空串表示不限 */
  durations?: string
  /** 该模型支持的分辨率，逗号分隔（如 "512P,768P,1080P"）；空串表示不限 */
  resolutions?: string
  /** 1=图生视频的首帧图必须与输出尺寸一致，服务端提交前自动裁切 */
  frame_match?: 0 | 1
  /** 图片模型参考图输入方式：none / edits / url，空串=按模型名推断 */
  image_input?: string
  /** 媒体能力标签（API.md 23.1），逗号分隔；空串=按模型名推断 */
  abilities?: string
}

export const adminModelPriceApi = {
  /** GET /admin/model-price：page / page_size / sort_by(model|type|unit|points_per_unit) / order(asc|desc) */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/model-price', query)
  },
  create(data: ModelPricePayload) {
    return http.post('/admin/model-price', data)
  },
  update(id: number, data: ModelPricePayload) {
    return http.put(`/admin/model-price/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/model-price/${id}`)
  },
  /** POST /admin/model-price/:id/sync-gateway：从网关参数表填 durations / resolutions / abilities（API.md 28.3） */
  syncGateway(id: number, force = false) {
    return http.post(`/admin/model-price/${id}/sync-gateway${force ? '?force=1' : ''}`, {})
  },
  /** POST /admin/model-price/sync-gateway：全部定价行逐个同步 */
  syncGatewayAll(force = false) {
    return http.post(`/admin/model-price/sync-gateway${force ? '?force=1' : ''}`, {})
  },
  /** GET /admin/model-price/health?days=7：按模型看近 N 天成功率与失败原因（API.md 37） */
  health(days = 7) {
    return http.get('/admin/model-price/health', { days })
  },
}

/** 模型健康（API.md 37）：fail_rate 为百分比 0–100；warn=失败率过线且样本足够 */
export interface ModelHealth {
  model: string
  total: number
  failed: number
  fail_rate: number
  warn: boolean
  /** 样本 ≥ 10 且失败率 ≥ 90%：建议下架（API.md 37.3） */
  suggest_offline?: boolean
  top_errors: Array<{ message: string, count: number }>
}
