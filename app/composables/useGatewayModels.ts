import { adminGatewayApi } from '~/api/gateway'
import { type GatewayModel, parseGatewayModels, toGatewayImportItem } from '~/utils/gateway-models'

export type GatewayPullResult = { ok: true, count: number } | { ok: false, message: string }
export type GatewayImportResult
  = | { ok: true, created: number, updated: number, skippedModels: string[] }
    | { ok: false, message: string }

/**
 * 网关模型清单的拉取与导入（定价页与仪表板开始使用向导共用）。
 * 只管接口与清单状态，提示文案与后续刷新由调用方决定。
 */
export function useGatewayModels() {
  const gatewayModels = ref<GatewayModel[]>([])
  /** 是否已成功拉取过；false 时清单不可信 */
  const gatewayKnown = ref(false)
  const fetching = ref(false)
  const importing = ref(false)

  function markGatewayExisting(models: string[], existing: boolean) {
    if (!models.length)
      return
    const set = new Set(models)
    gatewayModels.value = gatewayModels.value.map(m => set.has(m.model) ? { ...m, existing } : m)
  }

  /** 拉取网关模型；已在拉取中返回 null */
  async function pullGatewayModels(): Promise<GatewayPullResult | null> {
    if (fetching.value)
      return null
    fetching.value = true
    try {
      const raw = await adminGatewayApi.fetchModels()
      const list = parseGatewayModels(raw)
      if (!list) {
        gatewayModels.value = []
        gatewayKnown.value = false
        return { ok: false, message: String(raw?.message || '') }
      }
      gatewayModels.value = list
      gatewayKnown.value = true
      return { ok: true, count: list.length }
    }
    catch {
      return { ok: false, message: '' }
    }
    finally {
      fetching.value = false
    }
  }

  /** 导入选中的模型，成功后把实际入库的标成已定价；已在导入中返回 null */
  async function importGatewayModels(items: GatewayModel[]): Promise<GatewayImportResult | null> {
    if (!items.length || importing.value)
      return null
    importing.value = true
    try {
      const raw = await adminGatewayApi.importModels(items.map(toGatewayImportItem))
      if (!raw || raw.success !== true)
        return { ok: false, message: String(raw?.message || '') }
      const data = raw?.data ?? {}
      const skippedModels: string[] = Array.isArray(data.skipped_models) ? data.skipped_models.map(String) : []
      const skipped = new Set(skippedModels)
      markGatewayExisting(items.map(item => item.model).filter(model => !skipped.has(model)), true)
      return { ok: true, created: Number(data.created) || 0, updated: Number(data.updated) || 0, skippedModels }
    }
    catch {
      return { ok: false, message: '' }
    }
    finally {
      importing.value = false
    }
  }

  return { gatewayModels, gatewayKnown, fetching, importing, markGatewayExisting, pullGatewayModels, importGatewayModels }
}
