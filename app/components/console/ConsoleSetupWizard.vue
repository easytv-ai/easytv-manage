<script setup lang="ts">
import { adminGatewayApi } from '~/api/gateway'
import {
  countGatewayModelsByType,
  defaultSetupPicks,
  GATEWAY_MODEL_TYPES,
  type GatewayModel,
  type GatewayModelType,
  isGatewayModelImportable,
} from '~/utils/gateway-models'
import { resolveOfficialSiteUrl } from '~/utils/officialSite'

/**
 * 仪表板顶部的开始使用向导（API.md 40）：网关未配置或没有生效模型时显示，配好后不再出现。
 * 三步的写操作都是超级管理员接口；普通管理员只看状态。
 */

type SetupStatus = {
  ready: boolean
  gateway: { configured: boolean, enabled: boolean }
  models: { priced_count: number, total_count: number, by_type: Record<GatewayModelType, number> }
  storage: { kind: 'local' | 'oss' | 'qiniu', has_public_base_url: boolean }
  media: { ffmpeg: boolean, ffprobe: boolean }
}

/** 收起状态只是个人界面偏好，存浏览器本地 */
const COLLAPSED_KEY = 'easytv-manage:setup-wizard-collapsed'

const { t } = useI18n()
const localePath = useLocalePath()
const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { gatewayModels, gatewayKnown, fetching, importing, pullGatewayModels, importGatewayModels } = useGatewayModels()

const status = ref<SetupStatus | null>(null)
/** 进入页面时就已配好则整张卡片不出现；本次会话里刚配完的保留完成提示 */
const readyOnLoad = ref(false)
const collapsed = ref(false)

const form = reactive({ baseUrl: '', apiKey: '', enabled: true })
const hasApiKey = ref(false)
const formError = ref('')
const saving = ref(false)
/** 本次会话的连通性测试结果：保存网关后用拉模型是否成功判定 */
const connection = ref<'unknown' | 'ok' | 'fail'>('unknown')
const connectionMessage = ref('')
const picked = ref<Set<string>>(new Set())
const importResult = ref<{ created: number, updated: number, skipped: number } | null>(null)

const visible = computed(() => Boolean(status.value) && !readyOnLoad.value)
const done = computed(() => Boolean(status.value?.ready))
const gatewayDone = computed(() => Boolean(status.value?.gateway.configured && status.value?.gateway.enabled))
/** 第一步的完成标记：配置存了但本次连通测试没过，不算完成 */
const gatewayStepDone = computed(() => gatewayDone.value && connection.value !== 'fail')
const pulledCounts = computed(() => countGatewayModelsByType(gatewayModels.value))
const pricedDone = computed(() => (status.value?.models.priced_count ?? 0) > 0)
const pullDone = computed(() => gatewayKnown.value || pricedDone.value)

const typeLabel = computed<Record<GatewayModelType, string>>(() => ({
  text: t('common.text'),
  image: t('common.image'),
  video: t('common.video'),
  audio: t('common.voice'),
}))
const unitLabel = computed<Record<string, string>>(() => ({
  second: t('common.unitSecondShort'),
  image: t('common.unitImageShort'),
  call: t('common.unitCallShort'),
}))

const importableGroups = computed(() => GATEWAY_MODEL_TYPES
  .map(type => ({ type, items: gatewayModels.value.filter(m => m.type === type && isGatewayModelImportable(m)) }))
  .filter(group => group.items.length > 0))
/** 网关没给建议积分的未定价模型：向导不导入，交给定价页手动定价 */
const unsuggestedCount = computed(() => gatewayModels.value.filter(m => !m.existing && m.suggestPoints <= 0).length)
const pickedItems = computed<GatewayModel[]>(() => gatewayModels.value.filter(m => picked.value.has(m.model) && isGatewayModelImportable(m)))

const studioUrl = computed(() => resolveOfficialSiteUrl())

const storageText = computed(() => {
  const storage = status.value?.storage
  if (!storage)
    return ''
  if (storage.kind === 'local')
    return storage.has_public_base_url ? t('setup.storageLocalPublic') : t('setup.storageLocal')
  return storage.kind === 'oss' ? t('setup.storageOss') : t('setup.storageQiniu')
})
const storageWarn = computed(() => status.value?.storage.kind === 'local' && !status.value.storage.has_public_base_url)

async function loadStatus() {
  const raw = await adminGatewayApi.setupStatus()
  if (!raw || raw.success !== true || !raw.data?.gateway)
    return false
  status.value = raw.data as SetupStatus
  return true
}

async function loadGatewayForm() {
  const raw = await adminGatewayApi.config()
  if (!raw || raw.success !== true)
    return
  const gateway = raw.data?.gateway ?? {}
  form.baseUrl = String(gateway.base_url || '')
  hasApiKey.value = Boolean(gateway.has_api_key)
  // 还没有令牌时开关缺省打开：填完令牌就该能用
  form.enabled = hasApiKey.value ? Boolean(gateway.enabled) : true
}

function applyPulled() {
  picked.value = new Set(defaultSetupPicks(gatewayModels.value))
}

async function testConnection() {
  const result = await pullGatewayModels()
  if (!result)
    return
  if (result.ok) {
    connection.value = 'ok'
    connectionMessage.value = ''
    applyPulled()
  }
  else {
    connection.value = 'fail'
    connectionMessage.value = result.message
  }
}

async function saveGateway() {
  if (saving.value)
    return
  formError.value = ''
  const baseUrl = form.baseUrl.trim().replace(/\/+$/, '')
  const apiKey = form.apiKey.trim()
  if (!/^https?:\/\/.+/i.test(baseUrl)) {
    formError.value = t('system.gatewayBaseUrlInvalid')
    return
  }
  if (!apiKey && !hasApiKey.value) {
    formError.value = t('setup.apiKeyRequired')
    return
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = { base_url: baseUrl, enabled: form.enabled }
    if (apiKey)
      payload.api_key = apiKey
    const raw = await adminGatewayApi.update(payload)
    if (!raw || raw.success !== true) {
      notify(raw?.message ?? t('system.saveFail'), 'error')
      return
    }
    form.apiKey = ''
    hasApiKey.value = Boolean(raw.data?.gateway?.has_api_key)
    await loadStatus()
    await testConnection()
  }
  finally {
    saving.value = false
  }
}

async function pullModels() {
  const result = await pullGatewayModels()
  if (!result)
    return
  if (!result.ok) {
    connection.value = 'fail'
    connectionMessage.value = result.message
    notify(result.message || t('modelPrice.fetchFail'), 'error')
    return
  }
  connection.value = 'ok'
  connectionMessage.value = ''
  applyPulled()
}

function togglePick(model: string, on: boolean) {
  const next = new Set(picked.value)
  if (on)
    next.add(model)
  else
    next.delete(model)
  picked.value = next
}

async function importPicked() {
  if (!pickedItems.value.length) {
    notify(t('modelPrice.importNeedSelect'), 'error')
    return
  }
  const result = await importGatewayModels(pickedItems.value)
  if (!result)
    return
  if (!result.ok) {
    notify(result.message || t('modelPrice.importFail'), 'error')
    return
  }
  importResult.value = { created: result.created, updated: result.updated, skipped: result.skippedModels.length }
  if (result.skippedModels.length)
    notify(t('modelPrice.importSkipped', { count: result.skippedModels.length, models: result.skippedModels.join('、') }), 'error')
  applyPulled()
  await loadStatus()
}

function setCollapsed(value: boolean) {
  collapsed.value = value
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  }
  catch {
    // 本地存储不可用时只在本次会话内生效
  }
}

onMounted(async () => {
  try {
    collapsed.value = localStorage.getItem(COLLAPSED_KEY) === '1'
  }
  catch {
    collapsed.value = false
  }
  if (!await loadStatus())
    return
  readyOnLoad.value = Boolean(status.value?.ready)
  if (!readyOnLoad.value && isSuperAdmin.value)
    await loadGatewayForm()
})
</script>

<template>
  <section
    v-if="visible && status"
    class="mb-6 rounded-lg border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-500/40 dark:bg-amber-500/5"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-white">
          <UIcon :name="done ? 'i-lucide-circle-check' : 'i-lucide-rocket'" class="size-5" :class="done ? 'text-emerald-500' : 'text-amber-500'" />
          {{ done ? t('setup.doneTitle') : t('setup.title') }}
        </h2>
        <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {{ done ? t('setup.doneDesc') : t('setup.desc') }}
        </p>
      </div>
      <UButton
        type="button"
        size="sm"
        color="neutral"
        variant="ghost"
        :icon="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
        @click="setCollapsed(!collapsed)"
      >
        {{ collapsed ? t('setup.expand') : t('setup.collapse') }}
      </UButton>
    </div>

    <div v-if="!collapsed" class="mt-4 space-y-4">
      <div v-if="done" class="flex flex-wrap items-center gap-3 text-sm">
        <span v-if="importResult">{{ t('modelPrice.importOk', { created: importResult.created, updated: importResult.updated }) }}</span>
        <UButton
          v-if="studioUrl"
          :to="studioUrl"
          target="_blank"
          rel="noopener"
          icon="i-lucide-external-link"
        >
          {{ t('setup.openStudio') }}
        </UButton>
        <span v-else class="text-zinc-500">{{ t('setup.studioUrlMissing') }}</span>
        <UButton :to="localePath('/model-price')" color="neutral" variant="outline">{{ t('setup.openModelPrice') }}</UButton>
      </div>

      <p v-if="!isSuperAdmin && !done" class="rounded-md bg-white/70 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
        {{ t('setup.needSuperAdmin') }}
      </p>

      <ol v-if="!done" class="space-y-4">
        <!-- 第一步：网关地址与令牌 -->
        <li class="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="gatewayStepDone ? 'success' : 'neutral'" variant="subtle">{{ gatewayStepDone ? t('setup.stepDone') : t('setup.stepTodo') }}</UBadge>
            <h3 class="text-sm font-semibold">{{ t('setup.step1Title') }}</h3>
            <UBadge v-if="connection === 'ok'" color="success" variant="soft">{{ t('setup.connectionOk') }}</UBadge>
            <UBadge v-else-if="connection === 'fail'" color="error" variant="soft">{{ t('setup.connectionFail') }}</UBadge>
          </div>
          <p class="mt-1 text-xs text-zinc-500">{{ t('setup.step1Desc') }}</p>
          <div v-if="isSuperAdmin" class="mt-3 grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('system.gatewayBaseUrl')" required>
              <UInput v-model="form.baseUrl" class="w-full" placeholder="http://localhost:3000" />
            </UFormField>
            <UFormField :label="t('system.gatewayApiKey')" :required="!hasApiKey" :help="hasApiKey ? t('setup.apiKeyKeep') : undefined">
              <UInput v-model="form.apiKey" type="password" autocomplete="off" class="w-full" :placeholder="t('system.gatewayApiKeyPh')" />
            </UFormField>
            <div class="flex flex-wrap items-center gap-4 sm:col-span-2">
              <USwitch v-model="form.enabled" :label="t('system.gatewayEnabled')" />
              <UButton type="button" :loading="saving" :disabled="saving" @click="saveGateway">
                {{ t('setup.saveAndTest') }}
              </UButton>
              <span v-if="formError" class="text-sm text-red-600">{{ formError }}</span>
            </div>
            <p v-if="connection === 'fail'" class="text-sm text-red-600 sm:col-span-2">
              {{ t('setup.connectionFailDetail', { message: connectionMessage || t('modelPrice.fetchFail') }) }}
            </p>
          </div>
        </li>

        <!-- 第二步：拉取网关模型 -->
        <li class="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="pullDone ? 'success' : 'neutral'" variant="subtle">{{ pullDone ? t('setup.stepDone') : t('setup.stepTodo') }}</UBadge>
            <h3 class="text-sm font-semibold">{{ t('setup.step2Title') }}</h3>
          </div>
          <p class="mt-1 text-xs text-zinc-500">{{ t('setup.step2Desc') }}</p>
          <div v-if="isSuperAdmin" class="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <UButton type="button" color="neutral" variant="outline" icon="i-lucide-download" :loading="fetching" :disabled="fetching || !gatewayDone" @click="pullModels">
              {{ fetching ? t('modelPrice.fetching') : t('modelPrice.fetch') }}
            </UButton>
            <template v-if="gatewayKnown">
              <span>{{ t('setup.pulledTotal', { count: gatewayModels.length }) }}</span>
              <span v-for="type in GATEWAY_MODEL_TYPES" :key="type" class="tabular-nums text-zinc-500">
                {{ typeLabel[type] }} {{ pulledCounts[type] }}
              </span>
            </template>
          </div>
        </li>

        <!-- 第三步：勾选并导入定价 -->
        <li class="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="pricedDone ? 'success' : 'neutral'" variant="subtle">{{ pricedDone ? t('setup.stepDone') : t('setup.stepTodo') }}</UBadge>
            <h3 class="text-sm font-semibold">{{ t('setup.step3Title') }}</h3>
            <span class="text-xs text-zinc-500">{{ t('setup.pricedCount', { count: status.models.priced_count }) }}</span>
          </div>
          <p class="mt-1 text-xs text-zinc-500">{{ t('setup.step3Desc') }}</p>
          <template v-if="isSuperAdmin && gatewayKnown">
            <p v-if="!importableGroups.length" class="mt-3 text-sm text-zinc-500">{{ t('setup.nothingImportable') }}</p>
            <div v-else class="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
              <div v-for="group in importableGroups" :key="group.type">
                <p class="mb-1 text-xs font-medium text-zinc-500">{{ typeLabel[group.type] }}（{{ group.items.length }}）</p>
                <div class="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                  <UCheckbox
                    v-for="item in group.items"
                    :key="item.model"
                    :model-value="picked.has(item.model)"
                    :label="item.label || item.model"
                    :description="t('setup.pointsPerUnit', { points: item.suggestPoints, unit: unitLabel[item.unit] || item.unit })"
                    @update:model-value="togglePick(item.model, $event === true)"
                  />
                </div>
              </div>
            </div>
            <p v-if="unsuggestedCount" class="mt-3 text-xs text-zinc-500">
              {{ t('setup.unsuggested', { count: unsuggestedCount }) }}
              <NuxtLink :to="localePath('/model-price')" class="underline">{{ t('setup.openModelPrice') }}</NuxtLink>
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <UButton type="button" :loading="importing" :disabled="importing || !pickedItems.length" @click="importPicked">
                {{ importing ? t('modelPrice.importing') : t('setup.importPicked', { count: pickedItems.length }) }}
              </UButton>
            </div>
          </template>
        </li>
      </ol>

      <!-- 环境自检：只读 -->
      <div class="flex flex-wrap items-start gap-x-6 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span class="font-medium">{{ t('setup.envCheck') }}</span>
        <span :class="storageWarn ? 'text-amber-700 dark:text-amber-400' : ''">{{ t('setup.storage') }}：{{ storageText }}</span>
        <span :class="status.media.ffmpeg ? '' : 'text-amber-700 dark:text-amber-400'">
          ffmpeg：{{ status.media.ffmpeg ? t('setup.ffmpegOk') : t('setup.ffmpegMissing') }}
        </span>
        <span v-if="status.media.ffmpeg && !status.media.ffprobe" class="text-amber-700 dark:text-amber-400">
          ffprobe：{{ t('setup.ffmpegMissing') }}
        </span>
      </div>
    </div>
  </section>
</template>
