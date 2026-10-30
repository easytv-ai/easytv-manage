import http from '~/api/http'

/** 内容运营：Banner / 公告，路径与后端管理接口一致 */

export type BannerPayload = {
  title?: string
  subtitle?: string
  tag?: string
  cover_url?: string
  video_url?: string
  link_url?: string
  cta?: string
  sort_order?: number
  status?: 1 | 2
  starts_at?: number
  ends_at?: number
}

export type NoticePayload = {
  title?: string
  content?: string
  type?: 'system' | 'activity'
  pinned?: boolean
  status?: 1 | 2
}

export const adminBannerApi = {
  list(query: Record<string, unknown>) {
    return http.get('/admin/banner', query)
  },
  create(data: BannerPayload) {
    return http.post('/admin/banner', data)
  },
  update(id: number, data: BannerPayload) {
    return http.put(`/admin/banner/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/banner/${id}`)
  },
}

export const adminNoticeApi = {
  list(query: Record<string, unknown>) {
    return http.get('/admin/notice', query)
  },
  create(data: NoticePayload) {
    return http.post('/admin/notice', data)
  },
  update(id: number, data: NoticePayload) {
    return http.put(`/admin/notice/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/notice/${id}`)
  },
}
