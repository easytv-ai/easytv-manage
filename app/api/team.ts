import http from '~/api/http'

/** 团队额度（API.md 10.9）。列表管理员可看，改额度仅超级管理员。 */

export interface AdminTeam {
  id: number
  name: string
  owner_id: number
  owner_name: string
  seats: number
  member_count: number
  points_limit_total: number
  points_used_month: number
  created_at: number
}

export interface AdminTeamMember {
  id: number
  team_id: number
  user_id: number
  role: string
  permission: string
  joined_at: number
  points_limit: number
  points_used: number
  limit_reset_at: number
  nickname?: string
  username?: string
  /** 本月剩余；不限时后端不下发 */
  points_left?: number | null
}

export const adminTeamApi = {
  /** GET /admin/team?keyword=&owner_id=&page=&page_size= */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/team', query)
  },
  /** GET /admin/team/:id/members */
  members(id: number) {
    return http.get(`/admin/team/${id}/members`)
  },
  /** PUT /admin/team/member/:id/limit（Root）{ points_limit }，0 表示不限 */
  setLimit(memberId: number, pointsLimit: number) {
    return http.put(`/admin/team/member/${memberId}/limit`, { points_limit: pointsLimit })
  },
}

export default adminTeamApi
