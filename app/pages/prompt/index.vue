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
const form = reactive({ title: '', content: '', coverUrl: '', resultUrl: '', tags: '', category: '', sortOrder: 0 })
const errors = reactive({ title: '', content: '' })
const saving = ref(false)

function openCreate() {
  editing.value = null
  Object.assign(form, { title: '', content: '', coverUrl: '', resultUrl: '', tags: '', category: '', sortOrder: 0 })
  Object.assign(errors, { title: '', content: '' })
  formOpen.value = true
}

function openEdit(item: PromptRow) {
  editing.value = item
  Object.assign(form, {
    title: item.title,
    content: item.content,
    coverUrl: item.coverUrl,
    resultUrl: item.resultUrl,
    tags: item.tags.join('、'),
    category: item.category,
    sortOrder: item.sortOrder,
  })
  Object.assign(errors, { title: '', content: '' })
  formOpen.value = true
}

function validate() {
  errors.title = form.title.trim() ? '' : '请输入标题'
  errors.content = form.content.trim() ? '' : '请输入提示词正文'
  return !errors.title && !errors.content
}

async function save() {
  if (saving.value || !validate())
    return
  saving.value = true
  try {
    const payload: AdminPromptPayload = {
      title: form.title.trim(),
      content: form.content.trim(),
      cover_url: form.coverUrl.trim(),
      result_url: form.resultUrl.trim(),
      // 顿号和逗号都收，运营怎么顺手怎么填
      tags: form.tags.split(/[、,，]/).map(v => v.trim()).filter(Boolean),
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
              <th class="px-4 py-3">名称</th>
              <th class="px-4 py-3">地址</th>
              <th class="w-24 px-4 py-3">格式</th>
              <th class="w-24 px-4 py-3">状态</th>
              <th class="whitespace-nowrap px-4 py-3">上次同步</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in sources" :key="item.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="px-4 py-3 font-medium">
                {{ item.name }}
                <UBadge v-if="item.tag" color="neutral" variant="subtle" class="ml-1">{{ item.tag }}</UBadge>
              </td>
              <td class="max-w-xs truncate px-4 py-3 text-xs text-zinc-500">{{ item.url }}</td>
              <td class="px-4 py-3">{{ item.format }}</td>
              <td class="px-4 py-3">
                <UBadge :color="item.enabled ? 'success' : 'neutral'" variant="subtle">{{ item.enabled ? '启用' : '停用' }}</UBadge>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-xs">
                <span v-if="item.lastError" class="text-red-500">{{ item.lastError }}</span>
                <span v-else-if="item.lastSyncedAt" class="text-zinc-500">{{ item.lastSyncedAt }} · {{ item.count }} 条</span>
                <span v-else class="text-zinc-400">未同步</span>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <div class="flex flex-nowrap gap-1">
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
              <th class="px-4 py-3">标题</th>
              <th class="px-4 py-3">标签</th>
              <th class="whitespace-nowrap px-4 py-3">来源</th>
              <th class="w-20 px-4 py-3">复制</th>
              <th class="w-20 px-4 py-3">排序</th>
              <th class="whitespace-nowrap px-4 py-3">状态</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in rows" :key="item.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="max-w-sm px-4 py-3">
                <p class="truncate font-medium">{{ item.title }}</p>
                <p class="truncate text-xs text-zinc-500">{{ item.content }}</p>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="tag in item.tags" :key="tag" color="neutral" variant="subtle">{{ tag }}</UBadge>
                </div>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ item.sourceName || '后台录入' }}</td>
              <td class="px-4 py-3 tabular-nums">{{ item.uses }}</td>
              <td class="px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="whitespace-nowrap px-4 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '已上架' : '已下架' }}</UBadge>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <div class="flex flex-nowrap gap-1">
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

    <UModal v-model:open="formOpen" :title="editing ? '编辑提示词' : '新增提示词'" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="标题" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="200" placeholder="例如：电影感人像" class="w-full" />
          </UFormField>
          <UFormField label="提示词正文" required :error="errors.content || undefined">
            <UTextarea v-model="form.content" :rows="8" maxlength="8000" placeholder="用户会原样复制这段文字" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="标签" help="用顿号或逗号分隔">
              <UInput v-model="form.tags" placeholder="人像、电影感" class="w-full" />
            </UFormField>
            <UFormField label="分类">
              <UInput v-model="form.category" maxlength="50" placeholder="选填" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="封面图地址">
              <UInput v-model="form.coverUrl" placeholder="选填" class="w-full" />
            </UFormField>
            <UFormField label="效果图地址">
              <UInput v-model="form.resultUrl" placeholder="选填，详情里优先展示" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="排序" help="越大越靠前">
            <UInput v-model.number="form.sortOrder" type="number" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" @click="save">保存</UButton>
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

    <UModal v-model:open="confirmOpen" title="删除提示词" :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm">
          确定删除「{{ confirmItem?.title }}」吗？删除后前台立即不可见。
          <span v-if="confirmItem?.sourceId" class="text-zinc-500">该条来自远程源，下次同步会重新拉回来，如果不想要它，请先停用来源。</span>
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton type="button" color="error" :loading="confirming" @click="doDelete">删除</UButton>
      </template>
    </UModal>
  </div>
</template>
