import http from '~/api/http'

export const setting = {
  /** 全部系统设置：GET /admin/setting */
  list() {
    return http.get('/admin/setting')
  },

  /** 更新系统设置：PUT /admin/setting/:key { value } */
  update(key: string, data?: unknown) {
    return http.put(`/admin/setting/${encodeURIComponent(key)}`, data)
  },
}

export default setting
