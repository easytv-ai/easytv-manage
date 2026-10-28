import http from '~/api/http'

/** 使用日志：GET /admin/audit */
export const adminAuditApi = {
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/audit', query)
  },
}

export default adminAuditApi
