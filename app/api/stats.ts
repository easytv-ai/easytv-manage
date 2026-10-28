import http from '~/api/http'

export const stats = {
  /** 系统概况统计：GET /admin/stats */
  overview(query?: Record<string, unknown>) {
    return http.get('/admin/stats', query)
  },

  /** 增长漏斗：GET /admin/stats/funnel?from&to&source（Unix 秒，缺省最近 14 天） */
  funnel(query?: { from?: number, to?: number, source?: string }) {
    return http.get('/admin/stats/funnel', query)
  },

  /** 创作指标：GET /admin/stats/creation?days&idle_minutes（API.md 17） */
  creation(query?: { days?: number, idle_minutes?: number }) {
    return http.get('/admin/stats/creation', query)
  },
}

export default stats
