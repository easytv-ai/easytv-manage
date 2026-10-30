import http from '~/api/http'

/** 用户状态：1 启用，2 停用 */
export const USER_STATUS_ENABLED = 1
export const USER_STATUS_DISABLED = 2

/** 用户管理：路径与后端管理接口一致 */
export const user = {
  /** 用户列表：GET /admin/user */
  list(query: Record<string, unknown>) {
    return http.get('/admin/user', query)
  },

  /** 用户详情：GET /admin/user/:id */
  getById(id: number | string) {
    return http.get(`/admin/user/${id}`)
  },

  /** 启用 / 禁用：PUT /admin/user/:id/status { status } */
  manage(id: number, action: 'enable' | 'disable') {
    return http.put(`/admin/user/${id}/status`, {
      status: action === 'enable' ? USER_STATUS_ENABLED : USER_STATUS_DISABLED,
    })
  },

  /** 运营身份：PUT /admin/user/:id/identity { identity }；空 / __none__ 去掉身份 */
  setIdentity(id: number, identity: string) {
    return http.put(`/admin/user/${id}/identity`, { identity })
  },

  /** 换绑（Root）：PUT /admin/user/:id/bind { mobile?, wechat_unbind? } */
  rebind(id: number, body: { mobile?: string, wechat_unbind?: boolean }) {
    return http.put(`/admin/user/${id}/bind`, body)
  },

  /** 注销：DELETE /admin/user/:id */
  delete(id: number) {
    return http.delete(`/admin/user/${id}`)
  },

  /** 邀请关系与返利流水：GET /admin/user/:id/invites → { totals, records, bills, bills_total, invite_blocked } */
  invites(id: number, query?: Record<string, unknown>) {
    return http.get(`/admin/user/${id}/invites`, query)
  },

  /** 控制台（参照 EasyAPI 后台）：POST /admin/user/:id/console_access → { ticket, path, expires_in }，60 秒一次性 */
  consoleAccess(id: number) {
    return http.post(`/admin/user/${id}/console_access`)
  },

  /** 冻结 / 解冻邀请奖励（Root）：PUT /admin/user/:id/invite-block { blocked } */
  setInviteBlock(id: number, blocked: boolean) {
    return http.put(`/admin/user/${id}/invite-block`, { blocked })
  },
}

export default user
