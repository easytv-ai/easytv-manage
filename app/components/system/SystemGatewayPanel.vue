<script setup lang="ts">
import { adminGatewayApi } from '~/api/gateway'
import settingApi from '~/api/setting'
import { parseSettingMap } from '~/utils/admin-setting'
import { isApiSuccess } from '~/utils/admin-user'

const { t } = useI18n()
const { notify } = useNotifyToast()

const loading = ref(true)
const gatewayForm = reactive({
  enabled: false,
  baseUrl: '',
  pricingBaseUrl: '',
  apiKey: '',
  accessToken: '',
  userId: '',
  uploadBaseUrl: '',
  markupRate: '3',
  pointsRate: '20',
  usdRate: '7.3',
  partnerDiscount: '1',
  alertUsd: '20',
})
const qiniuForm = reactive({
  accessKey: '',
  secretKey: '',
  bucket: '',
  projectCode: '',
  domain: '',
})
const errors = reactive({
  baseUrl: '',
  pricingBaseUrl: '',
  markupRate: '',
  pointsRate: '',
  usdRate: '',
  partnerDiscount: '',
  alertUsd: '',
})
const saveLoading = reactive({
  gateway: false,
  qiniu: false,
})

/** 成片能力（只读探测，来自 GET /admin/gateway/config 的 cover） */
const coverCaps = reactive({
  ffmpeg: false,
  ossSnapshot: false,
})

let gatewaySnapshot = {
  enabled: false,
  baseUrl: '',
  pricingBaseUrl: '',
  uploadBaseUrl: '',
  markupRate: '3',
  pointsRate: '20',
  usdRate: '7.3',
  partnerDiscount: '1',
  hasApiKey: false,
  hasAccessToken: false,
  userId: '',
  alertUsd: '20',
}
let qiniuSnapshot = {
  bucket: '',
  projectCode: '',
  domain: '',
  hasKeys: false,
}

function applyConfig(raw: any) {
  const data = raw?.data ?? raw ?? {}
  const gateway = data.gateway ?? {}
  const pricing = data.pricing ?? {}
  const qiniu = data.qiniu ?? {}
  const cover = data.cover ?? {}
  gatewayForm.enabled = Boolean(gateway.enabled)
  gatewayForm.baseUrl = String(gateway.base_url || '')
  // 定价地址与网关同域名时不必单独填，后端回的是实际生效值
  gatewayForm.pricingBaseUrl = String(pricing.base_url || '') === String(gateway.base_url || '')
    ? ''
    : String(pricing.base_url || '')
  gatewayForm.apiKey = ''
  gatewayForm.accessToken = ''
  gatewayForm.userId = String(gateway.user_id || '')
  gatewayForm.uploadBaseUrl = String(data.upload_base_url || '')
  gatewayForm.markupRate = String(pricing.markup_rate ?? 3)
  gatewayForm.pointsRate = String(pricing.points_rate ?? 20)
  gatewayForm.usdRate = String(pricing.usd_rate ?? 7.3)
  gatewayForm.partnerDiscount = String(pricing.partner_discount ?? 1)
  qiniuForm.accessKey = ''
  qiniuForm.secretKey = ''
  qiniuForm.bucket = String(qiniu.bucket || '')
  qiniuForm.projectCode = String(qiniu.project_code || '')
  qiniuForm.domain = String(qiniu.domain || '')
  coverCaps.ffmpeg = Boolean(cover.ffmpeg)
  coverCaps.ossSnapshot = Boolean(cover.oss_snapshot)
  gatewaySnapshot = {
    enabled: gatewayForm.enabled,
    baseUrl: gatewayForm.baseUrl,
    pricingBaseUrl: gatewayForm.pricingBaseUrl,
    uploadBaseUrl: gatewayForm.uploadBaseUrl,
    markupRate: gatewayForm.markupRate,
    pointsRate: gatewayForm.pointsRate,
    usdRate: gatewayForm.usdRate,
    partnerDiscount: gatewayForm.partnerDiscount,
    hasApiKey: Boolean(gateway.has_api_key),
    hasAccessToken: Boolean(gateway.has_access_token),
    userId: gatewayForm.userId,
    alertUsd: gatewaySnapshot.alertUsd || gatewayForm.alertUsd,
  }
  qiniuSnapshot = {
    bucket: qiniuForm.bucket,
    projectCode: qiniuForm.projectCode,
    domain: qiniuForm.domain,
    hasKeys: Boolean(qiniu.has_keys),
  }
}

async function refresh(opts?: { silent?: boolean }) {
  if (!opts?.silent)
    loading.value = true
  try {
    const [raw, settingRaw] = await Promise.all([adminGatewayApi.config(), settingApi.list()])
    if (!isApiSuccess(raw)) {
      notify((raw as any)?.message ?? t('system.loadFail'), 'error')
      return
    }
    applyConfig(raw)
    const map = parseSettingMap(settingRaw)
    if (map) {
      const rawAlert = map.GatewayBalanceAlertUSD
      const alert = rawAlert != null && String(rawAlert) !== '' ? String(rawAlert) : '20'
      gatewayForm.alertUsd = alert
      gatewaySnapshot.alertUsd = alert
    }
  }
  catch {
    notify(t('system.loadFail'), 'error')
  }
  finally {
    if (!opts?.silent)
      loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

function positiveNumber(raw: string) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function validateGateway() {
  errors.baseUrl = ''
  errors.pricingBaseUrl = ''
  errors.markupRate = ''
  errors.pointsRate = ''
  errors.usdRate = ''
  errors.partnerDiscount = ''
  errors.alertUsd = ''
  const baseUrl = gatewayForm.baseUrl.trim()
  if (!baseUrl)
    errors.baseUrl = t('system.gatewayBaseUrlRequired')
  else if (!/^https?:\/\/.+/i.test(baseUrl))
    errors.baseUrl = t('system.gatewayBaseUrlInvalid')
  const pricingBaseUrl = gatewayForm.pricingBaseUrl.trim()
  if (pricingBaseUrl && !/^https?:\/\/.+/i.test(pricingBaseUrl))
    errors.pricingBaseUrl = t('system.gatewayBaseUrlInvalid')
  if (!positiveNumber(gatewayForm.markupRate))
    errors.markupRate = t('system.gatewayRateInvalid')
  if (!positiveNumber(gatewayForm.pointsRate))
    errors.pointsRate = t('system.gatewayRateInvalid')
  if (!positiveNumber(gatewayForm.usdRate))
    errors.usdRate = t('system.gatewayRateInvalid')
  const partnerDiscount = positiveNumber(gatewayForm.partnerDiscount)
  if (!partnerDiscount || partnerDiscount > 1)
    errors.partnerDiscount = t('system.gatewayDiscountInvalid')
  const alert = gatewayForm.alertUsd.trim()
  const alertNum = Number(alert)
  if (alert === '' || !Number.isFinite(alertNum) || alertNum < 0)
    errors.alertUsd = t('system.gatewayAlertInvalid')
  return !errors.baseUrl && !errors.pricingBaseUrl && !errors.markupRate && !errors.pointsRate && !errors.usdRate && !errors.partnerDiscount && !errors.alertUsd
}

async function persist(payload: Record<string, unknown>, section: 'gateway' | 'qiniu', successMsg: string) {
  if (!Object.keys(payload).length) {
    notify(t('system.noChange'), 'warning')
    return
  }
  saveLoading[section] = true
  try {
    const raw = await adminGatewayApi.update(payload)
    if (!isApiSuccess(raw)) {
      notify((raw as any)?.message ?? t('system.saveFail'), 'error')
      return
    }
    notify(successMsg)
    applyConfig(raw)
  }
  catch {
    notify(t('system.saveFail'), 'error')
  }
  finally {
    saveLoading[section] = false
  }
}

async function submitGateway() {
  if (!validateGateway() || saveLoading.gateway)
    return
  const payload: Record<string, unknown> = {}
  const baseUrl = gatewayForm.baseUrl.trim().replace(/\/$/, '')
  const uploadBaseUrl = gatewayForm.uploadBaseUrl.trim().replace(/\/$/, '')
  const markupRate = positiveNumber(gatewayForm.markupRate)
  const pointsRate = positiveNumber(gatewayForm.pointsRate)
  const usdRate = positiveNumber(gatewayForm.usdRate)
  const partnerDiscount = positiveNumber(gatewayForm.partnerDiscount)
  if (gatewayForm.enabled !== gatewaySnapshot.enabled)
    payload.enabled = gatewayForm.enabled
  if (baseUrl !== gatewaySnapshot.baseUrl)
    payload.base_url = baseUrl
  const pricingBaseUrl = gatewayForm.pricingBaseUrl.trim().replace(/\/$/, '')
  if (pricingBaseUrl !== gatewaySnapshot.pricingBaseUrl)
    payload.pricing_base_url = pricingBaseUrl
  if (uploadBaseUrl !== gatewaySnapshot.uploadBaseUrl)
    payload.upload_base_url = uploadBaseUrl
  if (markupRate !== Number(gatewaySnapshot.markupRate))
    payload.markup_rate = markupRate
  if (pointsRate !== Number(gatewaySnapshot.pointsRate))
    payload.points_rate = pointsRate
  if (usdRate !== Number(gatewaySnapshot.usdRate))
    payload.usd_rate = usdRate
  if (partnerDiscount !== Number(gatewaySnapshot.partnerDiscount))
    payload.partner_discount = partnerDiscount
  if (gatewayForm.apiKey.trim())
    payload.api_key = gatewayForm.apiKey.trim()
  if (gatewayForm.accessToken.trim())
    payload.access_token = gatewayForm.accessToken.trim()
  if (gatewayForm.userId.trim() !== gatewaySnapshot.userId)
    payload.user_id = gatewayForm.userId.trim()
  const alertUsd = gatewayForm.alertUsd.trim()
  const alertChanged = alertUsd !== gatewaySnapshot.alertUsd
  if (!Object.keys(payload).length && !alertChanged) {
    notify(t('system.noChange'), 'warning')
    return
  }
  saveLoading.gateway = true
  try {
    if (Object.keys(payload).length) {
      const raw = await adminGatewayApi.update(payload)
      if (!isApiSuccess(raw)) {
        notify((raw as any)?.message ?? t('system.saveFail'), 'error')
        return
      }
      applyConfig(raw)
    }
    if (alertChanged) {
      const res = await settingApi.update('GatewayBalanceAlertUSD', { value: alertUsd })
      if (!isApiSuccess(res)) {
        notify((res as any)?.message ?? t('system.saveFail'), 'error')
        return
      }
      gatewayForm.alertUsd = alertUsd
      gatewaySnapshot.alertUsd = alertUsd
    }
    notify(t('system.gatewaySaveOk'))
  }
  catch {
    notify(t('system.saveFail'), 'error')
  }
  finally {
    saveLoading.gateway = false
  }
}

async function submitQiniu() {
  if (saveLoading.qiniu)
    return
  const payload: Record<string, unknown> = {}
  const bucket = qiniuForm.bucket.trim()
  const projectCode = qiniuForm.projectCode.trim()
  const domain = qiniuForm.domain.trim().replace(/\/$/, '')
  if (bucket !== qiniuSnapshot.bucket)
    payload.qiniu_bucket = bucket
  if (projectCode !== qiniuSnapshot.projectCode)
    payload.qiniu_project_code = projectCode
  if (domain !== qiniuSnapshot.domain)
    payload.qiniu_domain = domain
  if (qiniuForm.accessKey.trim())
    payload.qiniu_access_key = qiniuForm.accessKey.trim()
  if (qiniuForm.secretKey.trim())
    payload.qiniu_secret_key = qiniuForm.secretKey.trim()
  await persist(payload, 'qiniu', t('system.qiniuSaveOk'))
}
</script>

<template>
  <div v-if="loading" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
    <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
    <span class="text-sm">{{ t('common.loading') }}</span>
  </div>
  <div v-else class="space-y-6">
    <SettingsSectionCard
      :title="t('system.gatewayTitle')"
      :description="t('system.gatewayDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :help="t('system.gatewayEnabledHelp')">
          <template #label>
            <span class="cursor-pointer" @click="gatewayForm.enabled = !gatewayForm.enabled">
              {{ t('system.gatewayEnabled') }}
            </span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="gatewayForm.enabled = !gatewayForm.enabled">
            <USwitch :model-value="gatewayForm.enabled" @click.stop @update:model-value="gatewayForm.enabled = $event" />
          </div>
        </UFormField>
        <UFormField :label="t('system.gatewayBaseUrl')" required :help="t('system.gatewayBaseUrlHelp')" :error="errors.baseUrl || undefined">
          <UInput v-model="gatewayForm.baseUrl" class="w-full" placeholder="https://api.easyapi.com" />
        </UFormField>
        <UFormField :label="t('system.gatewayPricingBaseUrl')" :help="t('system.gatewayPricingBaseUrlHelp')" :error="errors.pricingBaseUrl || undefined">
          <UInput v-model="gatewayForm.pricingBaseUrl" class="w-full" placeholder="https://token.easyapi.com" />
        </UFormField>
        <UFormField :label="t('system.gatewayApiKey')" class="sm:col-span-2" :help="t('system.gatewayApiKeyHelp')">
          <UInput
            v-model="gatewayForm.apiKey"
            type="password"
            class="w-full"
            :placeholder="gatewaySnapshot.hasApiKey ? t('system.paySecretPh') : t('system.gatewayApiKeyPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField :label="t('system.gatewayAccessToken')" :help="t('system.gatewayAccessTokenHelp')">
          <UInput
            v-model="gatewayForm.accessToken"
            type="password"
            class="w-full"
            :placeholder="gatewaySnapshot.hasAccessToken ? t('system.paySecretPh') : t('system.gatewayAccessTokenPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField :label="t('system.gatewayUserId')" :help="t('system.gatewayUserIdHelp')">
          <UInput v-model="gatewayForm.userId" class="w-full" placeholder="1" />
        </UFormField>
        <UFormField :label="t('system.gatewayMarkupRate')" :help="t('system.gatewayMarkupRateHelp')" :error="errors.markupRate || undefined">
          <UInput v-model="gatewayForm.markupRate" type="number" min="0" step="0.1" class="w-full" placeholder="3" />
        </UFormField>
        <UFormField :label="t('system.gatewayPointsRate')" :help="t('system.gatewayPointsRateHelp')" :error="errors.pointsRate || undefined">
          <UInput v-model="gatewayForm.pointsRate" type="number" min="0" step="0.1" class="w-full" placeholder="20" />
        </UFormField>
        <UFormField :label="t('system.gatewayUsdRate')" :help="t('system.gatewayUsdRateHelp')" :error="errors.usdRate || undefined">
          <UInput v-model="gatewayForm.usdRate" type="number" min="0" step="0.01" class="w-full" placeholder="7.3" />
        </UFormField>
        <UFormField :label="t('system.gatewayPartnerDiscount')" :help="t('system.gatewayPartnerDiscountHelp')" :error="errors.partnerDiscount || undefined">
          <UInput v-model="gatewayForm.partnerDiscount" type="number" min="0" max="1" step="0.01" class="w-full" placeholder="1" />
        </UFormField>
        <UFormField :label="t('system.gatewayAlertUsd')" :help="t('system.gatewayAlertUsdHelp')" :error="errors.alertUsd || undefined">
          <UInput v-model="gatewayForm.alertUsd" type="number" min="0" step="0.01" class="w-full" placeholder="20" />
        </UFormField>
        <UFormField :label="t('system.uploadBaseUrl')" class="sm:col-span-2" :help="t('system.uploadBaseUrlHelp')">
          <UInput v-model="gatewayForm.uploadBaseUrl" class="w-full" placeholder="https://cdn.example.com" />
        </UFormField>
      </div>
      <UButton type="button" class="mt-4" :loading="saveLoading.gateway" :disabled="saveLoading.gateway" @click="submitGateway">
        {{ saveLoading.gateway ? t('common.saving') : t('system.gatewaySave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.coverTitle')"
      :description="t('system.coverDesc')"
    >
      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <dt class="min-w-0 text-sm text-zinc-600 dark:text-zinc-300">{{ t('system.coverFfmpeg') }}</dt>
          <dd class="shrink-0">
            <UBadge :color="coverCaps.ffmpeg ? 'success' : 'warning'" variant="subtle">
              {{ coverCaps.ffmpeg ? t('system.coverReady') : t('system.coverMissing') }}
            </UBadge>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <dt class="min-w-0 text-sm text-zinc-600 dark:text-zinc-300">{{ t('system.coverOssSnapshot') }}</dt>
          <dd class="shrink-0">
            <UBadge :color="coverCaps.ossSnapshot ? 'success' : 'neutral'" variant="subtle">
              {{ coverCaps.ossSnapshot ? t('system.coverReady') : t('system.coverMissing') }}
            </UBadge>
          </dd>
        </div>
      </dl>
      <div class="space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <p>{{ t('system.coverFfmpegHint') }}</p>
        <p>{{ t('system.coverFontHint') }}</p>
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.qiniuTitle')"
      :description="t('system.qiniuDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('system.qiniuProjectCode')" :help="t('system.qiniuProjectCodeHelp')">
          <UInput v-model="qiniuForm.projectCode" class="w-full" placeholder="easytv" />
        </UFormField>
        <UFormField :label="t('system.qiniuBucket')" :help="t('system.qiniuBucketHelp')">
          <UInput v-model="qiniuForm.bucket" class="w-full" placeholder="easyapi" />
        </UFormField>
        <UFormField :label="t('system.qiniuDomain')" class="sm:col-span-2" :help="t('system.qiniuDomainHelp')">
          <UInput v-model="qiniuForm.domain" class="w-full" placeholder="https://qiniu.easyapi.com" />
        </UFormField>
        <UFormField label="Access Key" :help="t('system.qiniuKeyHelp')">
          <UInput
            v-model="qiniuForm.accessKey"
            type="password"
            class="w-full"
            :placeholder="qiniuSnapshot.hasKeys ? t('system.paySecretPh') : ''"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField label="Secret Key" :help="t('system.qiniuKeyHelp')">
          <UInput
            v-model="qiniuForm.secretKey"
            type="password"
            class="w-full"
            :placeholder="qiniuSnapshot.hasKeys ? t('system.paySecretPh') : ''"
            autocomplete="new-password"
          />
        </UFormField>
      </div>
      <UButton type="button" class="mt-4" :loading="saveLoading.qiniu" :disabled="saveLoading.qiniu" @click="submitQiniu">
        {{ saveLoading.qiniu ? t('common.saving') : t('system.qiniuSave') }}
      </UButton>
    </SettingsSectionCard>
  </div>
</template>
