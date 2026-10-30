<script setup lang="ts">
import mediaApi, { type AdminMediaAction } from '~/api/media'
import settingApi from '~/api/setting'
import { diffSettingEntries, parseSettingMap, toSettingValue } from '~/utils/admin-setting'
import { isApiSuccess } from '~/utils/admin-user'
import {
  coverageByAction,
  DEFAULT_MEDIA_JOB_MAX_PER_USER,
  DEFAULT_MEDIA_JOB_MAX_QUEUE,
  enabledMapFromDisabled,
  extraDisabledActions,
  MEDIA_ACTION_GROUPS,
  mediaSettingEntries,
  parseMediaActionsDisabled,
  serializeMediaActionsDisabled,
} from '~/utils/media-actions'

/**
 * 媒体工具：画布工具条动作开关 / 作业队列上限 / ffmpeg 路径。
 * 键名与后端媒体配置一致；MediaActionsDisabled 为逗号分隔小写 id。
 */

type SectionId = 'actions' | 'queue' | 'bin'

const { t } = useI18n()
const localePath = useLocalePath()
const { notify } = useNotifyToast()

const loading = ref(true)
const coverage = ref<AdminMediaAction[]>([])
const ffmpegOn = ref<boolean | null>(null)
const coverageMap = computed(() => coverageByAction(coverage.value))
const enabled = reactive<Record<string, boolean>>(enabledMapFromDisabled([]))
const extras = ref<string[]>([])
const form = reactive({
  maxQueue: '',
  maxPerUser: '',
  ffmpegPath: '',
  ffprobePath: '',
})
const errors = reactive({
  maxQueue: '',
  maxPerUser: '',
})
const saveLoading = reactive<Record<SectionId, boolean>>({
  actions: false,
  queue: false,
  bin: false,
})
let snapshot: { key: string, value: unknown }[] = []

function pickStr(map: Record<string, any>, key: string) {
  const raw = map[key]
  return raw == null ? '' : String(raw)
}

function currentEntries() {
  return mediaSettingEntries({
    disabledValue: serializeMediaActionsDisabled(enabled, extras.value),
    maxQueue: form.maxQueue.trim(),
    maxPerUser: form.maxPerUser.trim(),
    ffmpegPath: form.ffmpegPath.trim(),
    ffprobePath: form.ffprobePath.trim(),
  })
}

function rememberSnapshot() {
  snapshot = currentEntries()
}

function applySettings(map: Record<string, any>) {
  const disabled = parseMediaActionsDisabled(map.MediaActionsDisabled)
  extras.value = extraDisabledActions(disabled)
  Object.assign(enabled, enabledMapFromDisabled(disabled))
  form.maxQueue = pickStr(map, 'MediaJobMaxQueue')
  form.maxPerUser = pickStr(map, 'MediaJobMaxPerUser')
  form.ffmpegPath = pickStr(map, 'FFmpegPath')
  form.ffprobePath = pickStr(map, 'FFprobePath')
  rememberSnapshot()
}

async function refresh(opts?: { silent?: boolean }) {
  if (!opts?.silent)
    loading.value = true
  try {
    const raw = await settingApi.list()
    const map = parseSettingMap(raw)
    if (!map) {
      notify((raw as any)?.message ?? t('system.loadFail'), 'error')
      return
    }
    applySettings(map)
    await loadCoverage()
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

function sectionEntries(id: SectionId) {
  const all = currentEntries()
  if (id === 'actions')
    return all.filter(item => item.key === 'MediaActionsDisabled')
  if (id === 'queue')
    return all.filter(item => item.key === 'MediaJobMaxQueue' || item.key === 'MediaJobMaxPerUser')
  return all.filter(item => item.key === 'FFmpegPath' || item.key === 'FFprobePath')
}

function validatePositiveInt(raw: string, key: 'maxQueue' | 'maxPerUser') {
  errors[key] = ''
  const text = raw.trim()
  if (!text)
    return true
  const n = Number(text)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    errors[key] = t('system.mediaIntInvalid')
    return false
  }
  return true
}

function validateQueue() {
  const queueOk = validatePositiveInt(form.maxQueue, 'maxQueue')
  const perUserOk = validatePositiveInt(form.maxPerUser, 'maxPerUser')
  return queueOk && perUserOk
}

async function persist(id: SectionId) {
  if (saveLoading[id])
    return
  if (id === 'queue' && !validateQueue())
    return
  const changed = diffSettingEntries(sectionEntries(id), snapshot)
  if (!changed.length) {
    notify(t('system.noChange'), 'warning')
    return
  }
  saveLoading[id] = true
  try {
    for (const item of changed) {
      const res = await settingApi.update(item.key, { value: toSettingValue(item.value) })
      if (!isApiSuccess(res)) {
        notify((res as any)?.message ?? t('system.saveFail'), 'error')
        return
      }
    }
    notify(t('system.mediaSaveOk'))
    await refresh({ silent: true })
  }
  catch {
    notify(t('system.saveFail'), 'error')
  }
  finally {
    saveLoading[id] = false
  }
}

async function loadCoverage() {
  try {
    const res = await mediaApi.actions()
    if (!isApiSuccess(res) || !res?.data)
      return
    coverage.value = Array.isArray(res.data.actions) ? res.data.actions : []
    ffmpegOn.value = typeof res.data.ffmpeg === 'boolean' ? res.data.ffmpeg : null
  }
  catch {
    coverage.value = []
    ffmpegOn.value = null
  }
}

function coverageOf(key: string) {
  return coverageMap.value[key]
}

function coverageHint(key: string) {
  const item = coverageOf(key)
  if (!item)
    return enabled[key] === false ? t('system.mediaGap.disabled') : ''
  if (enabled[key] === false)
    return t('system.mediaGap.disabled')
  if (item.available)
    return item.models?.length ? t('system.mediaReadyModels', { models: item.models.join('、') }) : t('system.mediaReady')
  if (item.gap === 'no_model')
    return t('system.mediaGap.no_model')
  if (item.gap === 'not_on_gateway')
    return t('system.mediaGap.not_on_gateway', { models: (item.priced_models ?? []).join('、') })
  if (item.gap === 'no_ffmpeg')
    return t('system.mediaGap.no_ffmpeg')
  if (item.gap === 'disabled')
    return t('system.mediaGap.disabled')
  return item.reason || ''
}

function toggleAction(key: string) {
  enabled[key] = !enabled[key]
}

function setGroupEnabled(actions: readonly string[], value: boolean) {
  for (const key of actions)
    enabled[key] = value
}

function groupAllOn(actions: readonly string[]) {
  return actions.every(key => enabled[key] !== false)
}
</script>

<template>
  <div v-if="loading" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
    <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
    <span class="text-sm">{{ t('common.loading') }}</span>
  </div>
  <div v-else class="space-y-6">
    <SettingsSectionCard
      :title="t('system.mediaActionsTitle')"
      :description="t('system.mediaActionsDesc')"
    >
      <p
        v-if="ffmpegOn === false"
        class="mb-4 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
      >
        {{ t('system.mediaFfmpegMissing') }}
      </p>
      <p
        v-else-if="ffmpegOn === true"
        class="mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400"
      >
        {{ t('system.mediaFfmpegOk') }}
      </p>
      <p class="mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        {{ t('system.mediaCoverageHint') }}
        <NuxtLink :to="localePath('/model-price')" class="text-primary underline-offset-2 hover:underline">
          {{ t('system.mediaGoPrice') }}
        </NuxtLink>
      </p>
      <p
        v-if="extras.length"
        class="mb-4 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
      >
        {{ t('system.mediaExtraKept', { list: extras.join(', ') }) }}
      </p>
      <div class="space-y-6">
        <section v-for="group in MEDIA_ACTION_GROUPS" :key="group.id">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {{ t(`system.mediaGroup.${group.id}`) }}
            </h3>
            <div class="flex gap-2">
              <UButton
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="setGroupEnabled(group.actions, true)"
              >
                {{ t('system.mediaEnableGroup') }}
              </UButton>
              <UButton
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="setGroupEnabled(group.actions, false)"
              >
                {{ t('system.mediaDisableGroup') }}
              </UButton>
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UFormField v-for="key in group.actions" :key="key" :help="key">
              <template #label>
                <span class="cursor-pointer" @click="toggleAction(key)">
                  {{ t(`system.mediaAction.${key}`) }}
                </span>
              </template>
              <div class="inline-flex min-h-10 cursor-pointer items-center" @click="toggleAction(key)">
                <USwitch
                  :model-value="enabled[key] !== false"
                  @click.stop
                  @update:model-value="enabled[key] = $event"
                />
              </div>
              <p
                v-if="coverageHint(key)"
                class="mt-1 text-xs"
                :class="coverageOf(key)?.available
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-700 dark:text-amber-300'"
              >
                {{ coverageHint(key) }}
              </p>
            </UFormField>
          </div>
          <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {{ groupAllOn(group.actions) ? t('system.mediaGroupAllOn') : t('system.mediaGroupPartial') }}
          </p>
        </section>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.actions"
        :disabled="saveLoading.actions"
        @click="persist('actions')"
      >
        {{ saveLoading.actions ? t('common.saving') : t('system.mediaSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.mediaQueueTitle')"
      :description="t('system.mediaQueueDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          :label="t('system.media.MediaJobMaxQueue')"
          :help="t('system.growthDefaultHint', { value: DEFAULT_MEDIA_JOB_MAX_QUEUE })"
          :error="errors.maxQueue || undefined"
        >
          <UInput
            v-model="form.maxQueue"
            type="number"
            min="1"
            step="1"
            class="w-full"
            :placeholder="DEFAULT_MEDIA_JOB_MAX_QUEUE"
          />
        </UFormField>
        <UFormField
          :label="t('system.media.MediaJobMaxPerUser')"
          :help="t('system.growthDefaultHint', { value: DEFAULT_MEDIA_JOB_MAX_PER_USER })"
          :error="errors.maxPerUser || undefined"
        >
          <UInput
            v-model="form.maxPerUser"
            type="number"
            min="1"
            step="1"
            class="w-full"
            :placeholder="DEFAULT_MEDIA_JOB_MAX_PER_USER"
          />
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.queue"
        :disabled="saveLoading.queue"
        @click="persist('queue')"
      >
        {{ saveLoading.queue ? t('common.saving') : t('system.mediaSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.mediaBinTitle')"
      :description="t('system.mediaBinDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          :label="t('system.media.FFmpegPath')"
          :help="t('system.mediaBinHelp')"
        >
          <UInput
            v-model="form.ffmpegPath"
            class="w-full font-mono text-sm"
            placeholder="ffmpeg"
          />
        </UFormField>
        <UFormField
          :label="t('system.media.FFprobePath')"
          :help="t('system.mediaBinHelp')"
        >
          <UInput
            v-model="form.ffprobePath"
            class="w-full font-mono text-sm"
            placeholder="ffprobe"
          />
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.bin"
        :disabled="saveLoading.bin"
        @click="persist('bin')"
      >
        {{ saveLoading.bin ? t('common.saving') : t('system.mediaSave') }}
      </UButton>
    </SettingsSectionCard>
  </div>
</template>
