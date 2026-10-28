<script setup lang="ts">
import { adminAiChatApi } from '~/api/ai-chat'
import { isApiSuccess } from '~/utils/admin-user'
import { SELECT_ITEM_UNSET } from '~/utils/consoleSelectItems'

/**
 * AI 对话面板：对话开关 / 免费 / 对话模型 / 最大输出 / 思考模式与强度 / 每日免费次数 / 平台知识。
 * 键名与 easytv-api/setting/chat_setting.go 一致；保存走 PUT /admin/ai-chat/config 做局部更新，
 * 返回与 GET 相同的视图，改完即时生效（无需重启）。
 */

interface ChatTextModel {
  model: string
  label: string
}

interface ChatConfig {
  enabled: boolean
  free: boolean
  model: string
  maxTokens: number
  thinkingMode: string
  thinkingEffort: string
  dailyFreeCount: number
  knowledge: string
}

const MAX_TOKENS_LIMIT = 32000
const DAILY_FREE_LIMIT = 100000
const KNOWLEDGE_LIMIT = 8000
const THINKING_MODES = ['', 'off', 'on']
const THINKING_EFFORTS = ['', 'low', 'medium', 'high']

const { t } = useI18n()
const { notify } = useNotifyToast()

const loading = ref(true)
const saving = ref(false)
const form = reactive({
  enabled: false,
  free: false,
  model: SELECT_ITEM_UNSET,
  maxTokens: '0',
  thinkingMode: SELECT_ITEM_UNSET,
  thinkingEffort: SELECT_ITEM_UNSET,
  dailyFreeCount: '100',
  knowledge: '',
})
const errors = reactive({
  model: '',
  maxTokens: '',
  thinkingMode: '',
  thinkingEffort: '',
  dailyFreeCount: '',
  knowledge: '',
})
const textModels = ref<ChatTextModel[]>([])
let snapshot: ChatConfig = {
  enabled: false,
  free: false,
  model: '',
  maxTokens: 0,
  thinkingMode: '',
  thinkingEffort: '',
  dailyFreeCount: 100,
  knowledge: '',
}

/** 空串是合法值：后端把它当「清空、回到自动选模型」（AgentModel 空 → 策划案模型 → 第一个已定价文本模型）。
 *  USelect 不允许选项 value 为空串，表单里用哨兵，提交时再还原。 */
function toSelectValue(raw: string) {
  const value = raw.trim()
  return value && value !== SELECT_ITEM_UNSET ? value : SELECT_ITEM_UNSET
}

function fromSelectValue(raw: string) {
  return raw === SELECT_ITEM_UNSET ? '' : raw.trim()
}

const modelItems = computed(() => [
  { label: t('system.chatModelAuto'), value: SELECT_ITEM_UNSET },
  ...textModels.value
    .filter(item => item.model !== SELECT_ITEM_UNSET)
    .map(item => ({
      label: item.label || item.model,
      value: item.model,
    })),
])

/** 展示名被截断时，悬停看全文；展示名和模型名不同时一并带上模型名。 */
function modelOptionTitle(item: { label?: unknown, value?: unknown }) {
  const label = String(item?.label ?? '')
  const value = String(item?.value ?? '')
  if (!label)
    return value === SELECT_ITEM_UNSET ? '' : value
  if (!value || value === SELECT_ITEM_UNSET || label === value)
    return label
  return `${label}（${value}）`
}

const selectedModel = computed(() => modelItems.value.find(item => item.value === form.model))

/** 展示名本身放得下就不提示。模型名只附在被截断的长文案后面，不单独制造提示。 */
function modelTipText(item?: { label?: unknown, value?: unknown }) {
  if (!item)
    return undefined
  const label = String(item.label ?? '')
  if (label.length <= 32)
    return undefined
  return modelOptionTitle(item)
}

const thinkingModeItems = computed(() => [
  { label: t('system.chatThinkingModeDefault'), value: SELECT_ITEM_UNSET },
  { label: t('system.chatThinkingModeOff'), value: 'off' },
  { label: t('system.chatThinkingModeOn'), value: 'on' },
])

const thinkingEffortItems = computed(() => [
  { label: t('system.chatThinkingEffortDefault'), value: SELECT_ITEM_UNSET },
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
])

function toInt(raw: unknown, fallback: number) {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** 后端 GET 返回 { enabled, free, model, ..., text_models }；兼容 data 包裹 */
function readConfigView(raw: any): Record<string, any> | null {
  const data = raw?.data ?? raw
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return null
  if (!('text_models' in data) && !('max_tokens' in data) && !('thinking_mode' in data))
    return null
  return data as Record<string, any>
}

function applyConfig(data: Record<string, any>) {
  form.enabled = Boolean(data.enabled)
  form.free = Boolean(data.free)
  const model = String(data.model ?? '')
  const thinkingMode = String(data.thinking_mode ?? '')
  const thinkingEffort = String(data.thinking_effort ?? '')
  form.model = toSelectValue(model)
  form.maxTokens = String(toInt(data.max_tokens, 0))
  form.thinkingMode = THINKING_MODES.includes(thinkingMode) ? toSelectValue(thinkingMode) : SELECT_ITEM_UNSET
  form.thinkingEffort = THINKING_EFFORTS.includes(thinkingEffort) ? toSelectValue(thinkingEffort) : SELECT_ITEM_UNSET
  form.dailyFreeCount = String(toInt(data.daily_free_count, 100))
  form.knowledge = String(data.knowledge ?? '')
  textModels.value = Array.isArray(data.text_models)
    ? data.text_models
      .map((item: any) => ({ model: String(item?.model ?? ''), label: String(item?.label ?? '') }))
      .filter((item: ChatTextModel) => !!item.model)
    : []
  snapshot = {
    enabled: form.enabled,
    free: form.free,
    model: fromSelectValue(form.model),
    maxTokens: Number(form.maxTokens),
    thinkingMode: fromSelectValue(form.thinkingMode),
    thinkingEffort: fromSelectValue(form.thinkingEffort),
    dailyFreeCount: Number(form.dailyFreeCount),
    knowledge: form.knowledge,
  }
}

async function refresh(opts?: { silent?: boolean }) {
  if (!opts?.silent)
    loading.value = true
  try {
    const raw = await adminAiChatApi.config()
    if (!isApiSuccess(raw)) {
      notify((raw as any)?.message ?? t('system.loadFail'), 'error')
      return
    }
    const data = readConfigView(raw)
    if (!data) {
      notify(t('system.loadFail'), 'error')
      return
    }
    applyConfig(data)
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

function boundedInt(raw: string, max: number) {
  const text = raw.trim()
  if (!/^\d+$/.test(text))
    return null
  const n = Number(text)
  if (!Number.isInteger(n) || n > max)
    return null
  return n
}

/** 与服务端 PUT 的校验保持一致：模型留空合法（= 清空、回到自动选模型，见 controller/admin_chat.go 的
 *  validAIChatConfigPayload），非空时须是列表里已定价的文本模型；数值与思考枚举都在范围内，知识不超 8000 字符。 */
function validateChat() {
  errors.model = ''
  errors.maxTokens = ''
  errors.thinkingMode = ''
  errors.thinkingEffort = ''
  errors.dailyFreeCount = ''
  errors.knowledge = ''

  // 留空 = 清空、回到自动选模型，是合法值；只有真要改成一个列表外的名字才拦
  const model = fromSelectValue(form.model)
  if (model && model !== snapshot.model && !textModels.value.some(item => item.model === model))
    errors.model = t('system.chatModelInvalid')

  if (boundedInt(form.maxTokens, MAX_TOKENS_LIMIT) == null)
    errors.maxTokens = t('system.chatMaxTokensInvalid')

  const thinkingMode = fromSelectValue(form.thinkingMode)
  const thinkingEffort = fromSelectValue(form.thinkingEffort)
  if (!THINKING_MODES.includes(thinkingMode))
    errors.thinkingMode = t('system.chatThinkingInvalid')
  if (!THINKING_EFFORTS.includes(thinkingEffort))
    errors.thinkingEffort = t('system.chatThinkingInvalid')

  if (boundedInt(form.dailyFreeCount, DAILY_FREE_LIMIT) == null)
    errors.dailyFreeCount = t('system.chatDailyFreeInvalid')

  if (form.knowledge.length > KNOWLEDGE_LIMIT)
    errors.knowledge = t('system.chatKnowledgeInvalid')

  return !errors.model && !errors.maxTokens && !errors.thinkingMode && !errors.thinkingEffort && !errors.dailyFreeCount && !errors.knowledge
}

async function submit() {
  if (saving.value || !validateChat())
    return

  const model = fromSelectValue(form.model)
  const maxTokens = Number(form.maxTokens.trim())
  const dailyFreeCount = Number(form.dailyFreeCount.trim())
  const knowledge = form.knowledge.trim()
  const thinkingMode = fromSelectValue(form.thinkingMode)
  const thinkingEffort = fromSelectValue(form.thinkingEffort)
  const payload: Record<string, unknown> = {}
  if (form.enabled !== snapshot.enabled)
    payload.enabled = form.enabled
  if (form.free !== snapshot.free)
    payload.free = form.free
  if (model !== snapshot.model)
    payload.model = model
  if (maxTokens !== snapshot.maxTokens)
    payload.max_tokens = maxTokens
  if (thinkingMode !== snapshot.thinkingMode)
    payload.thinking_mode = thinkingMode
  if (thinkingEffort !== snapshot.thinkingEffort)
    payload.thinking_effort = thinkingEffort
  if (dailyFreeCount !== snapshot.dailyFreeCount)
    payload.daily_free_count = dailyFreeCount
  if (knowledge !== snapshot.knowledge)
    payload.knowledge = knowledge

  if (!Object.keys(payload).length) {
    notify(t('system.noChange'), 'warning')
    return
  }

  saving.value = true
  try {
    const raw = await adminAiChatApi.update(payload)
    if (!isApiSuccess(raw)) {
      notify((raw as any)?.message ?? t('system.saveFail'), 'error')
      return
    }
    const data = readConfigView(raw)
    if (data)
      applyConfig(data)
    notify(t('system.chatSaveOk'))
    await refresh({ silent: true })
  }
  catch {
    notify(t('system.saveFail'), 'error')
  }
  finally {
    saving.value = false
  }
}

function toggleBool(key: 'enabled' | 'free') {
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
      :title="t('system.chatTitle')"
      :description="t('system.chatDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :help="t('system.chatEnabledHelp')">
          <template #label>
            <span class="cursor-pointer" @click="toggleBool('enabled')">{{ t('system.chatEnabled') }}</span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="toggleBool('enabled')">
            <USwitch :model-value="form.enabled" @click.stop @update:model-value="form.enabled = $event" />
          </div>
        </UFormField>
        <UFormField :help="t('system.chatFreeHelp')">
          <template #label>
            <span class="cursor-pointer" @click="toggleBool('free')">{{ t('system.chatFree') }}</span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="toggleBool('free')">
            <USwitch :model-value="form.free" @click.stop @update:model-value="form.free = $event" />
          </div>
        </UFormField>
        <UFormField
          :label="t('system.chatModel')"
          :help="t('system.chatModelHelp')"
          :error="errors.model || undefined"
        >
          <USelect
            v-model="form.model"
            :items="modelItems"
            :title="selectedModel ? modelTipText(selectedModel) : undefined"
            value-key="value"
            class="w-full"
          >
            <template #item-label="{ item }">
              <UTooltip
                :text="modelTipText(item)"
                :disabled="!modelTipText(item)"
                :delay-duration="200"
                :content="{ side: 'top', sideOffset: 6 }"
                class="block w-full min-w-0"
              >
                <span class="block truncate">{{ item.label }}</span>
              </UTooltip>
            </template>
          </USelect>
        </UFormField>
        <UFormField
          :label="t('system.chatMaxTokens')"
          :help="t('system.chatMaxTokensHelp')"
          :error="errors.maxTokens || undefined"
        >
          <UInput
            v-model="form.maxTokens"
            type="number"
            min="0"
            :max="MAX_TOKENS_LIMIT"
            step="1"
            class="w-full"
            placeholder="0"
          />
        </UFormField>
        <UFormField
          :label="t('system.chatThinkingMode')"
          :help="t('system.chatThinkingModeHelp')"
          :error="errors.thinkingMode || undefined"
        >
          <USelect
            v-model="form.thinkingMode"
            :items="thinkingModeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('system.chatThinkingEffort')"
          :help="t('system.chatThinkingEffortHelp')"
          :error="errors.thinkingEffort || undefined"
        >
          <USelect
            v-model="form.thinkingEffort"
            :items="thinkingEffortItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('system.chatDailyFreeCount')"
          :help="t('system.chatDailyFreeCountHelp')"
          :error="errors.dailyFreeCount || undefined"
        >
          <UInput
            v-model="form.dailyFreeCount"
            type="number"
            min="0"
            :max="DAILY_FREE_LIMIT"
            step="1"
            class="w-full"
            placeholder="100"
          />
        </UFormField>
        <UFormField
          class="sm:col-span-2"
          :label="t('system.chatKnowledge')"
          :help="t('system.chatKnowledgeHelp')"
          :hint="`${form.knowledge.length}/${KNOWLEDGE_LIMIT}`"
          :error="errors.knowledge || undefined"
        >
          <UTextarea
            v-model="form.knowledge"
            class="w-full"
            :rows="8"
            :placeholder="t('system.chatKnowledgePh')"
          />
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saving"
        :disabled="saving"
        @click="submit"
      >
        {{ saving ? t('common.saving') : t('system.chatSave') }}
      </UButton>
    </SettingsSectionCard>
  </div>
</template>
