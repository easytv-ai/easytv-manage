import http from '~/api/http'

/** AI 对话：路径与 easytv-api /admin/ai-chat 对齐 */
export const adminAiChatApi = {
  /** 对话配置：GET /admin/ai-chat/config */
  config() {
    return http.get('/admin/ai-chat/config')
  },

  /** 局部更新对话配置：PUT /admin/ai-chat/config，返回与 GET 相同的视图 */
  update(payload: Record<string, unknown>) {
    return http.put('/admin/ai-chat/config', payload)
  },
}

export default adminAiChatApi
