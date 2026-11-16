<script setup lang="ts">
import { adminModelPriceApi } from '~/api/billing'
import { parsePaged } from '~/api/creative'
import settingApi from '~/api/setting'
import { diffSettingEntries, parseSettingMap, toSettingValue } from '~/utils/admin-setting'
import { isApiSuccess } from '~/utils/admin-user'

/**
 * 增长参数面板：礼包 / 新手任务 / 签到 / 邀请 / 口令默认 / 促销条与首发价 / 积分换算 / 召回与会员日。
 * 键名与默认值与后端增长配置一致；留空表示使用后端默认值。
 */

type FieldKind = 'int' | 'rate' | 'bool' | 'text' | 'long' | 'model'
type ModelType = 'text' | 'image' | 'video' | 'audio'
type SectionId = 'signup' | 'checkin' | 'invite' | 'bonus' | 'promo' | 'points' | 'creator' | 'lifecycle'

interface GrowthField {
  key: string
  kind: FieldKind
  def: string
  placeholder?: string
  /** kind=model：按定价表的类型过滤；留空表示不限类型 */
  modelType?: ModelType
  /** kind=model：再按能力位过滤（如语音转写） */
  ability?: string
}

interface PricedModel {
  model: string
  label: string
  type: string
  status: number
  abilities: string
}

interface GrowthSection {
  id: SectionId
  fields: GrowthField[]
}

const SECTIONS: GrowthSection[] = [
  {
    id: 'signup',
    fields: [
      { key: 'GrowthSignupPoints', kind: 'int', def: '200' },
      { key: 'GrowthSignupValidDays', kind: 'int', def: '30' },
      { key: 'GrowthTaskFirstCanvas', kind: 'int', def: '50' },
      { key: 'GrowthTaskFirstVideo', kind: 'int', def: '50' },
      { key: 'GrowthTaskFirstWork', kind: 'int', def: '100' },
      { key: 'GrowthTaskFirstInvite', kind: 'int', def: '100' },
      { key: 'GrowthTaskBindWeChat', kind: 'int', def: '20' },
      { key: 'GrowthTaskValidDays', kind: 'int', def: '30' },
    ],
  },
  {
    id: 'checkin',
    fields: [
      { key: 'GrowthCheckinPoints', kind: 'int', def: '10' },
      { key: 'GrowthCheckinValidDays', kind: 'int', def: '7' },
      { key: 'GrowthCheckinStreakBonus', kind: 'int', def: '50' },
      { key: 'GrowthCheckinMonthBonus', kind: 'int', def: '200' },
      { key: 'GrowthCheckinMemberMultiplier', kind: 'int', def: '2' },
    ],
  },
  {
    id: 'invite',
    fields: [
      { key: 'GrowthInviteInviteePoints', kind: 'int', def: '100' },
      { key: 'GrowthInviteInviterPoints', kind: 'int', def: '100' },
      { key: 'GrowthInviteValidDays', kind: 'int', def: '30' },
      { key: 'GrowthInviteRechargeRate', kind: 'rate', def: '0.10' },
      { key: 'GrowthInviteRechargeCap', kind: 'int', def: '2000' },
      { key: 'GrowthInviteDailyIpLimit', kind: 'int', def: '3' },
      { key: 'GrowthSignupDailyIpLimit', kind: 'int', def: '10' },
      { key: 'GrowthInviteBaseUrl', kind: 'text', def: '', placeholder: 'https://studio.example.com' },
    ],
  },
  {
    id: 'bonus',
    fields: [
      { key: 'GrowthBonusDefaultRechargeRate', kind: 'rate', def: '0.20' },
      { key: 'GrowthBonusDefaultCapPoints', kind: 'int', def: '2000' },
      { key: 'GrowthBonusDefaultValidDays', kind: 'int', def: '30' },
    ],
  },
  {
    id: 'promo',
    fields: [
      { key: 'GrowthPromoBannerEnabled', kind: 'bool', def: 'false' },
      { key: 'GrowthPromoBannerLink', kind: 'text', def: '/pricing', placeholder: '/pricing' },
      { key: 'GrowthNewModelPromoRate', kind: 'rate', def: '0.5' },
      { key: 'GrowthNewModelPromoDays', kind: 'int', def: '7' },
      { key: 'GrowthNewModelPromoLabel', kind: 'text', def: '首发 5 折' },
    ],
  },
  {
    id: 'points',
    fields: [
      { key: 'GrowthPointsPerYuan', kind: 'int', def: '20' },
    ],
  },
  {
    id: 'creator',
    fields: [
      { key: 'GrowthSkillAuthorShare', kind: 'rate', def: '0.20' },
      { key: 'GrowthShareOpenPoints', kind: 'int', def: '5' },
      { key: 'GrowthShareDailyCap', kind: 'int', def: '50' },
      { key: 'GrowthShareValidDays', kind: 'int', def: '30' },
      { key: 'GrowthWorkClonePoints', kind: 'int', def: '10' },
      { key: 'GrowthWorkCloneDailyCap', kind: 'int', def: '100' },
      { key: 'GrowthWorkCloneValidDays', kind: 'int', def: '30' },
      { key: 'GrowthUgcPoints30', kind: 'int', def: '100' },
      { key: 'GrowthUgcPoints60', kind: 'int', def: '300' },
      { key: 'GrowthUgcPoints120', kind: 'int', def: '500' },
      { key: 'GrowthUgcViralLikes', kind: 'int', def: '1000' },
      { key: 'GrowthUgcMonthlyCap', kind: 'int', def: '3000' },
      { key: 'GrowthUgcMonthlyEntries', kind: 'int', def: '20' },
      { key: 'GrowthUgcValidDays', kind: 'int', def: '30' },
      { key: 'ComposeWatermarkEnabled', kind: 'bool', def: 'true' },
      { key: 'ComposePlanPrompt', kind: 'long', def: '' },
      { key: 'ComposePlanModel', kind: 'model', def: '', modelType: 'text' },
      { key: 'VisionTextModel', kind: 'model', def: '', modelType: 'text' },
      { key: 'TranscribeModel', kind: 'model', def: '', ability: 'transcribe' },
      { key: 'MediaStoryboardModel', kind: 'model', def: '', modelType: 'text' },
      { key: 'ComposeImageModel', kind: 'model', def: '', modelType: 'image' },
      { key: 'ComposeVideoModel', kind: 'model', def: '', modelType: 'video' },
      { key: 'ComposeAudioModel', kind: 'model', def: '', modelType: 'audio' },
    ],
  },
  {
    id: 'lifecycle',
    fields: [
      { key: 'GrowthLifecycleEnabled', kind: 'bool', def: 'false' },
      { key: 'GrowthPartnerRebateRate', kind: 'rate', def: '0.15' },
      { key: 'GrowthPartnerRebateMonths', kind: 'int', def: '12' },
      { key: 'GrowthRecallInactiveDays', kind: 'int', def: '30' },
      { key: 'GrowthRecallPoints', kind: 'int', def: '100' },
      { key: 'GrowthRecallValidDays', kind: 'int', def: '30' },
      { key: 'GrowthRecallMemberDays', kind: 'int', def: '3' },
      { key: 'GrowthRenewRemindDays', kind: 'int', def: '7' },
      { key: 'GrowthPointsExpireRemindDays', kind: 'int', def: '3' },
      { key: 'GrowthMemberDayOfMonth', kind: 'int', def: '11' },
      { key: 'GrowthMemberDayPackDiscount', kind: 'rate', def: '0.8' },
    ],
  },
]

const { t } = useI18n()
const { notify } = useNotifyToast()

const loading = ref(true)
const prices = ref<PricedModel[]>([])
const form = reactive<Record<string, string | boolean>>({})
const errors = reactive<Record<string, string>>({})
const saveLoading = reactive<Record<SectionId, boolean>>({
  signup: false,
  checkin: false,
  invite: false,
  bonus: false,
  promo: false,
  points: false,
  creator: false,
  lifecycle: false,
})
let snapshot: { key: string, value: unknown }[] = []

for (const section of SECTIONS) {
  for (const field of section.fields)
    form[field.key] = field.kind === 'bool' ? field.def === 'true' : ''
}

function readValue(map: Record<string, any>, field: GrowthField): string | boolean {
  const raw = map[field.key]
  if (field.kind === 'bool') {
    // 缺省 / 空值取字段默认（ComposeWatermarkEnabled 后端语义为空值视为开）
    if (raw == null || raw === '')
      return field.def === 'true'
    return raw === true || raw === 'true' || raw === 1 || raw === '1'
  }
  if (raw == null)
    return ''
  return String(raw)
}

function applySettings(map: Record<string, any>) {
  snapshot = []
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const value = readValue(map, field)
      form[field.key] = value
      snapshot.push({ key: field.key, value })
    }
  }
}

function hasAbility(row: PricedModel, ability: string) {
  const declared = row.abilities.split(',').map(part => part.trim().toLowerCase()).filter(Boolean)
  if (declared.includes(ability))
    return true
  if (ability !== 'transcribe')
    return false
  const name = row.model.toLowerCase()
  return name.includes('transcribe') || name.includes('whisper')
}

const MODEL_AUTO = '__auto__'

function modelSelectValue(key: string) {
  const current = String(form[key] ?? '')
  return current || MODEL_AUTO
}

function setModel(key: string, value: unknown) {
  const next = String(value ?? '')
  form[key] = next === MODEL_AUTO ? '' : next
}

function modelItems(field: GrowthField) {
  const current = String(form[field.key] ?? '')
  const matched = prices.value.filter((row) => {
    if (field.ability)
      return hasAbility(row, field.ability)
    return row.type === field.modelType
  })
  const items = [{ label: t('system.growthModelAuto'), value: MODEL_AUTO }]
  for (const row of matched.filter(row => row.status === 1)) {
    const label = row.label && row.label !== row.model ? `${row.label}（${row.model}）` : row.model
    items.push({ label, value: row.model })
  }
  if (current && !items.some(item => item.value === current)) {
    const known = matched.some(row => row.model === current)
    items.push({
      label: known ? t('system.growthModelOff', { name: current }) : t('system.growthModelMissing', { name: current }),
      value: current,
    })
  }
  return items
}

async function loadPrices() {
  const items: any[] = []
  try {
    for (let page = 1; page <= 10; page++) {
      const raw = await adminModelPriceApi.list({ page, page_size: 100, sort_by: 'model', order: 'asc' })
      const parsed = parsePaged(raw)
      if (!parsed)
        break
      items.push(...parsed.items)
      if (!parsed.items.length || items.length >= parsed.total)
        break
    }
  }
  catch {
    prices.value = []
    return
  }
  prices.value = items.map(item => ({
    model: String(item?.model || ''),
    label: String(item?.label || ''),
    type: String(item?.type || ''),
    status: Number(item?.status) === 2 ? 2 : 1,
    abilities: String(item?.abilities || ''),
  })).filter(item => item.model)
}

async function refresh(opts?: { silent?: boolean }) {
  if (!opts?.silent)
    loading.value = true
  try {
    const [, raw] = await Promise.all([loadPrices(), settingApi.list()])
    const map = parseSettingMap(raw)
    if (!map) {
      notify((raw as any)?.message ?? t('system.loadFail'), 'error')
      return
    }
    applySettings(map)
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

function fieldLabel(field: GrowthField) {
  return t(`system.growth.${field.key}`)
}

const DEFAULT_MODEL_KEYS = new Set(['ComposeImageModel', 'ComposeVideoModel', 'ComposeAudioModel'])

function fieldHelp(field: GrowthField) {
  if (field.key === 'ComposePlanModel')
    return t('system.growthPlanModelHint')
  if (field.key === 'ComposePlanPrompt')
    return t('system.growthPlanPromptHint')
  if (field.key === 'VisionTextModel')
    return t('system.growthVisionModelHint')
  if (field.key === 'TranscribeModel')
    return t('system.growthTranscribeHint')
  if (field.key === 'MediaStoryboardModel')
    return t('system.growthStoryboardHint')
  // 这三个是成片向导的默认选中模型：留空按定价行顺序取第一个，
  // 某个模型在网关坏掉时运营可以直接改这里换默认
  if (DEFAULT_MODEL_KEYS.has(field.key))
    return t('system.growthDefaultModelHint')
  return t('system.growthDefaultHint', { value: field.def })
}

function validateSection(section: GrowthSection) {
  let ok = true
  for (const field of section.fields) {
    errors[field.key] = ''
    const raw = form[field.key]
    if (field.kind === 'bool' || typeof raw !== 'string')
      continue
    const text = raw.trim()
    if (!text)
      continue
    if (field.kind === 'int') {
      const n = Number(text)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        errors[field.key] = t('system.growthIntInvalid')
        ok = false
      }
    }
    else if (field.kind === 'rate') {
      const n = Number(text)
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        errors[field.key] = t('system.growthRateInvalid')
        ok = false
      }
    }
    else if (field.kind === 'text' && field.key === 'GrowthInviteBaseUrl' && !/^https?:\/\/.+/i.test(text)) {
      errors[field.key] = t('system.siteUrlInvalid')
      ok = false
    }
  }
  return ok
}

function sectionEntries(section: GrowthSection) {
  return section.fields.map((field) => {
    const raw = form[field.key]
    const value = typeof raw === 'string' ? raw.trim() : raw
    return { key: field.key, value }
  })
}

async function submit(section: GrowthSection) {
  if (saveLoading[section.id] || !validateSection(section))
    return
  const changed = diffSettingEntries(sectionEntries(section), snapshot)
  if (!changed.length) {
    notify(t('system.noChange'), 'warning')
    return
  }
  saveLoading[section.id] = true
  try {
    for (const item of changed) {
      const res = await settingApi.update(item.key, { value: toSettingValue(item.value) })
      if (!isApiSuccess(res)) {
        notify((res as any)?.message ?? t('system.saveFail'), 'error')
        return
      }
    }
    notify(t('system.growthSaveOk'))
    await refresh({ silent: true })
  }
  catch {
    notify(t('system.saveFail'), 'error')
  }
  finally {
    saveLoading[section.id] = false
  }
}

function toggleBool(key: string) {
  form[key] = !form[key]
}
</script>

<template>
  <div v-if="loading" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
    <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
    <span class="text-sm">{{ t('common.loading') }}</span>
  </div>
  <div v-else class="space-y-6">
    <SettingsSectionCard
      v-for="section in SECTIONS"
      :key="section.id"
      :title="t(`system.growthSection.${section.id}`)"
      :description="t(`system.growthSectionDesc.${section.id}`)"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <template v-for="field in section.fields" :key="field.key">
          <UFormField v-if="field.kind === 'bool'" :help="fieldHelp(field)">
            <template #label>
              <span class="cursor-pointer" @click="toggleBool(field.key)">{{ fieldLabel(field) }}</span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="toggleBool(field.key)">
              <USwitch :model-value="Boolean(form[field.key])" @click.stop @update:model-value="form[field.key] = $event" />
            </div>
          </UFormField>
          <UFormField
            v-else
            :class="field.kind === 'long' ? 'sm:col-span-2' : ''"
            :label="fieldLabel(field)"
            :help="fieldHelp(field)"
            :error="errors[field.key] || undefined"
          >
            <UTextarea
              v-if="field.kind === 'long'"
              :model-value="String(form[field.key] ?? '')"
              :rows="6"
              maxlength="8000"
              class="w-full"
              :placeholder="field.placeholder ?? t('system.growthPlanPromptPh')"
              @update:model-value="form[field.key] = String($event ?? '')"
            />
            <USelectMenu
              v-else-if="field.kind === 'model'"
              :model-value="modelSelectValue(field.key)"
              :items="modelItems(field)"
              value-key="value"
              :search-input="{ placeholder: t('system.growthModelSearch'), icon: 'i-lucide-search' }"
              class="w-full"
              @update:model-value="setModel(field.key, $event)"
            />
            <UInput
              v-else-if="field.kind === 'text'"
              :model-value="String(form[field.key] ?? '')"
              class="w-full"
              :placeholder="field.key === 'GrowthNewModelPromoLabel' ? t('modelPrice.promoLabelPh') : (field.placeholder ?? field.def)"
              @update:model-value="form[field.key] = String($event ?? '')"
            />
            <UInput
              v-else
              :model-value="String(form[field.key] ?? '')"
              type="number"
              min="0"
              :max="field.kind === 'rate' ? 1 : undefined"
              :step="field.kind === 'rate' ? 0.01 : 1"
              class="w-full"
              :placeholder="field.def"
              @update:model-value="form[field.key] = String($event ?? '')"
            />
          </UFormField>
        </template>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading[section.id]"
        :disabled="saveLoading[section.id]"
        @click="submit(section)"
      >
        {{ saveLoading[section.id] ? t('common.saving') : t('system.growthSave') }}
      </UButton>
    </SettingsSectionCard>
  </div>
</template>
