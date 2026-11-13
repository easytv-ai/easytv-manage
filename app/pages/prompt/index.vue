<script setup lang="ts">
import {
  adminPromptApi,
  adminPromptSourceApi,
  formatUnix,
  isOk,
  parsePaged,
  type AdminPromptPayload,
  type AdminPromptSourcePayload,
} from '~/api/creative'
import qiniu from '~/api/qiniu'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

const { t } = useI18n()
useHead({ title: () => t('prompt.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

type PromptRow = {
  id: number
  title: string
  content: string
  coverUrl: string
  resultUrl: string
  tags: string[]
  category: string
  sourceId: number
  sourceName: string
  sourceUrl: string
  uses: number
  sortOrder: number
  status: 1 | 2
}

type SourceRow = {
  id: number
  name: string
  url: string
  format: 'markdown' | 'json'
  tag: string
  enabled: boolean
  lastSyncedAt: string
  lastError: string
  count: number
}

const rows = ref<PromptRow[]>([])
const total = ref(0)
const sources = ref<SourceRow[]>([])

const draft = reactive({ keyword: '', tag: '', status: '__all__', sourceId: '__all__' })
const applied = ref({ ...draft })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.onShelf'), value: '1' },
  { label: t('common.offShelf'), value: '2' },
])
const sourceItems = computed(() => [
  { label: t('common.allSources'), value: '__all__' },
  { label: t('prompt.backend'), value: '0' },
  ...sources.value.map(item => ({ label: item.name, value: String(item.id) })),
])

function toRow(item: any): PromptRow {
  return {
    id: item.id,
    title: item.title ?? '',
    content: item.content ?? '',
    coverUrl: item.cover_url ?? '',
    resultUrl: item.result_url ?? '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    category: item.category ?? '',
    sourceId: Number(item.source_id) || 0,
    sourceName: item.source_name ?? '',
    sourceUrl: item.source_url ?? '',
    uses: Number(item.uses) || 0,
    sortOrder: Number(item.sort_order) || 0,
    status: item.status === 2 ? 2 : 1,
  }
}

function toSourceRow(item: any): SourceRow {
  return {
    id: item.id,
    name: item.name ?? '',
    url: item.url ?? '',
    format: item.format === 'json' ? 'json' : 'markdown',
    tag: item.tag ?? '',
    enabled: item.enabled !== false,
    lastSyncedAt: formatUnix(item.last_synced_at),
    lastError: item.last_error ?? '',
    count: Number(item.count) || 0,
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminPromptApi.list({
      keyword: applied.value.keyword || undefined,
      tag: applied.value.tag || undefined,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
      // 「后台录入」是 source_id=0，但后端把 0 当作不过滤，所以这里不传，交给前端看 sourceName 区分
      source_id: applied.value.sourceId === '__all__' || applied.value.sourceId === '0'
        ? undefined
        : Number(applied.value.sourceId),
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('prompt.loadFail'), 'error')
      return
    }
    let items = parsed.items.map(toRow)
    if (applied.value.sourceId === '0')
      items = items.filter(item => item.sourceId === 0)
    rows.value = items
    total.value = parsed.total
    markListReady()
  }
  finally {
    loading.value = false
  }
})

async function fetchSources() {
  const raw = await adminPromptSourceApi.list()
  if (!isOk(raw)) {
    notify(raw?.message ?? t('prompt.sourceLoadFail'), 'error')
    return
  }
  sources.value = Array.isArray(raw.data) ? raw.data.map(toSourceRow) : []
}

function search() {
  applied.value = { ...draft }
  void fetchList()
}

function reset() {
  Object.assign(draft, { keyword: '', tag: '', status: '__all__', sourceId: '__all__' })
  search()
}

onMounted(() => {
  void fetchSources()
  void fetchList()
})

// ===== 提示词表单 =====
const formOpen = ref(false)
const editing = ref<PromptRow | null>(null)
const form = reactive({ title: '', content: '', coverUrl: '', resultUrl: '', tags: [] as string[], category: '', sortOrder: 0 })
const errors = reactive({ title: '', content: '' })
const saving = ref(false)
const coverFile = ref<File | null>(null)
const resultFile = ref<File | null>(null)
const uploadingCover = ref(false)
const uploadingResult = ref(false)
const uploading = computed(() => uploadingCover.value || uploadingResult.value)

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif'

type ImageField = 'coverUrl' | 'resultUrl'

function resetForm() {
  Object.assign(form, { title: '', content: '', coverUrl: '', resultUrl: '', tags: [], category: '', sortOrder: 0 })
  Object.assign(errors, { title: '', content: '' })
  coverFile.value = null
  resultFile.value = null
  uploadingCover.value = false
  uploadingResult.value = false
}

function openCreate() {
  editing.value = null
  resetForm()
  formOpen.value = true
}

function openEdit(item: PromptRow) {
  editing.value = item
  resetForm()
  Object.assign(form, {
    title: item.title,
    content: item.content,
    coverUrl: item.coverUrl,
    resultUrl: item.resultUrl,
    tags: [...item.tags],
    category: item.category,
    sortOrder: item.sortOrder,
  })
  formOpen.value = true
}

function previewUrl(url: string) {
  return resolveMediaUrl(url) || DEFAULT_WORK_COVER
}

function listCover(item: PromptRow) {
  return resolveMediaUrl(item.coverUrl || item.resultUrl) || DEFAULT_WORK_COVER
}

const TAG_DELIMITER = /[、,，]/

const imageFields = computed(() => [
  { field: 'coverUrl' as ImageField, label: t('prompt.coverField'), uploadLabel: t('prompt.coverUpload'), description: t('prompt.coverDescAlt') },
  { field: 'resultUrl' as ImageField, label: t('prompt.effectField'), uploadLabel: t('prompt.effectUpload'), description: t('prompt.effectDescAlt') },
])

const previewCover = computed(() => resolveMediaUrl(form.coverUrl.trim() || form.resultUrl.trim()) || DEFAULT_WORK_COVER)

function imageFileRef(field: ImageField) {
  return field === 'coverUrl' ? coverFile : resultFile
}

function imageUploadingRef(field: ImageField) {
  return field === 'coverUrl' ? uploadingCover : uploadingResult
}

function clearImage(field: ImageField) {
  if (imageUploadingRef(field).value)
    return
  imageFileRef(field).value = null
  form[field] = ''
}

async function onImageFile(field: ImageField, value: File | File[] | null | undefined) {
  const file = Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  const fileRef = imageFileRef(field)
  const busy = imageUploadingRef(field)
  fileRef.value = file
  if (!file)
    return
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
  if (!IMAGE_EXTS.includes(ext)) {
    fileRef.value = null
    notify(t('common.imageTypeOnly'), 'error')
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    fileRef.value = null
    notify(t('common.imageTooLarge', { n: 8 }), 'error')
    return
  }
  busy.value = true
  try {
    form[field] = await qiniu.uploadImage(file)
    fileRef.value = null
    notify(field === 'coverUrl' ? t('common.coverUploaded') : t('prompt.effectOk'))
  }
  catch (error: any) {
    fileRef.value = null
    notify(error?.message || t('common.uploadFail'), 'error')
  }
  finally {
    busy.value = false
  }
}

function validate() {
  errors.title = form.title.trim() ? '' : t('prompt.titleRequired')
  errors.content = form.content.trim() ? '' : t('prompt.contentRequired')
  return !errors.title && !errors.content
}

async function save() {
  if (saving.value || uploading.value || !validate())
    return
  saving.value = true
  try {
    const payload: AdminPromptPayload = {
      title: form.title.trim(),
      content: form.content.trim(),
      cover_url: form.coverUrl.trim(),
      result_url: form.resultUrl.trim(),
      tags: [...new Set(form.tags.map(v => v.trim()).filter(Boolean))],
      category: form.category.trim(),
      sort_order: Number(form.sortOrder) || 0,
    }
    const raw = editing.value
      ? await adminPromptApi.update(editing.value.id, payload)
      : await adminPromptApi.create(payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editing.value ? t('prompt.updated') : t('prompt.created'), 'success')
    formOpen.value = false
    void fetchList()
  }
  finally {
    saving.value = false
  }
}

async function toggleStatus(item: PromptRow) {
  const next = item.status === 1 ? 2 : 1
  const raw = await adminPromptApi.update(item.id, { status: next })
  if (!isOk(raw)) {
    notify(raw?.message ?? t('common.opFail'), 'error')
    return
  }
  item.status = next
}

const confirmOpen = ref(false)
const confirmItem = ref<PromptRow | null>(null)
const confirming = ref(false)

function requestDelete(item: PromptRow) {
  confirmItem.value = item
  confirmOpen.value = true
}

async function doDelete() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = await adminPromptApi.remove(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.deleteFail'), 'error')
      return
    }
    notify(t('common.deletedOk'), 'success')
    confirmOpen.value = false
    void fetchList()
  }
  finally {
    confirming.value = false
  }
}

// ===== 远程源 =====
const sourcePanelOpen = ref(false)
const sourceFormOpen = ref(false)
const editingSource = ref<SourceRow | null>(null)
const sourceForm = reactive({ name: '', url: '', format: 'markdown' as 'markdown' | 'json', tag: '', enabled: true })
const sourceErrors = reactive({ name: '', url: '' })
const sourceSaving = ref(false)
const syncingId = ref(0)

const formatItems = computed(() => [
  { label: t('prompt.formatMarkdown'), value: 'markdown' as const },
  { label: t('prompt.formatJson'), value: 'json' as const },
])

function openSourceCreate() {
  editingSource.value = null
  Object.assign(sourceForm, { name: '', url: '', format: 'markdown', tag: '', enabled: true })
  Object.assign(sourceErrors, { name: '', url: '' })
  sourceFormOpen.value = true
}

function openSourceEdit(item: SourceRow) {
  editingSource.value = item
  Object.assign(sourceForm, { name: item.name, url: item.url, format: item.format, tag: item.tag, enabled: item.enabled })
  Object.assign(sourceErrors, { name: '', url: '' })
  sourceFormOpen.value = true
}

async function saveSource() {
  if (sourceSaving.value)
    return
  sourceErrors.name = sourceForm.name.trim() ? '' : t('prompt.sourceNameRequired')
  const url = sourceForm.url.trim()
  sourceErrors.url = /^https?:\/\//.test(url) ? '' : t('prompt.urlInvalid')
  if (sourceErrors.name || sourceErrors.url)
    return
  sourceSaving.value = true
  try {
    const payload: AdminPromptSourcePayload = {
      name: sourceForm.name.trim(),
      url,
      format: sourceForm.format,
      tag: sourceForm.tag.trim(),
      enabled: sourceForm.enabled,
    }
    const raw = editingSource.value
      ? await adminPromptSourceApi.update(editingSource.value.id, payload)
      : await adminPromptSourceApi.create(payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editingSource.value ? t('prompt.sourceUpdated') : t('prompt.sourceCreated'), 'success')
    sourceFormOpen.value = false
    void fetchSources()
  }
  finally {
    sourceSaving.value = false
  }
}

async function syncSource(item: SourceRow) {
  if (syncingId.value)
    return
  syncingId.value = item.id
  try {
    const raw = await adminPromptSourceApi.sync(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('prompt.syncFail'), 'error')
      void fetchSources()
      return
    }
    const data = raw.data ?? {}
    notify(t('prompt.syncDetail', { total: data.total ?? 0, created: data.created ?? 0 }), 'success')
    void fetchSources()
    void fetchList()
  }
  finally {
    syncingId.value = 0
  }
}

async function removeSource(item: SourceRow) {
  const raw = await adminPromptSourceApi.remove(item.id)
  if (!isOk(raw)) {
    notify(raw?.message ?? t('common.deleteFail'), 'error')
    return
  }
  notify(t('prompt.sourceDeleted'), 'success')
  void fetchSources()
  void fetchList()
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('prompt.title')" :page-description="t('prompt.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('prompt.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('prompt.remote') }}</p>
          <p class="mt-0.5 text-xs text-zinc-500">
            {{ t('prompt.remoteHintAlt') }}
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <UButton type="button" size="sm" variant="outline" @click="() => { sourcePanelOpen = !sourcePanelOpen }">
            {{ sourcePanelOpen ? t('common.collapseFilters') : t('prompt.manageSources', { n: sources.length }) }}
          </UButton>
          <UButton v-if="sourcePanelOpen" type="button" size="sm" icon="i-lucide-plus" @click="openSourceCreate">{{ t('prompt.addSourceBtn') }}</UButton>
        </div>
      </div>

      <div v-if="sourcePanelOpen" class="mt-4 overflow-x-auto">
        <UEmpty v-if="!sources.length" icon="i-lucide-rss" :title="t('prompt.noSource')" :description="t('prompt.noSourceAlt')" class="min-h-40" />
        <table v-else class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.name') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('prompt.url') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('prompt.format') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('prompt.lastSync') }}</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in sources" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="max-w-0 w-full px-4 py-3">
                <div class="truncate font-medium" :title="item.name">
                  {{ item.name }}
                  <UBadge v-if="item.tag" color="neutral" variant="subtle" class="ml-1">{{ item.tag }}</UBadge>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500" :title="item.url">{{ item.url }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.format }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="item.enabled ? 'success' : 'neutral'" variant="subtle">{{ item.enabled ? t('common.enabled') : t('common.disabled') }}</UBadge>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs">
                <span v-if="item.lastError" class="text-red-500">{{ item.lastError }}</span>
                <span v-else-if="item.lastSyncedAt" class="text-zinc-500">{{ item.lastSyncedAt }} · {{ t('prompt.rowCount', { n: item.count }) }}</span>
                <span v-else class="text-zinc-400">{{ t('prompt.neverSync') }}</span>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" :loading="syncingId === item.id" @click="syncSource(item)">{{ t('prompt.sync') }}</UButton>
                  <UButton type="button" size="sm" variant="soft" @click="openSourceEdit(item)">{{ t('common.edit') }}</UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="removeSource(item)">{{ t('common.delete') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.keyword')">
          <UInput icon="i-lucide-search" v-model="draft.keyword" :placeholder="t('prompt.keywordPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.tag')">
          <UInput v-model="draft.tag" :placeholder="t('prompt.tagPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('prompt.source')">
          <USelect v-model="draft.sourceId" :items="sourceItems" value-key="value" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </ManageFilterField>
    </ManageFilterBar>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty v-else-if="!rows.length" icon="i-lucide-quote" :title="t('prompt.empty')" :description="t('prompt.emptyDesc')" class="min-h-72" />
      <div v-else class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.title') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.tag') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('prompt.source') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('prompt.colCopy') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.sort') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="max-w-0 w-full px-4 py-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                    <img :src="listCover(item)" alt="" class="h-full w-full object-cover">
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium" :title="item.title">{{ item.title }}</p>
                    <p class="truncate text-xs text-zinc-400" :title="item.content">{{ item.content }}</p>
                  </div>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="tag in item.tags" :key="tag" color="neutral" variant="subtle">{{ tag }}</UBadge>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ item.sourceName || t('prompt.backend') }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.uses }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('common.onShelf') : t('common.offShelf') }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                  <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="toggleStatus(item)">
                    {{ item.status === 1 ? t('common.takeDown') : t('common.putOn') }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">{{ t('common.delete') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="total" class="mt-3 text-xs text-zinc-500">{{ t('common.totalItems', { total }) }}</p>

    <UModal
      v-model:open="formOpen"
      :title="editing ? t('prompt.editTitle') : t('prompt.createTitle')"
      :description="t('prompt.formHintAlt')"
      :ui="{ content: 'w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] sm:max-w-[64rem]', body: 'p-0 sm:p-0', footer: 'justify-between gap-2' }"
    >
      <template #body>
        <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div class="space-y-6 p-4 sm:p-6">
            <section class="space-y-4">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <UIcon name="i-lucide-file-text" class="size-4 text-primary" />
                {{ t('plan.basic') }}
              </h3>
              <UFormField :label="t('common.title')" required :hint="`${form.title.length}/200`" :error="errors.title || undefined">
                <UInput v-model="form.title" maxlength="200" :placeholder="t('prompt.titlePh')" class="w-full" @update:model-value="() => { errors.title = '' }" />
              </UFormField>
              <UFormField :label="t('prompt.contentLabel')" required :hint="`${form.content.length}/8000`" :error="errors.content || undefined">
                <UTextarea
                  v-model="form.content"
                  :rows="9"
                  autoresize
                  :maxrows="16"
                  maxlength="8000"
                  :placeholder="t('prompt.contentHelp')"
                  class="w-full"
                  :ui="{ base: 'leading-relaxed' }"
                  @update:model-value="() => { errors.content = '' }"
                />
              </UFormField>
              <UFormField :label="t('common.tag')" :help="t('prompt.tagsHelpAlt')">
                <UInputTags
                  v-model="form.tags"
                  :delimiter="TAG_DELIMITER"
                  :max="10"
                  :max-length="20"
                  add-on-paste
                  add-on-blur
                  :placeholder="t('prompt.tagExample')"
                  class="w-full"
                />
              </UFormField>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField :label="t('common.category')">
                  <UInput v-model="form.category" maxlength="50" :placeholder="t('prompt.categoryPh')" class="w-full" />
                </UFormField>
                <UFormField :label="t('common.sort')" :hint="t('prompt.sortHint')">
                  <UInputNumber v-model="form.sortOrder" :min="0" class="w-full" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <UIcon name="i-lucide-image" class="size-4 text-primary" />
                  {{ t('prompt.assets') }}
                </h3>
                <span class="text-xs text-zinc-500">{{ t('prompt.imageSpec') }}</span>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField v-for="item in imageFields" :key="item.field" :label="item.label">
                  <div class="space-y-2">
                    <div v-if="form[item.field]" class="group relative aspect-video overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="previewUrl(form[item.field])" alt="" class="h-full w-full object-cover">
                      <div class="absolute inset-0 flex items-center justify-center gap-2 bg-zinc-950/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <UButton
                          :to="previewUrl(form[item.field])"
                          target="_blank"
                          size="sm"
                          color="neutral"
                          variant="solid"
                          icon="i-lucide-external-link"
                        >
                          {{ t('prompt.newWindow') }}
                        </UButton>
                        <UButton
                          type="button"
                          size="sm"
                          color="error"
                          variant="solid"
                          icon="i-lucide-trash-2"
                          :disabled="imageUploadingRef(item.field).value"
                          @click="clearImage(item.field)"
                        >
                          {{ t('common.remove') }}
                        </UButton>
                      </div>
                    </div>
                    <UFileUpload
                      v-else
                      :model-value="imageFileRef(item.field).value"
                      :accept="IMAGE_ACCEPT"
                      icon="i-lucide-image-plus"
                      :label="imageUploadingRef(item.field).value ? t('common.uploading') : item.uploadLabel"
                      :description="item.description"
                      :disabled="imageUploadingRef(item.field).value"
                      class="w-full"
                      :ui="{ base: 'aspect-video min-h-0' }"
                      @update:model-value="value => onImageFile(item.field, value)"
                    />
                    <UInput v-model="form[item.field]" icon="i-lucide-link" size="sm" :placeholder="t('common.pasteUrl')" class="w-full" />
                  </div>
                </UFormField>
              </div>
            </section>
          </div>

          <aside class="border-t border-zinc-200 bg-zinc-50 p-4 sm:p-6 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div class="lg:sticky lg:top-0">
              <p class="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-500">
                <UIcon name="i-lucide-eye" class="size-3.5" />
                {{ t('prompt.cardPreview') }}
              </p>
              <div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                <div class="aspect-video bg-zinc-100 dark:bg-zinc-800">
                  <img :src="previewCover" alt="" class="h-full w-full object-cover">
                </div>
                <div class="space-y-2 p-3">
                  <p class="truncate text-sm font-semibold" :class="form.title.trim() ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'">
                    {{ form.title.trim() || t('prompt.previewTitlePh') }}
                  </p>
                  <p class="line-clamp-4 whitespace-pre-line text-xs leading-relaxed" :class="form.content.trim() ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400'">
                    {{ form.content.trim() || t('prompt.previewBodyPh') }}
                  </p>
                  <div v-if="form.tags.length || form.category.trim()" class="flex flex-wrap gap-1">
                    <UBadge v-if="form.category.trim()" color="primary" variant="subtle" size="sm">{{ form.category.trim() }}</UBadge>
                    <UBadge v-for="tag in form.tags" :key="tag" color="neutral" variant="subtle" size="sm">{{ tag }}</UBadge>
                  </div>
                  <div class="flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-400 dark:border-zinc-800">
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-copy" class="size-3.5" />
                      {{ t('prompt.copyTimes', { n: editing?.uses ?? 0 }) }}
                    </span>
                    <span>{{ editing?.sourceName || t('prompt.backend') }}</span>
                  </div>
                </div>
              </div>
              <p class="mt-3 text-xs leading-relaxed text-zinc-500">{{ t('prompt.syncKeep') }}</p>
            </div>
          </aside>
        </div>
      </template>
      <template #footer>
        <p class="text-xs text-zinc-500"><span class="text-red-500">*</span> {{ t('prompt.requiredMark') }}</p>
        <div class="flex gap-2">
          <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
          <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="save">
            {{ saving ? t('common.saving') : uploading ? t('prompt.uploadingImages') : editing ? t('prompt.saveEdit') : t('prompt.createBtn') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="sourceFormOpen" :title="editingSource ? t('prompt.editSource') : t('prompt.addSource')" :ui="{ content: 'w-[min(96vw,36rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('common.name')" required :error="sourceErrors.name || undefined">
            <UInput v-model="sourceForm.name" maxlength="100" :placeholder="t('prompt.sourceNamePh')" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('prompt.fetchUrl')"
            required
            :error="sourceErrors.url || undefined"
            :help="t('prompt.fetchHelpAlt')"
          >
            <UInput v-model="sourceForm.url" placeholder="https://raw.githubusercontent.com/owner/repo/main/README.md" class="w-full" />
          </UFormField>
          <UFormField :label="t('prompt.parseFormat')" :help="t('prompt.parseHelpAlt')">
            <USelect v-model="sourceForm.format" :items="formatItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField :label="t('prompt.unifyTag')" :help="t('prompt.unifyHelpAlt')">
            <UInput v-model="sourceForm.tag" maxlength="50" :placeholder="t('prompt.optionalShort')" class="w-full" />
          </UFormField>
          <UCheckbox v-model="sourceForm.enabled" :label="t('prompt.joinSync')" />
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="sourceSaving" @click="() => { sourceFormOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="sourceSaving" @click="saveSource">{{ t('common.save') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal v-model:open="confirmOpen" :title="t('prompt.deleteTitle')" :confirm-text="t('common.delete')" :loading="confirming" @confirm="doDelete">
      {{ t('prompt.deleteAsk', { name: confirmItem?.title }) }}
      <p v-if="confirmItem?.sourceId" class="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{{ t('prompt.resyncWarn') }}</p>
    </ManageConfirmModal>
  </div>
</template>
