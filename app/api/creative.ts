import http from '~/api/http'

/**
 * 创作域管理接口，路径与后端管理接口一致。
 * 列表统一返回 { success, data: { items, total } }。
 */

export type AdminPageQuery = {
  page?: number
  page_size?: number
  keyword?: string
  user_id?: number
  /** 1 正常 / 2 回收站（作品为 1 已发布 / 2 已下架 / 0 草稿 / -1 驳回） */
  status?: number | string
}

export const adminProjectApi = {
  list(query: AdminPageQuery = {}) {
    return http.get('/admin/project', query)
  },
  /** 1 恢复 / 2 移入回收站 */
  setStatus(id: number, status: 1 | 2) {
    return http.put(`/admin/project/${id}/status`, { status })
  },
  remove(id: number) {
    return http.delete(`/admin/project/${id}`)
  },
}

export const adminCanvasApi = {
  list(query: AdminPageQuery & { project_id?: number } = {}) {
    return http.get('/admin/canvas', query)
  },
  setStatus(id: number, status: 1 | 2) {
    return http.put(`/admin/canvas/${id}/status`, { status })
  },
  remove(id: number) {
    return http.delete(`/admin/canvas/${id}`)
  },
}

export const adminAssetApi = {
  list(query: AdminPageQuery & { type?: string, source?: string } = {}) {
    return http.get('/admin/asset', query)
  },
  setStatus(id: number, status: 1 | 2) {
    return http.put(`/admin/asset/${id}/status`, { status })
  },
  remove(id: number) {
    return http.delete(`/admin/asset/${id}`)
  },
}

export const adminTaskApi = {
  list(query: AdminPageQuery & { type?: string } = {}) {
    return http.get('/admin/task', query)
  },
}

export type AdminWorkPayload = {
  title?: string
  description?: string
  category?: string
  cover_url?: string
  /** 1 精选 / 0 取消精选 */
  featured?: 0 | 1
  sort_order?: number
}

export const adminWorkApi = {
  /** featured=1 只取精选（按 sort_order 升序）；review_status 0 待审核 / 1 通过 / 2 驳回 */
  list(query: AdminPageQuery & { category?: string, featured?: 0 | 1, review_status?: number, lang?: string } = {}) {
    return http.get('/admin/work', query)
  },
  /** 编辑标题 / 分类 / 封面 / 精选 / 排序 */
  update(id: number, data: AdminWorkPayload) {
    return http.put(`/admin/work/${id}`, data)
  },
  /** 1 已发布 / 2 已下架 / -1 驳回 */
  setStatus(id: number, status: number, remark = '') {
    return http.put(`/admin/work/${id}/status`, { status, remark })
  },
  /** 发布审核：1 通过 / 2 驳回 */
  review(id: number, status: 1 | 2, remark = '') {
    return http.put(`/admin/work/${id}/review`, { status, remark })
  },
  remove(id: number) {
    return http.delete(`/admin/work/${id}`)
  },
}

/** 举报（社区审核）：作品举报与评论举报共用一张表，target_type 区分 */
export const adminReportApi = {
  /** status 0 待审核 / 1 成立 / 2 驳回；target_type work | comment */
  list(query: AdminPageQuery & { target_type?: 'work' | 'comment' } = {}) {
    return http.get('/admin/work-report', query)
  },
  /** 1 成立（作品下架 / 评论隐藏） / 2 驳回 */
  setStatus(id: number, status: 1 | 2, remark = '') {
    return http.put(`/admin/work-report/${id}/status`, { status, remark })
  },
}

/** 作品评论（社区审核） */
export const adminCommentApi = {
  /** status 1 正常 / 2 已隐藏 */
  list(query: AdminPageQuery & { work_id?: number } = {}) {
    return http.get('/admin/comment', query)
  },
  /** 1 恢复 / 2 隐藏 */
  setStatus(id: number, status: 1 | 2, remark = '') {
    return http.put(`/admin/comment/${id}/status`, { status, remark })
  },
  remove(id: number) {
    return http.delete(`/admin/comment/${id}`)
  },
}

export type AdminCategoryPayload = {
  name?: string
  scope?: 'work' | 'skill'
  sort_order?: number
  status?: 1 | 2
}

/** 内容分类（成片 / Skill 前台标签） */
export const adminCategoryApi = {
  /** 不分页，返回 { items, total } */
  list(query: { scope?: string, keyword?: string, status?: number | string } = {}) {
    return http.get('/admin/category', query)
  },
  create(data: AdminCategoryPayload) {
    return http.post('/admin/category', data)
  },
  update(id: number, data: AdminCategoryPayload) {
    return http.put(`/admin/category/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/category/${id}`)
  },
}

export type AdminSkillPayload = {
  title?: string
  slug?: string
  description?: string
  author_name?: string
  category?: string
  cover_url?: string
  video_url?: string
  scene?: string
  howto?: string
  output?: string
  prompt?: string
  /** 执行契约（API.md 1.6）：只对文本任务注入，拼在提示词最前面 */
  guide?: string
  output_format?: string
  sort_order?: number
  status?: 1 | 2
}

/** 技能审核（API.md 8.3）：approve 上架 / reject 驳回 / unpublish 下架回私有；revenue_share 0 表示用全局 GrowthSkillAuthorShare */
export type AdminSkillReviewPayload = {
  action: 'approve' | 'reject' | 'unpublish'
  remark?: string
  revenue_share?: number
}

export const adminSkillApi = {
  /** review_status 0 私有 / 1 待审 / 2 已上架 / 3 驳回（仅用户私有 Skill 有意义） */
  list(query: AdminPageQuery & { category?: string, source?: 'official' | 'user', review_status?: number | string } = {}) {
    return http.get('/admin/skill', query)
  },
  /** PUT /admin/skill/:id/review */
  review(id: number, data: AdminSkillReviewPayload) {
    return http.put(`/admin/skill/${id}/review`, data)
  },
  create(data: AdminSkillPayload) {
    return http.post('/admin/skill', data)
  },
  update(id: number, data: AdminSkillPayload) {
    return http.put(`/admin/skill/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/skill/${id}`)
  },
}

export type AdminPromptPayload = {
  title?: string
  content?: string
  cover_url?: string
  result_url?: string
  tags?: string[]
  category?: string
  sort_order?: number
  status?: 1 | 2
}

export type AdminPromptSourcePayload = {
  name?: string
  url?: string
  /** markdown 按二级/三级标题切段；json 期望一个对象数组 */
  format?: 'markdown' | 'json'
  /** 同步进来的条目统一打这个标签 */
  tag?: string
  enabled?: boolean
}

/** 提示词库（API.md 1.11） */
export const adminPromptApi = {
  list(query: AdminPageQuery & { keyword?: string, tag?: string, category?: string, source_id?: number, status?: number | string } = {}) {
    return http.get('/admin/prompt', query)
  },
  create(data: AdminPromptPayload) {
    return http.post('/admin/prompt', data)
  },
  update(id: number, data: AdminPromptPayload) {
    return http.put(`/admin/prompt/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/prompt/${id}`)
  },
}

export type AdminStylePayload = {
  name?: string
  prompt?: string
  negative?: string
  cover_url?: string
  tags?: string[]
  category?: string
  kinds?: string[]
  sort_order?: number
  /** 1 可用（官方=已上架 / 用户=私有）、2 下架（官方）、3 待审核、4 已收录；用户风格只能在 1/3/4 之间 */
  status?: 1 | 2 | 3 | 4
}

/** 风格来源：官方（user_id = 0）/ 用户投稿（user_id > 0） */
export type AdminStyleSource = 'official' | 'user'

/** 投稿审核（API.md 34.5）：通过 → 4，驳回 → 1；reason 只进审计与站内通知 */
export type AdminStyleReviewPayload = {
  approve: boolean
  reason?: string
}

/** 风格库（API.md 34 / 34.5）：官方风格 + 用户投稿，创作台生成时把 prompt 片段拼到提示词末尾 */
export const adminStyleApi = {
  list(query: AdminPageQuery & { keyword?: string, tag?: string, category?: string, kind?: string, status?: number | string, source?: AdminStyleSource } = {}) {
    return http.get('/admin/style', query)
  },
  review(id: number, data: AdminStyleReviewPayload) {
    return http.post(`/admin/style/${id}/review`, data)
  },
  create(data: AdminStylePayload) {
    return http.post('/admin/style', data)
  },
  update(id: number, data: AdminStylePayload) {
    return http.put(`/admin/style/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/style/${id}`)
  },
}

/** 提示词远程源：定时同步 12 小时一轮，这里也能手动触发 */
export const adminPromptSourceApi = {
  list() {
    return http.get('/admin/prompt-source')
  },
  create(data: AdminPromptSourcePayload) {
    return http.post('/admin/prompt-source', data)
  },
  update(id: number, data: AdminPromptSourcePayload) {
    return http.put(`/admin/prompt-source/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/admin/prompt-source/${id}`)
  },
  sync(id: number) {
    return http.post(`/admin/prompt-source/${id}/sync`, {})
  },
}

/** 统一解析分页响应 */
export function parsePaged<T = any>(raw: any): { items: T[], total: number } | null {
  if (!raw || raw.success !== true)
    return null
  const data = raw.data ?? {}
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: Number(data.total) || 0,
  }
}

export function isOk(raw: any): boolean {
  return Boolean(raw && raw.success === true)
}

/** Unix 秒 → 本地时间字符串 */
export function formatUnix(ts: number | null | undefined): string {
  const v = Number(ts) || 0
  if (!v)
    return ''
  const d = new Date(v * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
