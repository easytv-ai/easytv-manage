<script setup lang="ts">
import { adminModelPriceApi, type ModelHealth, type ModelPricePayload } from '~/api/billing'
import { adminGatewayApi } from '~/api/gateway'
import mediaApi, { type AdminMediaAction } from '~/api/media'
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'
import { modelEngineCoverage } from '~/utils/media-actions'

const { t } = useI18n()
useHead({ title: () => t('modelPrice.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

// 从网关参数表同步 durations / resolutions / abilities（API.md 28.3）：缺省只填空字段，运营手填的不动
const syncingId = ref(0)
const syncingAll = ref(false)

type GatewaySyncResult = { id: number, model: string, changes: string[], notes?: string[], skipped?: string, error?: string }

function describeSync(result: GatewaySyncResult) {
  if (result.error)
    return result.error
  const main = result.changes?.length ? result.changes.join('；') : (result.skipped || t('modelPrice.syncNoChange'))
  return result.notes?.length ? `${main}（${result.notes.join('；')}）` : main
}

async function syncGatewayOne(item: { id: number, model: string }) {
  if (syncingId.value)
    return
  syncingId.value = item.id
  try {
    const raw = await adminModelPriceApi.syncGateway(item.id) as { success?: boolean, message?: string, data?: { result?: GatewaySyncResult } }
    if (!raw?.success) {
      notify(raw?.message ?? t('modelPrice.syncFailed'), 'error')
      return
    }
    const result = raw.data?.result
    notify(`${item.model}：${result ? describeSync(result) : t('modelPrice.syncNoChange')}`, result?.changes?.length ? 'success' : 'info')
    if (result?.changes?.length)
      await fetchAll(`s-${Date.now()}`)
  }
  finally {
    syncingId.value = 0
  }
}

async function syncGatewayAll() {
  if (syncingAll.value)
    return
  syncingAll.value = true
  try {
    const raw = await adminModelPriceApi.syncGatewayAll() as { success?: boolean, message?: string, data?: { results?: GatewaySyncResult[], updated?: number, skipped?: number, failed?: number } }
    if (!raw?.success) {
      notify(raw?.message ?? t('modelPrice.syncFailed'), 'error')
      return
    }
    const d = raw.data || {}
    const changed = (d.results || []).filter(r => r.changes?.length).map(r => `${r.model}：${r.changes.join('；')}`)
    notify(t('modelPrice.syncSummary', { updated: d.updated ?? 0, skipped: d.skipped ?? 0, failed: d.failed ?? 0 }) + (changed.length ? `\n${changed.join('\n')}` : ''), (d.updated ?? 0) > 0 ? 'success' : 'info')
    if ((d.updated ?? 0) > 0)
      await fetchAll(`s-${Date.now()}`)
  }
  finally {
    syncingAll.value = false
  }
}
const { isSuperAdmin } = useAdminAccess()

type PriceRow = {
  id: number
  model: string
  type: 'text' | 'image' | 'video' | 'audio'
  label: string
  unit: 'second' | 'image' | 'call'
  pointsPerUnit: number
  memberPointsPerUnit: number
  status: 1 | 2
  /** 是否出现在网关拉取清单里 */
  available: boolean
  /** 促销价（T20）：0 无促销 */
  promoPointsPerUnit: number
  promoLabel: string
  promoStartsAt: number
  promoEndsAt: number
  promoActive: boolean
  /** 支持的时长秒数，逗号分隔；空串=不限 */
  durations: string
  /** 支持的分辨率，逗号分隔；空串=不限 */
  resolutions: string
  /** 1=首帧图需与输出尺寸一致 */
  frameMatch: 0 | 1
  /** 图片模型参考图输入方式：none / edits / url，空串=按模型名推断 */
  imageInput: string
  /** 媒体能力标签（API.md 23），逗号分隔；空串=按模型名推断 */
  abilities: string
}

type GatewayModel = {
  model: string
  type: PriceRow['type']
  label: string
  unit: PriceRow['unit']
  suggestPoints: number
  /** 每计价单位的网关成本（元） */
  priceYuan: number
  /** 折算依据说明 */
  estimate: string
  /** 视频模型支持的分辨率（逗号分隔），后端从网关分辨率倍率表推出 */
  resolutions: string
  existing: boolean
}

const GATEWAY_TYPES = new Set<PriceRow['type']>(['text', 'image', 'video', 'audio'])
const GATEWAY_UNITS = new Set<PriceRow['unit']>(['second', 'image', 'call'])

const TYPE_LABEL: Record<string, string> = { text: '文本', image: '图片', video: '视频', audio: '语音' }
const UNIT_LABEL: Record<string, string> = { second: '每秒', image: '每张', call: '每次' }
const typeItems = [
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '语音', value: 'audio' },
]
const unitItems = [
  { label: '每秒（视频）', value: 'second' },
  { label: '每张（图片）', value: 'image' },
  { label: '每次（文本 / 语音）', value: 'call' },
]
const filterTypeItems = [{ label: '全部类型', value: '__all__' }, ...typeItems]
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '生效', value: '1' },
  { label: '停用', value: '2' },
]

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const fetching = ref(false)
const importing = ref(false)
const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const rows = ref<PriceRow[]>([])
const gatewayModels = ref<GatewayModel[]>([])
const gatewayKnown = ref(false)
const draft = reactive({ keyword: '', type: '__all__', status: '__all__' })
const applied = ref({ ...draft })

type PriceSortBy = 'model' | 'type' | 'unit' | 'points_per_unit'
const DEFAULT_SORT: PriceSortBy = 'type'
const DEFAULT_ORDER: 'asc' | 'desc' = 'asc'
const sortBy = ref<PriceSortBy | null>(DEFAULT_SORT)
const sortOrder = ref<'asc' | 'desc'>(DEFAULT_ORDER)

const formOpen = ref(false)
// 编辑弹窗叠在 z-80，选择菜单默认挂到 body，不抬层级会被弹窗挡住，点了像没反应
const modalSelectUi = { content: 'relative z-[100]' }
const editing = ref<PriceRow | null>(null)
const form = reactive({
  model: '',
  type: 'video' as PriceRow['type'],
  label: '',
  unit: 'second' as PriceRow['unit'],
  pointsPerUnit: '',
  memberPointsPerUnit: '',
  promoPointsPerUnit: '',
  promoLabel: '',
  promoStartsAt: '',
  promoEndsAt: '',
  durations: '',
  resolutions: '',
  frameMatch: false,
  imageInput: 'auto',
  abilities: [] as string[],
})
const errors = reactive({ model: '', pointsPerUnit: '', promoPointsPerUnit: '', promoEndsAt: '' })
// USelect 不接受空串作选项值，「按模型名推断」用 auto 占位，提交时换回空串
// 媒体工具能力标签（API.md 23.1 白名单；顺序与后端 AllAbilities 一致）：打了标签的模型才会点亮画布上对应的按钮
const ABILITY_KEYS = ['upscale', 'remove_subtitle', 'vocal_separation', 'bgm_separation', 'matting', 'subject_remove', 'subject_modify', 'subject_replace', 'motion_capture', 'depth_extract', 'native_audio', 'video_reference', 'transcribe'] as const
const abilityItems = computed(() => ABILITY_KEYS.map(key => ({ value: key, label: t(`modelPrice.ability.${key}`) })))
function splitAbilities(raw: string): string[] {
  return String(raw || '').split(',').map(v => v.trim().toLowerCase()).filter(v => (ABILITY_KEYS as readonly string[]).includes(v))
}
function toggleAbility(key: string, on: boolean | 'indeterminate') {
  const next = form.abilities.filter(v => v !== key)
  if (on === true)
    next.push(key)
  form.abilities = ABILITY_KEYS.filter(k => next.includes(k))
}
const imageInputItems = computed(() => [
  { label: t('modelPrice.imageInputAuto'), value: 'auto' },
  { label: t('modelPrice.imageInputEdits'), value: 'edits' },
  { label: t('modelPrice.imageInputUrl'), value: 'url' },
  { label: t('modelPrice.imageInputNone'), value: 'none' },
])

function tsToLocalInput(ts: number) {
  if (!ts)
    return ''
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToTs(value: string) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

/** 促销状态：active 促销中 / scheduled 未开始 / ended 已结束 / none 无促销 */
function promoState(item: PriceRow): 'active' | 'scheduled' | 'ended' | 'none' {
  if (!item.promoPointsPerUnit)
    return 'none'
  const now = Math.floor(Date.now() / 1000)
  if (item.promoStartsAt > 0 && now < item.promoStartsAt)
    return 'scheduled'
  if (item.promoEndsAt > 0 && now >= item.promoEndsAt)
    return 'ended'
  return 'active'
}
const saving = ref(false)

const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<PriceRow | null>(null)
const confirming = ref(false)
const importOpen = ref(false)
const browseOpen = ref(false)
const browseKeyword = ref('')
const browseType = ref('__all__')
const selectedModels = ref<string[]>([])

function compareRows(a: PriceRow, b: PriceRow) {
  const field = sortBy.value ?? DEFAULT_SORT
  const dir = sortBy.value ? sortOrder.value : DEFAULT_ORDER
  const av = field === 'points_per_unit' ? a.pointsPerUnit : String(a[field] ?? '')
  const bv = field === 'points_per_unit' ? b.pointsPerUnit : String(b[field] ?? '')
  let cmp = 0
  if (typeof av === 'number' && typeof bv === 'number')
    cmp = av - bv
  else
    cmp = String(av).localeCompare(String(bv), 'zh')
  if (cmp === 0)
    cmp = a.id - b.id
  return dir === 'desc' ? -cmp : cmp
}

/** 接口不支持 keyword/type/status，全量拉取后在本地筛选、排序、分页 */
const filtered = computed(() => {
  const q = applied.value.keyword.toLowerCase()
  return rows.value.filter((item) => {
    if (q && !item.model.toLowerCase().includes(q) && !item.label.toLowerCase().includes(q))
      return false
    if (applied.value.type !== '__all__' && item.type !== applied.value.type)
      return false
    if (applied.value.status !== '__all__' && item.status !== Number(applied.value.status))
      return false
    return true
  }).slice().sort(compareRows)
})
const total = computed(() => filtered.value.length)
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/** 网关已开通但本地还没有定价行的模型（existing 以网关拉取结果为准，不拿当前页推断） */
const unpriced = computed(() => gatewayModels.value.filter(m => !m.existing))

const unpricedStats = computed(() => {
  const counts: Record<string, number> = { text: 0, image: 0, video: 0, audio: 0 }
  for (const item of unpriced.value)
    counts[item.type] = (counts[item.type] || 0) + 1
  return typeItems.map(item => ({ ...item, count: counts[item.value] || 0 })).filter(item => item.count > 0)
})

const abilityBoard = ref<AdminMediaAction[]>([])

async function loadAbilityBoard() {
  try {
    const raw = await mediaApi.actions()
    abilityBoard.value = isOk(raw) ? modelEngineCoverage(raw.data?.actions) : []
  }
  catch {
    abilityBoard.value = []
  }
}

const browseTypeItems = computed(() => [
  { label: `${t('common.allTypes')} ${unpriced.value.length}`, value: '__all__' },
  ...unpricedStats.value.map(item => ({ label: `${item.label} ${item.count}`, value: item.value })),
])

function openBrowse() {
  if (!browseOpen.value) {
    browseKeyword.value = ''
    browseType.value = '__all__'
    selectedModels.value = []
  }
  browseOpen.value = true
}

const filteredUnpriced = computed(() => {
  const q = browseKeyword.value.trim().toLowerCase()
  return unpriced.value.filter((item) => {
    if (browseType.value !== '__all__' && item.type !== browseType.value)
      return false
    if (q && !item.model.toLowerCase().includes(q) && !item.label.toLowerCase().includes(q))
      return false
    return true
  })
})

const selectedSet = computed(() => new Set(selectedModels.value))
const selectedUnpriced = computed(() => unpriced.value.filter(item => selectedSet.value.has(item.model)))
const filteredSelectedCount = computed(() => filteredUnpriced.value.filter(item => selectedSet.value.has(item.model)).length)
const allFilteredSelected = computed(() => filteredUnpriced.value.length > 0 && filteredSelectedCount.value === filteredUnpriced.value.length)
const someFilteredSelected = computed(() => filteredSelectedCount.value > 0 && filteredSelectedCount.value < filteredUnpriced.value.length)

function isSelected(model: string) {
  return selectedSet.value.has(model)
}

function toggleSelect(model: string, checked: boolean) {
  const next = new Set(selectedModels.value)
  if (checked)
    next.add(model)
  else
    next.delete(model)
  selectedModels.value = [...next]
}

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedModels.value)
  for (const item of filteredUnpriced.value) {
    if (checked)
      next.add(item.model)
    else
      next.delete(item.model)
  }
  selectedModels.value = [...next]
}

function requestImport() {
  if (!selectedUnpriced.value.length) {
    notify(t('modelPrice.importNeedSelect'), 'error')
    openBrowse()
    return
  }
  importOpen.value = true
}

/** 新建时的模型下拉：未定价的网关模型优先。空模型名不能进 USelect。 */
const modelOptions = computed(() => unpriced.value
  .filter(m => !!m.model)
  .map(m => ({ label: `${m.label || m.model}（${TYPE_LABEL[m.type] ?? m.type}）`, value: m.model })))

function modelPickTip(label?: string) {
  const text = String(label || '')
  return text.length > 32 ? text : undefined
}

function mapGatewayType(item: any): PriceRow['type'] {
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

function mapGatewayUnit(item: any, type: PriceRow['type']): PriceRow['unit'] {
  if (Number(item?.quota_type) === 2 || type === 'video')
    return 'second'
  if (type === 'image')
    return 'image'
  return 'call'
}

function toGatewayModel(item: any): GatewayModel {
  // 后端已推断 type / unit（含按次计费的视频 = call），前端映射只作兜底
  const type: PriceRow['type'] = GATEWAY_TYPES.has(item?.type) ? item.type : mapGatewayType(item)
  const unit: PriceRow['unit'] = GATEWAY_UNITS.has(item?.unit) ? item.unit : mapGatewayUnit(item, type)
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

function fmtCost(yuan: number) {
  if (!yuan)
    return '—'
  return `¥${yuan >= 1 ? yuan.toFixed(2) : yuan.toFixed(4)}`
}

function toRow(item: any, availableSet: Set<string>): PriceRow {
  return {
    id: item.id,
    model: item.model,
    type: item.type,
    label: item.label || '',
    unit: item.unit || 'call',
    pointsPerUnit: Number(item.points_per_unit) || 0,
    memberPointsPerUnit: Number(item.member_points_per_unit) || 0,
    status: item.status === 2 ? 2 : 1,
    available: availableSet.has(item.model),
    promoPointsPerUnit: Number(item.promo_points_per_unit) || 0,
    promoLabel: String(item.promo_label || ''),
    durations: String(item.durations || ''),
    resolutions: String(item.resolutions || ''),
    frameMatch: Number(item.frame_match) === 1 ? 1 : 0,
    imageInput: String(item.image_input || ''),
    abilities: String(item.abilities || ''),
    promoStartsAt: Number(item.promo_starts_at) || 0,
    promoEndsAt: Number(item.promo_ends_at) || 0,
    promoActive: Boolean(item.promo_active),
  }
}

function applyGatewayRaw(raw: any) {
  if (!isOk(raw)) {
    gatewayModels.value = []
    gatewayKnown.value = false
    return false
  }
  const list = Array.isArray(raw?.data?.models) ? raw.data.models : []
  gatewayModels.value = list.map((item: any) => toGatewayModel(item)).filter((m: GatewayModel) => m.model)
  gatewayKnown.value = true
  return true
}

/** 用已手动拉取的网关清单回填当前页「是否开通」，不改 existing */
function syncGatewayFlags() {
  const available = new Set(gatewayModels.value.map(m => m.model))
  rows.value = rows.value.map(item => ({ ...item, available: gatewayKnown.value && available.has(item.model) }))
}

function markGatewayExisting(models: string[], existing: boolean) {
  if (!models.length)
    return
  const set = new Set(models)
  gatewayModels.value = gatewayModels.value.map(m => set.has(m.model) ? { ...m, existing } : m)
}

const LIST_PAGE_SIZE = 100
const LIST_MAX_PAGES = 10

/** 近 7 天模型健康（API.md 37）：按 model 索引；没数据的模型不在里面 */
const health = ref<Record<string, ModelHealth>>({})
/** 统计窗口：7 天看近况，30 天样本够、能看出「哪个模型一直在坏」 */
const healthDays = ref<7 | 30>(7)
watch(healthDays, () => { void loadHealth() })
async function loadHealth() {
  try {
    const raw: any = await adminModelPriceApi.health(healthDays.value)
    health.value = isOk(raw) && raw?.data?.models && typeof raw.data.models === 'object' ? raw.data.models : {}
  }
  catch {
    health.value = {}
  }
}
function healthTitle(item: ModelHealth) {
  const lines = (item.top_errors || []).map(e => `${e.message} ×${e.count}`)
  lines.push(t('modelPrice.healthHint'))
  return lines.join('\n')
}

const fetchAll = useClientListFetch(async () => {
  beginListLoad()
  try {
    const items: any[] = []
    let lastRaw: any
    for (let p = 1; p <= LIST_MAX_PAGES; p++) {
      lastRaw = await adminModelPriceApi.list({
        page: p,
        page_size: LIST_PAGE_SIZE,
        sort_by: DEFAULT_SORT,
        order: DEFAULT_ORDER,
      })
      const parsed = parsePaged(lastRaw)
      if (!parsed) {
        if (!items.length) {
          rows.value = []
          notify(lastRaw?.message ?? '定价列表加载失败', 'error')
          return
        }
        break
      }
      items.push(...parsed.items)
      if (!parsed.items.length || items.length >= parsed.total)
        break
    }
    rows.value = items.map((item: any) => toRow(item, new Set()))
    syncGatewayFlags()
    markListReady()
    void loadHealth()
    void loadAbilityBoard()
  }
  finally {
    loading.value = false
  }
})

/** 网关余额（API.md 38）：网关没接或不支持账单接口时为 null，卡片不显示 */
const balance = ref<{ remain_usd: number, used_usd: number, unlimited: boolean, source: string, threshold_usd: number, low: boolean } | null>(null)
async function loadBalance() {
  try {
    const raw: any = await adminGatewayApi.balance()
    balance.value = isOk(raw) && raw?.data && typeof raw.data.remain_usd === 'number' ? raw.data : null
  }
  catch {
    balance.value = null
  }
}
onMounted(() => {
  void fetchAll()
  void loadBalance()
})
watch(pageSize, (size, prev) => {
  if (size !== prev)
    page.value = 1
})
watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage)
    page.value = maxPage
})

function search() {
  applied.value = { ...draft, keyword: draft.keyword.trim() }
  page.value = 1
}
function reset() {
  Object.assign(draft, { keyword: '', type: '__all__', status: '__all__' })
  search()
}

function caretClass(field: PriceSortBy, dir: 'asc' | 'desc') {
  if (sortBy.value === field && sortOrder.value === dir)
    return 'text-zinc-700 dark:text-zinc-200'
  return 'text-zinc-400 dark:text-zinc-500'
}

function toggleSort(field: PriceSortBy) {
  if (sortBy.value !== field) {
    sortBy.value = field
    sortOrder.value = 'asc'
  }
  else if (sortOrder.value === 'asc') {
    sortOrder.value = 'desc'
  }
  else {
    sortBy.value = null
  }
  page.value = 1
}

function defaultUnit(type: PriceRow['type']): PriceRow['unit'] {
  if (type === 'video')
    return 'second'
  if (type === 'image')
    return 'image'
  return 'call'
}

watch(() => form.type, (type) => {
  if (!editing.value)
    form.unit = defaultUnit(type)
})

function openCreate(preset?: GatewayModel) {
  editing.value = null
  const type = preset?.type || 'video'
  Object.assign(form, {
    model: preset?.model ?? '',
    type,
    label: preset?.label ?? '',
    unit: preset?.unit || defaultUnit(type),
    pointsPerUnit: preset?.suggestPoints ? String(preset.suggestPoints) : '',
    memberPointsPerUnit: '',
    promoPointsPerUnit: '',
    promoLabel: '',
    durations: '',
    resolutions: preset?.resolutions ?? '',
    frameMatch: false,
    imageInput: 'auto',
    abilities: [],
    promoStartsAt: '',
    promoEndsAt: '',
  })
  Object.assign(errors, { model: '', pointsPerUnit: '', promoPointsPerUnit: '', promoEndsAt: '' })
  formOpen.value = true
}

function onPickModel(value: string) {
  form.model = value
  const m = gatewayModels.value.find(item => item.model === value)
  if (m) {
    form.type = m.type
    form.unit = m.unit
    if (!form.label)
      form.label = m.label
    if (!form.pointsPerUnit && m.suggestPoints)
      form.pointsPerUnit = String(m.suggestPoints)
    // 网关分辨率倍率表推出的档位，手填过就不覆盖
    if (!form.resolutions && m.resolutions)
      form.resolutions = m.resolutions
  }
}

const formSuggestPoints = computed(() => {
  const model = form.model.trim()
  if (!model)
    return null
  const m = gatewayModels.value.find(item => item.model === model)
  return m ? m.suggestPoints : null
})

function applySuggest() {
  if (formSuggestPoints.value == null)
    return
  form.pointsPerUnit = String(formSuggestPoints.value)
}

function openEdit(item: PriceRow) {
  editing.value = item
  Object.assign(form, {
    model: item.model,
    type: item.type,
    label: item.label,
    unit: item.unit,
    pointsPerUnit: String(item.pointsPerUnit),
    memberPointsPerUnit: item.memberPointsPerUnit ? String(item.memberPointsPerUnit) : '',
    promoPointsPerUnit: item.promoPointsPerUnit ? String(item.promoPointsPerUnit) : '',
    promoLabel: item.promoLabel,
    durations: item.durations || '',
    resolutions: item.resolutions || '',
    frameMatch: item.frameMatch === 1,
    imageInput: item.imageInput || 'auto',
    abilities: splitAbilities(item.abilities),
    promoStartsAt: tsToLocalInput(item.promoStartsAt),
    promoEndsAt: tsToLocalInput(item.promoEndsAt),
  })
  Object.assign(errors, { model: '', pointsPerUnit: '', promoPointsPerUnit: '', promoEndsAt: '' })
  formOpen.value = true
}

function validate() {
  errors.model = form.model.trim() ? '' : '请填写模型标识'
  const p = Number(form.pointsPerUnit)
  errors.pointsPerUnit = Number.isInteger(p) && p >= 0 ? '' : '请输入非负整数'
  // type=number 的输入框可能回传数字而不是字符串，统一转成字符串再判断
  const promoRaw = String(form.promoPointsPerUnit ?? '').trim()
  const promo = promoRaw === '' ? 0 : Number(promoRaw)
  errors.promoPointsPerUnit = Number.isInteger(promo) && promo >= 0 ? '' : t('modelPrice.promoInvalid')
  const starts = localInputToTs(form.promoStartsAt)
  const ends = localInputToTs(form.promoEndsAt)
  errors.promoEndsAt = starts > 0 && ends > 0 && ends <= starts ? t('modelPrice.promoRangeInvalid') : ''
  return !errors.model && !errors.pointsPerUnit && !errors.promoPointsPerUnit && !errors.promoEndsAt
}

async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload: ModelPricePayload = {
      model: form.model.trim(),
      type: form.type,
      label: form.label.trim(),
      unit: form.unit,
      points_per_unit: Number(form.pointsPerUnit),
      member_points_per_unit: Number(form.memberPointsPerUnit) || 0,
      promo_points_per_unit: Number(form.promoPointsPerUnit) || 0,
      promo_label: form.promoLabel.trim(),
      durations: String(form.durations ?? '').trim(),
      resolutions: String(form.resolutions ?? '').trim(),
      frame_match: form.frameMatch ? 1 : 0,
      image_input: form.imageInput === 'auto' ? '' : form.imageInput,
      abilities: form.abilities.join(','),
      promo_starts_at: localInputToTs(form.promoStartsAt),
      promo_ends_at: localInputToTs(form.promoEndsAt),
    }
    const raw = editing.value
      ? await adminModelPriceApi.update(editing.value.id, payload)
      : await adminModelPriceApi.create({ ...payload, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editing.value ? '定价已更新' : '定价已创建')
    formOpen.value = false
    if (!editing.value)
      markGatewayExisting([payload.model!], true)
    await fetchAll(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}

function requestConfirm(item: PriceRow, action: 'status' | 'delete') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}

async function confirm() {
  if (!confirmItem.value)
    return
  confirming.value = true
  try {
    const item = confirmItem.value
    const raw = confirmAction.value === 'delete'
      ? await adminModelPriceApi.remove(item.id)
      : await adminModelPriceApi.update(item.id, { status: item.status === 1 ? 2 : 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? '定价已删除' : (item.status === 1 ? '定价已停用，该模型暂不可下任务' : '定价已生效'))
    confirmOpen.value = false
    if (confirmAction.value === 'delete')
      markGatewayExisting([item.model], false)
    await fetchAll(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

async function pullGateway(manual = false) {
  if (fetching.value)
    return
  fetching.value = true
  try {
    const raw = await adminGatewayApi.fetchModels()
    if (!applyGatewayRaw(raw)) {
      if (manual)
        notify(raw?.message ?? t('modelPrice.fetchFail'), 'error')
      return
    }
    const availableSet = new Set(gatewayModels.value.map(m => m.model))
    rows.value = rows.value.map(item => ({ ...item, available: availableSet.has(item.model) }))
    if (manual)
      notify(t('modelPrice.fetchOk', { count: gatewayModels.value.length }))
  }
  finally {
    fetching.value = false
  }
}

function toImportItem(m: GatewayModel) {
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

async function confirmImport() {
  const items = selectedUnpriced.value
  if (!items.length || importing.value) {
    if (!items.length)
      notify(t('modelPrice.importNeedSelect'), 'error')
    return
  }
  importing.value = true
  try {
    const raw = await adminGatewayApi.importModels(items.map(toImportItem))
    if (!isOk(raw)) {
      notify(raw?.message ?? t('modelPrice.importFail'), 'error')
      return
    }
    const data = raw?.data ?? {}
    notify(t('modelPrice.importOk', {
      created: Number(data.created) || 0,
      updated: Number(data.updated) || 0,
    }))
    const skippedModels: string[] = Array.isArray(data.skipped_models) ? data.skipped_models.map(String) : []
    if (skippedModels.length)
      notify(t('modelPrice.importSkipped', { count: skippedModels.length, models: skippedModels.join('、') }), 'error')
    const skipped = new Set(skippedModels)
    markGatewayExisting(items.map(item => item.model).filter(model => !skipped.has(model)), true)
    importOpen.value = false
    browseOpen.value = false
    await fetchAll(`i-${Date.now()}`)
  }
  finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <Teleport to="body">
      <div id="model-price-dialog-root" class="relative z-[80]" />
    </Teleport>

    <ManagePageHeader :page-title="t('modelPrice.title')" :page-description="t('modelPrice.description')">
      <template #actions>
        <UButton
          v-if="isSuperAdmin"
          type="button"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="fetching"
          :disabled="fetching || importing"
          @click="pullGateway(true)"
        >
          {{ fetching ? t('modelPrice.fetching') : t('modelPrice.fetch') }}
        </UButton>
        <UButton
          v-if="isSuperAdmin"
          type="button"
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
          :disabled="!unpriced.length || fetching || importing"
          @click="openBrowse"
        >
          {{ t('modelPrice.importUnpriced') }}
        </UButton>
        <UButton
          v-if="isSuperAdmin"
          type="button"
          color="neutral"
          variant="outline"
          icon="i-lucide-sparkles"
          :loading="syncingAll"
          :disabled="syncingAll || fetching || importing"
          :title="t('modelPrice.syncGatewayHelp')"
          @click="syncGatewayAll"
        >
          {{ syncingAll ? t('modelPrice.syncing') : t('modelPrice.syncGatewayAll') }}
        </UButton>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate()">{{ t('modelPrice.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <div
      v-if="abilityBoard.length"
      class="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <p class="text-sm text-zinc-800 dark:text-zinc-100">{{ t('modelPrice.abilityBoardTitle') }}</p>
      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ t('modelPrice.abilityBoardHint') }}</p>
      <ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="item in abilityBoard"
          :key="item.action"
          class="rounded-md border px-3 py-2 text-xs"
          :class="item.available
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'"
        >
          <strong class="block text-sm">{{ t(`system.mediaAction.${item.action}`) }}</strong>
          <span v-if="item.available">{{ t('modelPrice.abilityReady', { models: (item.models ?? []).join('、') }) }}</span>
          <span v-else-if="item.gap === 'not_on_gateway'">{{ t('modelPrice.abilityNotOnGateway', { models: (item.priced_models ?? []).join('、') }) }}</span>
          <span v-else>{{ t('modelPrice.abilityMissing') }}</span>
        </li>
      </ul>
    </div>

    <div
      v-if="balance"
      class="mb-4 flex items-start gap-3 rounded-lg border px-4 py-3"
      :class="balance.low
        ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40'
        : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60'"
    >
      <UIcon
        :name="balance.low ? 'i-lucide-triangle-alert' : 'i-lucide-wallet'"
        class="mt-0.5 size-4 shrink-0"
        :class="balance.low ? 'text-red-600 dark:text-red-400' : 'text-zinc-400 dark:text-zinc-500'"
      />
      <div class="min-w-0">
        <p class="text-sm" :class="balance.low ? 'font-medium text-red-950 dark:text-red-100' : 'text-zinc-700 dark:text-zinc-200'">
          <template v-if="balance.unlimited">{{ t('modelPrice.balanceUnlimited', { used: balance.used_usd.toFixed(2) }) }}</template>
          <template v-else>{{ balance.low ? t('modelPrice.balanceLow', { remain: balance.remain_usd.toFixed(2) }) : t('modelPrice.balanceTitle', { remain: balance.remain_usd.toFixed(2) }) }}</template>
        </p>
        <p class="mt-1 text-xs" :class="balance.low ? 'text-red-800/80 dark:text-red-200/70' : 'text-zinc-500 dark:text-zinc-400'">
          <template v-if="balance.unlimited">{{ t('modelPrice.balanceUnlimitedHint') }}</template>
          <template v-else>{{ t('modelPrice.balanceHint', { used: balance.used_usd.toFixed(2), threshold: balance.threshold_usd }) }}</template>
        </p>
      </div>
    </div>

    <div
      v-if="unpriced.length"
      class="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-amber-950 dark:text-amber-100">
          {{ t('modelPrice.unpricedTitle', { count: unpriced.length }) }}
        </p>
        <p class="mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">
          {{ t('modelPrice.unpricedHint') }}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <UBadge v-for="item in unpricedStats" :key="item.value" color="warning" variant="subtle">
            {{ item.label }} {{ item.count }}
          </UBadge>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <UButton type="button" color="neutral" variant="outline" class="bg-white dark:bg-zinc-950" @click="openBrowse">
          {{ t('modelPrice.viewUnpriced') }}
        </UButton>
        <UButton v-if="isSuperAdmin" type="button" color="warning" :disabled="fetching || importing" @click="openBrowse">
          {{ t('modelPrice.importUnpriced') }}
        </UButton>
      </div>
    </div>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField :label="t('modelPrice.filterKeyword')">
          <UInput v-model="draft.keyword" :placeholder="t('modelPrice.filterKeywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('modelPrice.filterType')">
          <USelect v-model="draft.type" :items="filterTypeItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('modelPrice.filterStatus')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
      </div>
      <div class="mt-4 flex gap-2">
        <UButton type="button" @click="search">{{ t('common.search') }}</UButton>
        <UButton type="button" variant="outline" @click="reset">{{ t('common.reset') }}</UButton>
      </div>
    </UCard>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-coins" :title="t('modelPrice.empty')" :description="t('modelPrice.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">
                <button type="button" class="-mx-1 inline-flex w-full items-center gap-1 px-1 py-1 text-left" @click="toggleSort('model')">
                  {{ t('modelPrice.colModel') }}
                  <span class="inline-flex flex-col leading-none" aria-hidden="true">
                    <UIcon name="i-lucide-chevron-up" class="h-3.5 w-3.5 shrink-0" :class="caretClass('model', 'asc')" />
                    <UIcon name="i-lucide-chevron-down" class="-mt-1 h-3.5 w-3.5 shrink-0" :class="caretClass('model', 'desc')" />
                  </span>
                </button>
              </th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">
                <button type="button" class="-mx-1 inline-flex w-full items-center justify-center gap-1 px-1 py-1" @click="toggleSort('type')">
                  {{ t('modelPrice.colType') }}
                  <span class="inline-flex flex-col leading-none" aria-hidden="true">
                    <UIcon name="i-lucide-chevron-up" class="h-3.5 w-3.5 shrink-0" :class="caretClass('type', 'asc')" />
                    <UIcon name="i-lucide-chevron-down" class="-mt-1 h-3.5 w-3.5 shrink-0" :class="caretClass('type', 'desc')" />
                  </span>
                </button>
              </th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">
                <button type="button" class="-mx-1 inline-flex w-full items-center justify-center gap-1 px-1 py-1" @click="toggleSort('unit')">
                  {{ t('modelPrice.colUnit') }}
                  <span class="inline-flex flex-col leading-none" aria-hidden="true">
                    <UIcon name="i-lucide-chevron-up" class="h-3.5 w-3.5 shrink-0" :class="caretClass('unit', 'asc')" />
                    <UIcon name="i-lucide-chevron-down" class="-mt-1 h-3.5 w-3.5 shrink-0" :class="caretClass('unit', 'desc')" />
                  </span>
                </button>
              </th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">
                <button type="button" class="-mx-1 inline-flex w-full items-center justify-center gap-1 px-1 py-1" @click="toggleSort('points_per_unit')">
                  {{ t('modelPrice.colStd') }}
                  <span class="inline-flex flex-col leading-none" aria-hidden="true">
                    <UIcon name="i-lucide-chevron-up" class="h-3.5 w-3.5 shrink-0" :class="caretClass('points_per_unit', 'asc')" />
                    <UIcon name="i-lucide-chevron-down" class="-mt-1 h-3.5 w-3.5 shrink-0" :class="caretClass('points_per_unit', 'desc')" />
                  </span>
                </button>
              </th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">{{ t('modelPrice.colMember') }}</th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">{{ t('modelPrice.colPromo') }}</th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100" :title="t('modelPrice.healthToggle')" @click="healthDays = healthDays === 7 ? 30 : 7">
                  {{ t('modelPrice.colHealthDays', { days: healthDays }) }}
                  <UIcon name="i-lucide-repeat" class="size-3" />
                </button>
              </th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">{{ t('modelPrice.colGateway') }}</th>
              <th class="w-[1%] whitespace-nowrap px-3 py-3">{{ t('modelPrice.colStatus') }}</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-3 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="max-w-0 w-full px-4 py-3">
                <div class="truncate font-mono text-sm" :title="item.model">{{ item.model }}</div>
                <div
                  v-if="item.label && item.label !== item.model"
                  class="mt-0.5 truncate text-xs text-zinc-400"
                  :title="item.label"
                >
                  {{ item.label }}
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3">{{ TYPE_LABEL[item.type] }}</td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3">{{ UNIT_LABEL[item.unit] }}</td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3 tabular-nums">{{ item.pointsPerUnit }} {{ t('modelPrice.points') }}</td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3 tabular-nums">{{ item.memberPointsPerUnit ? `${item.memberPointsPerUnit} ${t('modelPrice.points')}` : t('modelPrice.sameAsStd') }}</td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3 tabular-nums">
                <span v-if="promoState(item) === 'none'" class="text-zinc-400">—</span>
                <div v-else class="flex items-center gap-1.5">
                  <span>{{ item.promoPointsPerUnit }} {{ t('modelPrice.points') }}</span>
                  <UBadge
                    :color="promoState(item) === 'active' ? 'error' : promoState(item) === 'scheduled' ? 'warning' : 'neutral'"
                    variant="subtle"
                    :title="item.promoEndsAt ? t('modelPrice.promoUntil', { time: formatUnix(item.promoEndsAt) }) : undefined"
                  >
                    {{ promoState(item) === 'active' ? (item.promoLabel || t('modelPrice.promoActive')) : promoState(item) === 'scheduled' ? t('modelPrice.promoScheduled') : t('modelPrice.promoEnded') }}
                  </UBadge>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3 tabular-nums">
                <span v-if="!health[item.model]" class="text-zinc-400">—</span>
                <div v-else class="flex flex-col items-start gap-0.5">
                  <span>{{ t('modelPrice.healthRate', { rate: Math.round((100 - health[item.model]!.fail_rate) * 10) / 10, total: health[item.model]!.total }) }}</span>
                  <UBadge v-if="health[item.model]!.suggest_offline && item.status === 1" color="error" variant="solid" :title="healthTitle(health[item.model]!)">{{ t('modelPrice.healthOffline') }}</UBadge>
                  <UBadge v-else-if="health[item.model]!.warn" color="error" variant="subtle" :title="healthTitle(health[item.model]!)">{{ t('modelPrice.healthWarn') }}</UBadge>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3">
                <UBadge v-if="!gatewayKnown" color="neutral" variant="subtle">—</UBadge>
                <UBadge v-else :color="item.available ? 'success' : 'neutral'" variant="subtle">
                  {{ item.available ? t('modelPrice.available') : t('modelPrice.unavailable') }}
                </UBadge>
              </td>
              <td class="w-[1%] whitespace-nowrap px-3 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('modelPrice.statusOn') : t('modelPrice.statusOff') }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-3 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                  <UButton v-if="isSuperAdmin" type="button" size="sm" variant="soft" color="neutral" :loading="syncingId === item.id" :disabled="syncingId === item.id" :title="t('modelPrice.syncGatewayHelp')" @click="syncGatewayOne(item)">{{ t('modelPrice.syncGateway') }}</UButton>
                  <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                    {{ item.status === 1 ? t('modelPrice.disable') : t('modelPrice.enable') }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="confirmOpen" :title="confirmAction === 'delete' ? t('modelPrice.confirmDelete') : t('modelPrice.confirmStatus', { action: confirmItem?.status === 1 ? t('modelPrice.disable') : t('modelPrice.enable') })" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          {{ t('modelPrice.confirmBody', { action: confirmAction === 'delete' ? t('common.delete') : (confirmItem?.status === 1 ? t('modelPrice.disable') : t('modelPrice.enable')), name: confirmItem?.label || confirmItem?.model }) }}
          <template v-if="confirmAction === 'delete' || confirmItem?.status === 1">{{ t('modelPrice.confirmWarn') }}</template>
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :color="confirmAction === 'delete' ? 'error' : 'primary'" :loading="confirming" :disabled="confirming" @click="confirm">
          {{ confirming ? t('common.processing') : t('common.confirm') }}
        </UButton>
      </template>
    </UModal>

    <USlideover
      v-model:open="browseOpen"
      side="right"
      :title="t('modelPrice.browseTitle')"
      :description="t('modelPrice.unpricedTitle', { count: unpriced.length })"
      :dismissible="!formOpen && !importOpen"
      :ui="{ content: 'w-[min(100vw,56rem)] max-w-[min(100vw,56rem)] sm:max-w-[56rem]', body: 'flex min-h-0 flex-1 flex-col', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="flex min-h-0 flex-1 flex-col gap-3">
          <div class="grid shrink-0 gap-3 sm:grid-cols-[1fr_12rem]">
            <UInput
              v-model="browseKeyword"
              :placeholder="t('modelPrice.filterKeywordPh')"
              icon="i-lucide-search"
              class="w-full"
            />
            <USelect v-model="browseType" :items="browseTypeItems" value-key="value" class="w-full" />
          </div>
          <div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div v-if="filteredUnpriced.length === 0" class="px-4 py-10 text-center text-sm text-zinc-500">
              {{ t('modelPrice.browseEmpty') }}
            </div>
            <div v-else class="h-full overflow-auto">
              <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead class="sticky top-0 z-20 bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2.5">
                      <UCheckbox
                        :model-value="allFilteredSelected"
                        :indeterminate="someFilteredSelected"
                        @update:model-value="(value: boolean | 'indeterminate') => toggleSelectAll(value === true)"
                      />
                    </th>
                    <th class="min-w-0 w-full px-3 py-2.5 text-left">{{ t('modelPrice.colModel') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2.5">{{ t('modelPrice.colType') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2.5" :title="t('modelPrice.costHint')">{{ t('modelPrice.colCost') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2.5">{{ t('modelPrice.suggestPoints') }}</th>
                    <th class="sticky right-0 z-30 w-[1%] whitespace-nowrap bg-zinc-50 px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <tr
                    v-for="item in filteredUnpriced"
                    :key="item.model"
                    class="group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                    @click="toggleSelect(item.model, !isSelected(item.model))"
                  >
                    <td class="w-[1%] whitespace-nowrap px-3 py-2.5" @click.stop>
                      <UCheckbox
                        :model-value="isSelected(item.model)"
                        @update:model-value="(value: boolean | 'indeterminate') => toggleSelect(item.model, value === true)"
                      />
                    </td>
                    <td class="max-w-0 w-full px-3 py-2.5">
                      <p class="truncate font-mono text-xs" :title="item.model">{{ item.model }}</p>
                      <p v-if="item.label && item.label !== item.model" class="mt-0.5 truncate text-xs text-zinc-400" :title="modelPickTip(item.label)">{{ item.label }}</p>
                    </td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2.5">{{ TYPE_LABEL[item.type] }}</td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2.5 tabular-nums" :title="item.estimate || undefined">{{ fmtCost(item.priceYuan) }}</td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2.5 tabular-nums">{{ item.suggestPoints || '—' }}</td>
                    <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-3 py-2.5 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                      <div class="flex w-max flex-nowrap gap-1">
                        <UButton type="button" size="sm" variant="soft" @click.stop="openCreate(item)">{{ t('modelPrice.priceOne') }}</UButton>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p class="shrink-0 text-xs text-zinc-500">
            {{ t('common.totalItems', { total: filteredUnpriced.length }) }}
            <span v-if="selectedUnpriced.length" class="ml-2">{{ t('modelPrice.selectedCount', { count: selectedUnpriced.length }) }}</span>
          </p>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" @click="() => { browseOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton
          v-if="isSuperAdmin"
          type="button"
          :disabled="!selectedUnpriced.length || fetching || importing"
          @click="requestImport"
        >
          {{ t('modelPrice.importSelected') }}
        </UButton>
      </template>
    </USlideover>

    <UModal
      v-model:open="formOpen"
      portal="#model-price-dialog-root"
      :title="editing ? t('modelPrice.editTitle') : t('modelPrice.createTitle')"
      :ui="{ overlay: 'z-[80]', content: 'z-[80] w-[min(96vw,36rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('modelPrice.colModel')" required :error="errors.model || undefined" :help="t('modelPrice.modelHint')">
            <USelect
              v-if="!editing && modelOptions.length"
              :model-value="form.model"
              :items="modelOptions"
              :title="modelPickTip(modelOptions.find(item => item.value === form.model)?.label)"
              value-key="value"
              :placeholder="t('modelPrice.modelPick')"
              :ui="modalSelectUi"
              class="mb-2 w-full"
              @update:model-value="onPickModel"
            >
              <template #item-label="{ item }">
                <UTooltip
                  :text="modelPickTip(item.label)"
                  :disabled="!modelPickTip(item.label)"
                  :delay-duration="200"
                  :content="{ side: 'top', sideOffset: 6 }"
                  :ui="{ content: 'z-[100]' }"
                  class="block w-full min-w-0"
                >
                  <span class="block truncate">{{ item.label }}</span>
                </UTooltip>
              </template>
            </USelect>
            <UInput v-model="form.model" :disabled="!!editing" maxlength="100" placeholder="例如 kling-v1" class="w-full font-mono" />
          </UFormField>
          <UFormField :label="t('modelPrice.colLabel')">
            <UInput v-model="form.label" maxlength="100" :placeholder="t('modelPrice.labelPh')" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('modelPrice.colType')" required>
              <USelect v-model="form.type" :items="typeItems" value-key="value" :ui="modalSelectUi" class="w-full" />
            </UFormField>
            <UFormField :label="t('modelPrice.colUnit')" required>
              <USelect v-model="form.unit" :items="unitItems" value-key="value" :ui="modalSelectUi" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('modelPrice.suggestPoints')">
              <div class="flex gap-2">
                <UInput
                  :model-value="formSuggestPoints == null ? '' : String(formSuggestPoints)"
                  disabled
                  class="w-full tabular-nums"
                  :placeholder="t('modelPrice.suggestNone')"
                />
                <UButton
                  v-if="formSuggestPoints != null"
                  type="button"
                  color="neutral"
                  variant="outline"
                  class="shrink-0"
                  :disabled="saving"
                  @click="applySuggest"
                >
                  {{ t('modelPrice.applySuggest') }}
                </UButton>
              </div>
            </UFormField>
            <UFormField :label="t('modelPrice.stdPoints')" required :error="errors.pointsPerUnit || undefined">
              <UInput v-model="form.pointsPerUnit" type="number" min="0" step="1" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('modelPrice.memberPoints')" :help="t('modelPrice.memberHint')">
            <UInput v-model="form.memberPointsPerUnit" type="number" min="0" step="1" class="w-full" />
          </UFormField>
          <div class="rounded-lg border border-dashed border-zinc-200 p-4 dark:border-zinc-800">
            <p class="mb-3 text-sm font-medium text-zinc-900 dark:text-white">{{ t('modelPrice.promoTitle') }}</p>
            <p class="mb-4 text-xs text-zinc-500">{{ t('modelPrice.promoHint') }}</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('modelPrice.promoPoints')" :error="errors.promoPointsPerUnit || undefined">
                <UInput v-model="form.promoPointsPerUnit" type="number" min="0" step="1" class="w-full" :placeholder="t('modelPrice.promoPointsPh')" />
              </UFormField>
              <UFormField :label="t('modelPrice.promoLabel')">
                <UInput v-model="form.promoLabel" maxlength="20" class="w-full" :placeholder="t('modelPrice.promoLabelPh')" />
              </UFormField>
              <UFormField :label="t('modelPrice.promoStartsAt')" :help="t('modelPrice.promoStartsHelp')">
                <UInput v-model="form.promoStartsAt" type="datetime-local" class="w-full" />
              </UFormField>
              <UFormField :label="t('modelPrice.promoEndsAt')" :help="t('modelPrice.promoEndsHelp')" :error="errors.promoEndsAt || undefined">
                <UInput v-model="form.promoEndsAt" type="datetime-local" class="w-full" />
              </UFormField>
              <UFormField :label="t('modelPrice.durations')" :help="t('modelPrice.durationsHelp')">
                <UInput v-model="form.durations" class="w-full" placeholder="4,8,12" />
              </UFormField>
              <UFormField :label="t('modelPrice.resolutions')" :help="t('modelPrice.resolutionsHelp')">
                <UInput v-model="form.resolutions" class="w-full" placeholder="512P,768P,1080P" />
              </UFormField>
              <UFormField :label="t('modelPrice.frameMatch')" :help="t('modelPrice.frameMatchHelp')" class="sm:col-span-2">
                <USwitch v-model="form.frameMatch" :label="t('modelPrice.frameMatchOn')" />
              </UFormField>
              <UFormField v-if="form.type === 'image'" :label="t('modelPrice.imageInput')" :help="t('modelPrice.imageInputHelp')" class="sm:col-span-2">
                <USelect v-model="form.imageInput" :items="imageInputItems" value-key="value" :ui="modalSelectUi" class="w-full" />
              </UFormField>
              <UFormField v-if="form.type === 'video' || form.type === 'audio' || form.type === 'image'" :label="t('modelPrice.abilities')" :help="t('modelPrice.abilitiesHelp')" class="sm:col-span-2">
                <div class="flex flex-wrap gap-x-5 gap-y-2">
                  <UCheckbox
                    v-for="item in abilityItems"
                    :key="item.value"
                    :model-value="form.abilities.includes(item.value)"
                    :label="item.label"
                    @update:model-value="toggleAbility(item.value, $event)"
                  />
                </div>
              </UFormField>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="submit">{{ saving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="importOpen"
      portal="#model-price-dialog-root"
      :title="t('modelPrice.importTitle')"
      :ui="{ overlay: 'z-[80]', content: 'z-[80] w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          {{ t('modelPrice.importBody', { count: selectedUnpriced.length }) }}
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="importing" @click="() => { importOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="importing" :disabled="importing || !selectedUnpriced.length" @click="confirmImport">
          {{ importing ? t('modelPrice.importing') : t('common.confirm') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
