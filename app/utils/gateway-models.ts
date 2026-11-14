/** 网关模型（GET /admin/gateway/fetch-models）的前端结构、导入条目与向导缺省勾选规则。 */

export type GatewayModelType = 'text' | 'image' | 'video' | 'audio'
export type GatewayModelUnit = 'second' | 'image' | 'call'

export type GatewayModel = {
  model: string
  type: GatewayModelType
  label: string
  unit: GatewayModelUnit
  suggestPoints: number
  /** 每计价单位的网关成本（元） */
  priceYuan: number
  /** 折算依据说明 */
  estimate: string
  /** 视频模型支持的分辨率（逗号分隔），后端从网关分辨率倍率表推出 */
  resolutions: string
  existing: boolean
}

export const GATEWAY_MODEL_TYPES: GatewayModelType[] = ['text', 'image', 'video', 'audio']

const GATEWAY_TYPES = new Set<GatewayModelType>(GATEWAY_MODEL_TYPES)
const GATEWAY_UNITS = new Set<GatewayModelUnit>(['second', 'image', 'call'])

function mapGatewayType(item: any): GatewayModelType {
  const eps = Array.isArray(item?.supported_endpoint_types)
    ? item.supported_endpoint_types.map((x: any) => String(x).toLowerCase())
    : []
  const cat = String(item?.category || '').toLowerCase()
  if (eps.some((e: string) => e.includes('video')) || cat === 'video')
    return 'video'
  if (eps.some((e: string) => e.includes('image')) || cat === 'image')
    return 'image'
  if (eps.some((e: string) => e.includes('tts') || e.includes('audio') || e.includes('speech')) || cat === 'audio')
    return 'audio'
  return 'text'
}

function mapGatewayUnit(item: any, type: GatewayModelType): GatewayModelUnit {
  if (Number(item?.quota_type) === 2 || type === 'video')
    return 'second'
  if (type === 'image')
    return 'image'
  return 'call'
}

export function toGatewayModel(item: any): GatewayModel {
  // 后端已推断 type / unit（含按次计费的视频 = call），前端映射只作兜底
  const type: GatewayModelType = GATEWAY_TYPES.has(item?.type) ? item.type : mapGatewayType(item)
  const unit: GatewayModelUnit = GATEWAY_UNITS.has(item?.unit) ? item.unit : mapGatewayUnit(item, type)
  return {
    model: String(item?.model || '').trim(),
    type,
    label: String(item?.label || item?.model || '').trim(),
    unit,
    suggestPoints: Number(item?.suggest_points) || 0,
    priceYuan: Number(item?.price_yuan) || 0,
    estimate: String(item?.estimate || ''),
    resolutions: String(item?.resolutions || ''),
    existing: Boolean(item?.existing),
  }
}

/** fetch-models 响应 → 模型清单；接口失败返回 null */
export function parseGatewayModels(raw: any): GatewayModel[] | null {
  if (!raw || raw.success !== true)
    return null
  const list = Array.isArray(raw?.data?.models) ? raw.data.models : []
  return list.map((item: any) => toGatewayModel(item)).filter((m: GatewayModel) => m.model)
}

/** 导入条目（POST /admin/gateway/models/import）：积分用网关建议值，会员价不单独设 */
export function toGatewayImportItem(m: GatewayModel) {
  return {
    model: m.model,
    label: m.label,
    type: m.type,
    unit: m.unit,
    points_per_unit: m.suggestPoints,
    member_points_per_unit: 0,
    resolutions: m.resolutions,
  }
}

export function countGatewayModelsByType(models: GatewayModel[]): Record<GatewayModelType, number> {
  const counts: Record<GatewayModelType, number> = { text: 0, image: 0, video: 0, audio: 0 }
  for (const m of models)
    counts[m.type] += 1
  return counts
}

/** 能直接导入的模型：还没有定价行，且网关给了建议积分（没有建议积分的后端会跳过） */
export function isGatewayModelImportable(m: GatewayModel) {
  return !m.existing && m.suggestPoints > 0
}

/**
 * 向导缺省勾选规则：每个类型按下面的关键词顺序各取一个模型，取满 limit 为止。
 * 关键词是各类型里自部署者最常用的模型族，命中多个时取名字最短的那个（通常是不带后缀的基础款）；
 * 关键词都没命中的类型不凑数，留给管理员自己勾。
 */
const SETUP_DEFAULT_PICKS: Record<GatewayModelType, { limit: number, keywords: string[] }> = {
  text: { limit: 3, keywords: ['gpt-4o-mini', 'deepseek', 'gpt-4o', 'gemini', 'claude', 'qwen', 'doubao'] },
  image: { limit: 3, keywords: ['gpt-image', 'nano-banana', 'seedream', 'flux', 'jimeng', 'qwen-image'] },
  video: { limit: 3, keywords: ['seedance', 'kling', 'veo', 'wan', 'sora', 'hailuo', 'vidu'] },
  audio: { limit: 2, keywords: ['tts', 'speech', 'minimax', 'cosyvoice'] },
}

export function defaultSetupPicks(models: GatewayModel[]): string[] {
  const picks: string[] = []
  for (const type of GATEWAY_MODEL_TYPES) {
    const rule = SETUP_DEFAULT_PICKS[type]
    const pool = models.filter(m => m.type === type && isGatewayModelImportable(m))
    const chosen = new Set<string>()
    for (const keyword of rule.keywords) {
      if (chosen.size >= rule.limit)
        break
      const hit = pool
        .filter(m => !chosen.has(m.model) && m.model.toLowerCase().includes(keyword))
        .sort((a, b) => a.model.length - b.model.length || a.model.localeCompare(b.model))[0]
      if (hit)
        chosen.add(hit.model)
    }
    picks.push(...chosen)
  }
  return picks
}
