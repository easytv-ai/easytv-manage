import http from '~/api/http'

export type AdminMediaAction = {
  action: string
  label?: string
  engine?: string
  ability?: string
  available?: boolean
  reason?: string
  models?: string[]
  priced_models?: string[]
  gap?: string
  free?: boolean
}

export const media = {
  /** GET /admin/media/actions：画布工具盘点（API.md 23.2） */
  actions() {
    return http.get('/admin/media/actions')
  },
}

export default media
