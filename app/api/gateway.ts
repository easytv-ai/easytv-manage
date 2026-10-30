import http from '~/api/http'

/** 生成网关 / 七牛存储：路径与后端 /admin/gateway 一致 */
export const adminGatewayApi = {
  config() {
    return http.get('/admin/gateway/config')
  },
  update(data: Record<string, unknown>) {
    return http.put('/admin/gateway/config', data)
  },
  /** 从网关拉取模型列表与建议积分（GET /admin/gateway/fetch-models） */
  fetchModels() {
    return http.get('/admin/gateway/fetch-models')
  },
  /** 网关令牌剩余额度与近 30 天用量（GET /admin/gateway/balance，API.md 38）；网关不支持时 success=false */
  balance(refresh = false) {
    return http.get('/admin/gateway/balance', refresh ? { refresh: 1 } : undefined)
  },
  /** 把网关模型导入 model_price；已存在只补 label/type/unit，不改价格 */
  importModels(models: Record<string, unknown>[]) {
    return http.post('/admin/gateway/models/import', { models })
  },
}

export default adminGatewayApi
