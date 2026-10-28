import http from '~/api/http'

export const NOTIFICATION_SETTING_KEY = 'NotificationTypesEnabled'

export const adminNotificationApi = {
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/notification', query)
  },
  types() {
    return http.get('/admin/notification/types')
  },
  send(data: { user_id?: number, type: string, title: string, content?: string, link?: string }) {
    return http.post('/admin/notification/send', data)
  },
  remove(id: number) {
    return http.delete(`/admin/notification/${id}`)
  },
}

export default adminNotificationApi
