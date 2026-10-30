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

const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架', value: '1' },
  { label: '已下架', value: '2' },
]
const sourceItems = computed(() => [
  { label: '全部来源', value: '__all__' },
  { label: '后台录入', value: '0' },
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
      notify(raw?.message ?? '提示词加载失败', 'error')
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
    notify(raw?.message ?? '来源加载失败', 'error')
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

const imageFields: { field: ImageField, label: string, uploadLabel: string, description: string }[] = [
  { field: 'coverUrl', label: '封面图', uploadLabel: '点击或拖拽上传封面', description: '列表卡片展示，缺省用默认图' },
  { field: 'resultUrl', label: '效果图', uploadLabel: '点击或拖拽上传效果图', description: '详情页优先展示，缺省用封面' },
]

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
    notify('仅支持 jpg、png、webp、gif 图片', 'error')
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    fileRef.value = null
    notify('图片不能超过 8MB', 'error')
    return
  }
  busy.value = true
  try {
    form[field] = await qiniu.uploadImage(file)
    fileRef.value = null
    notify(field === 'coverUrl' ? '封面上传成功' : '效果图上传成功')
  }
  catch (error: any) {
    fileRef.value = null
    notify(error?.message || '上传失败，请稍后重试', 'error')
  }
  finally {
    busy.value = false
  }
}

function validate() {
  errors.title = form.title.trim() ? '' : '请输入标题'
  errors.content = form.content.trim() ? '' : '请输入提示词正文'
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
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editing.value ? '提示词已更新' : '提示词已创建', 'success')
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
    notify(raw?.message ?? '操作失败', 'error')
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
      notify(raw?.message ?? '删除失败', 'error')
      return
    }
    notify('已删除', 'success')
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

const formatItems = [
  { label: 'Markdown（按标题切段）', value: 'markdown' },
  { label: 'JSON（对象数组）', value: 'json' },
]

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
  sourceErrors.name = sourceForm.name.trim() ? '' : '请输入来源名称'
  const url = sourceForm.url.trim()
  sourceErrors.url = /^https?:\/\//.test(url) ? '' : '请输入 http(s) 开头的抓取地址'
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
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editingSource.value ? '来源已更新' : '来源已创建', 'success')
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
      notify(raw?.message ?? '同步失败', 'error')
      void fetchSources()
      return
    }
    const data = raw.data ?? {}
    notify(`同步完成：解析 ${data.total ?? 0} 条，新增 ${data.created ?? 0} 条`, 'success')
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
    notify(raw?.message ?? '删除失败', 'error')
    return
  }
  notify('来源已删除，已同步的提示词会保留', 'success')
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
          <p class="text-sm font-medium">远程源</p>
          <p class="mt-0.5 text-xs text-zinc-500">
            每 12 小时自动同步一轮。老条目只更新正文，后台改过的标题、封面、标签不会被冲掉。
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <UButton type="button" size="sm" variant="outline" @click="() => { sourcePanelOpen = !sourcePanelOpen }">
            {{ sourcePanelOpen ? '收起' : `管理来源（${sources.length}）` }}
          </UButton>
          <UButton v-if="sourcePanelOpen" type="button" size="sm" icon="i-lucide-plus" @click="openSourceCreate">新增来源</UButton>
        </div>
      </div>

      <div v-if="sourcePanelOpen" class="mt-4 overflow-x-auto">
        <UEmpty v-if="!sources.length" icon="i-lucide-rss" title="还没有远程源" description="填一个 GitHub raw 地址即可开始同步。" class="min-h-40" />
        <table v-else class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">名称</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">地址</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">格式</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">上次同步</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
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
                <UBadge :color="item.enabled ? 'success' : 'neutral'" variant="subtle">{{ item.enabled ? '启用' : '停用' }}</UBadge>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs">
                <span v-if="item.lastError" class="text-red-500">{{ item.lastError }}</span>
                <span v-else-if="item.lastSyncedAt" class="text-zinc-500">{{ item.lastSyncedAt }} · {{ item.count }} 条</span>
                <span v-else class="text-zinc-400">未同步</span>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" :loading="syncingId === item.id" @click="syncSource(item)">同步</UButton>
                  <UButton type="button" size="sm" variant="soft" @click="openSourceEdit(item)">编辑</UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="removeSource(item)">删除</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-4">
        <UFormField label="关键词">
          <UInput v-model="draft.keyword" placeholder="标题或正文" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="标签">
          <UInput v-model="draft.tag" placeholder="按单个标签筛选" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="来源">
          <USelect v-model="draft.sourceId" :items="sourceItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="状态">
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
      <UEmpty v-else-if="!rows.length" icon="i-lucide-quote" :title="t('prompt.empty')" :description="t('prompt.emptyDesc')" class="min-h-72" />
      <div v-else class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">标题</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">标签</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">来源</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">复制</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">排序</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
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
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ item.sourceName || '后台录入' }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.uses }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '已上架' : '已下架' }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                  <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="toggleStatus(item)">
                    {{ item.status === 1 ? '下架' : '上架' }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">删除</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="total" class="mt-3 text-xs text-zinc-500">共 {{ total }} 条</p>

    <UModal
      v-model:open="formOpen"
      :title="editing ? '编辑提示词' : '新增提示词'"
      description="上架后展示在前台提示词库，用户可一键复制正文"
      :ui="{ content: 'w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] sm:max-w-[64rem]', body: 'p-0 sm:p-0', footer: 'justify-between gap-2' }"
    >
      <template #body>
        <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div class="space-y-6 p-4 sm:p-6">
            <section class="space-y-4">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <UIcon name="i-lucide-file-text" class="size-4 text-primary" />
                基本信息
              </h3>
              <UFormField label="标题" required :hint="`${form.title.length}/200`" :error="errors.title || undefined">
                <UInput v-model="form.title" maxlength="200" placeholder="例如：电影感人像" class="w-full" @update:model-value="() => { errors.title = '' }" />
              </UFormField>
              <UFormField label="提示词正文" required :hint="`${form.content.length}/8000`" :error="errors.content || undefined">
                <UTextarea
                  v-model="form.content"
                  :rows="9"
                  autoresize
                  :maxrows="16"
                  maxlength="8000"
                  placeholder="用户会原样复制这段文字，建议写清主体、风格、光线、镜头等关键描述"
                  class="w-full"
                  :ui="{ base: 'leading-relaxed' }"
                  @update:model-value="() => { errors.content = '' }"
                />
              </UFormField>
              <UFormField label="标签" help="输入后按回车、逗号或顿号添加，最多 10 个">
                <UInputTags
                  v-model="form.tags"
                  :delimiter="TAG_DELIMITER"
                  :max="10"
                  :max-length="20"
                  add-on-paste
                  add-on-blur
                  placeholder="例如：人像"
                  class="w-full"
                />
              </UFormField>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="分类">
                  <UInput v-model="form.category" maxlength="50" placeholder="选填，例如：摄影" class="w-full" />
                </UFormField>
                <UFormField label="排序" hint="越大越靠前">
                  <UInputNumber v-model="form.sortOrder" :min="0" class="w-full" />
                </UFormField>
              </div>
            </section>

            <section class="space-y-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <UIcon name="i-lucide-image" class="size-4 text-primary" />
                  图片素材
                </h3>
                <span class="text-xs text-zinc-500">建议 800×450（16:9），jpg / png / webp / gif，≤ 8MB</span>
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
                          新窗口查看
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
                          移除
                        </UButton>
                      </div>
                    </div>
                    <UFileUpload
                      v-else
                      :model-value="imageFileRef(item.field).value"
                      :accept="IMAGE_ACCEPT"
                      icon="i-lucide-image-plus"
                      :label="imageUploadingRef(item.field).value ? '上传中…' : item.uploadLabel"
                      :description="item.description"
                      :disabled="imageUploadingRef(item.field).value"
                      class="w-full"
                      :ui="{ base: 'aspect-video min-h-0' }"
                      @update:model-value="value => onImageFile(item.field, value)"
                    />
                    <UInput v-model="form[item.field]" icon="i-lucide-link" size="sm" placeholder="或粘贴图片地址" class="w-full" />
                  </div>
                </UFormField>
              </div>
            </section>
          </div>

          <aside class="border-t border-zinc-200 bg-zinc-50 p-4 sm:p-6 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div class="lg:sticky lg:top-0">
              <p class="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-500">
                <UIcon name="i-lucide-eye" class="size-3.5" />
                前台卡片预览
              </p>
              <div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                <div class="aspect-video bg-zinc-100 dark:bg-zinc-800">
                  <img :src="previewCover" alt="" class="h-full w-full object-cover">
                </div>
                <div class="space-y-2 p-3">
                  <p class="truncate text-sm font-semibold" :class="form.title.trim() ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'">
                    {{ form.title.trim() || '提示词标题' }}
                  </p>
                  <p class="line-clamp-4 whitespace-pre-line text-xs leading-relaxed" :class="form.content.trim() ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400'">
                    {{ form.content.trim() || '这里展示提示词正文摘要，用户点击卡片后可复制完整内容。' }}
                  </p>
                  <div v-if="form.tags.length || form.category.trim()" class="flex flex-wrap gap-1">
                    <UBadge v-if="form.category.trim()" color="primary" variant="subtle" size="sm">{{ form.category.trim() }}</UBadge>
                    <UBadge v-for="tag in form.tags" :key="tag" color="neutral" variant="subtle" size="sm">{{ tag }}</UBadge>
                  </div>
                  <div class="flex items-center justify-between border-t border-zinc-100 pt-2 text-xs text-zinc-400 dark:border-zinc-800">
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-copy" class="size-3.5" />
                      {{ editing?.uses ?? 0 }} 次复制
                    </span>
                    <span>{{ editing?.sourceName || '后台录入' }}</span>
                  </div>
                </div>
              </div>
              <p class="mt-3 text-xs leading-relaxed text-zinc-500">远程源同步的条目，后台改过的标题、封面、标签不会被下次同步覆盖。</p>
            </div>
          </aside>
        </div>
      </template>
      <template #footer>
        <p class="text-xs text-zinc-500"><span class="text-red-500">*</span> 为必填项</p>
        <div class="flex gap-2">
          <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">取消</UButton>
          <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="save">
            {{ saving ? '保存中…' : uploading ? '图片上传中…' : editing ? '保存修改' : '创建提示词' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="sourceFormOpen" :title="editingSource ? '编辑来源' : '新增来源'" :ui="{ content: 'w-[min(96vw,36rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="名称" required :error="sourceErrors.name || undefined">
            <UInput v-model="sourceForm.name" maxlength="100" placeholder="例如：某开源提示词仓库" class="w-full" />
          </UFormField>
          <UFormField
            label="抓取地址"
            required
            :error="sourceErrors.url || undefined"
            help="GitHub 用 raw.githubusercontent.com 的直链，不要用网页地址。单次最多读 4MB，超时 20 秒。"
          >
            <UInput v-model="sourceForm.url" placeholder="https://raw.githubusercontent.com/owner/repo/main/README.md" class="w-full" />
          </UFormField>
          <UFormField label="解析格式" help="Markdown 取每个二级/三级标题下的第一个代码块；JSON 认 title/content 等常见字段名。">
            <USelect v-model="sourceForm.format" :items="formatItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="统一标签" help="这个源同步进来的条目都会带上，方便前台按来源筛。">
            <UInput v-model="sourceForm.tag" maxlength="50" placeholder="选填" class="w-full" />
          </UFormField>
          <UCheckbox v-model="sourceForm.enabled" label="参与定时同步" />
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="sourceSaving" @click="() => { sourceFormOpen = false }">取消</UButton>
        <UButton type="button" :loading="sourceSaving" @click="saveSource">保存</UButton>
      </template>
    </UModal>

    <ManageConfirmModal v-model:open="confirmOpen" title="删除提示词" confirm-text="删除" :loading="confirming" @confirm="doDelete">
      确定删除「{{ confirmItem?.title }}」吗？删除后前台立即不可见。
      <p v-if="confirmItem?.sourceId" class="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">该条来自远程源，下次同步会重新拉回来，如果不想要它，请先停用来源。</p>
    </ManageConfirmModal>
  </div>
</template>
