import http from '~/api/http'

/** 主体库（API.md 10.9）。列表管理员可看，删除仅超级管理员。 */

export interface AdminSubjectRef {
  asset_id: number
  url: string
  label: string
}

export interface AdminSubject {
  id: number
  user_id: number
  owner_name: string
  team_id: number
  kind: string
  name: string
  look: string
  prompt: string
  cover_url: string
  refs: AdminSubjectRef[]
  refs_count: number
  shared: number
  uses: number
  created_at: number
  updated_at: number
}

export const adminSubjectApi = {
  /** GET /admin/subject?user_id=&team_id=&kind=&shared=&keyword=&page= */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/subject', query)
  },
  /** DELETE /admin/subject/:id（Root）软删 */
  remove(id: number) {
    return http.delete(`/admin/subject/${id}`)
  },
}

export default adminSubjectApi
