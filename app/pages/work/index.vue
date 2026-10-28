<script setup lang="ts">
import { adminCategoryApi, adminWorkApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import qiniu from '~/api/qiniu'
import type { AdminWork } from '~/types/easytv-admin'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'
import { SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'

const { t } = useI18n()
useHead({ title: () => t('work.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminWork[]>([])
const draft = reactive({ title: '', status: '__all__', lang: SELECT_ITEM_ALL })
const applied = ref({ title: '', status: '__all__', lang: SELECT_ITEM_ALL })
const formOpen = ref(false)
const editing = ref<AdminWork | null>(null)
const form = reactive({ title: '', description: '', category: '', cover: '' })
const errors = reactive({ title: '' })
const saving = ref(false)
const uploading = ref(false)
const coverFile = ref<File | null>(null)
const COVER_MAX_BYTES = 8 * 1024 * 1024
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const coverPreviewUrl = computed(() => form.cover.trim() ? resolveMediaUrl(form.cover) : '')
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminWork | null>(null)
const confirming = ref(false)

/** 与旧模板兼容：filtered/pageRows 直接指向服务端当前页 */
const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
const DRAFT_DEFAULT = { title: '', status: '__all__', lang: SELECT_ITEM_ALL }
const API = adminWorkApi
const LANGS = ['zh', 'en', 'ja', 'ko', 'es', 'fr'] as const
const langItems = computed(() => [
  { label: t('work.langAll'), value: SELECT_ITEM_ALL },
  ...LANGS.map(code => ({ label: t(`work.lang.${code}`), value: code })),
])
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架', value: '1' },
  { label: '已下架', value: '2' },
]
const categories = ref<string[]>([])
const formCategoryItems = computed(() => {
  const list = categories.value.map(name => ({ label: name, value: name }))
  if (form.category && !categories.value.includes(form.category))
    list.unshift({ label: form.category, value: form.category })
  return list
})
const filteredWorks = filtered
const raws = new Map<number, any>()
function langOf(item: AdminWork) {
  const code = String(raws.get(item.id)?.lang || 'zh')
  return (LANGS as readonly string[]).includes(code) ? t(`work.lang.${code}`) : code
}
function formatDuration(sec: number) {
  const total = Math.max(0, Math.round(Number(sec) || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function toRow(item: any): AdminWork {
  raws.set(item.id, item)
  return {
    id: item.id,
    uuid: String(item.id),
    title: item.title,
    cover: resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER,
    authorName: item.author?.nickname || `#${item.user_id}`,
    duration: formatDuration(item.duration),
    playCount: Number(item.view_count) || 0,
    likeCount: Number(item.like_count) || 0,
    status: item.status === 1 ? 1 : 2,
    createdAt: formatUnix(item.created_at),
  }
}
function LIST_FN() {
  return API.list({
    page: page.value,
    page_size: pageSize.value,
    keyword: applied.value.title || undefined,
    status: applied.value.status === '__all__' ? undefined : applied.value.status,
    lang: applied.value.lang === SELECT_ITEM_ALL ? undefined : applied.value.lang,
  })
}

async function loadCategories() {
  const raw = await adminCategoryApi.list({ scope: 'work', status: 1 })
  const parsed = parsePaged(raw)
  if (parsed)
    categories.value = parsed.items.map((item: any) => String(item.name))
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await LIST_FN()
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? '加载失败', 'error')
      return
    }
    rows.value = parsed.items.map(toRow)
    total.value = parsed.total
    markListReady()
  }
  finally {
    loading.value = false
  }
})

onMounted(() => {
  void loadCategories()
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { ...draft }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, DRAFT_DEFAULT)
  search()
}
function openEdit(item: AdminWork) {
  editing.value = item
  uploading.value = false
  coverFile.value = null
  const raw = raws.get(item.id) ?? {}
  Object.assign(form, {
    title: item.title,
    description: raw.description ?? '',
    category: raw.category ?? '',
    cover: raw.cover_url ?? '',
  })
  errors.title = ''
  formOpen.value = true
}
function validate() {
  errors.title = form.title.trim() ? '' : '请输入作品标题'
  return !errors.title
}
function clearCover() {
  if (uploading.value)
    return
  coverFile.value = null
  form.cover = ''
}
async function onCoverFile(value: File | File[] | null | undefined) {
  const file = Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  coverFile.value = file
  if (!file) {
    form.cover = ''
    return
  }
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
  if (!COVER_EXTS.includes(ext)) {
    coverFile.value = null
    notify('仅支持 jpg、png、webp、gif 图片', 'error')
    return
  }
  if (file.size > COVER_MAX_BYTES) {
    coverFile.value = null
    notify('封面图片不能超过 8MB', 'error')
    return
  }
  uploading.value = true
  try {
    form.cover = await qiniu.uploadImage(file)
    coverFile.value = null
    notify('封面上传成功')
  }
  catch (error: any) {
    coverFile.value = null
    notify(error?.message || '封面上传失败，请稍后重试', 'error')
  }
  finally {
    uploading.value = false
  }
}
async function submit() {
  if (!validate() || uploading.value || !editing.value)
    return
  saving.value = true
  try {
    const raw = await API.update(editing.value.id, {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      cover_url: form.cover.trim(),
    })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败，请稍后重试', 'error')
      return
    }
    notify('作品更新成功')
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminWork, action: 'status' | 'delete') {
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
      ? await API.remove(item.id)
      : await API.setStatus(item.id, item.status === 1 ? 2 : 1)
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败，请稍后重试', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? '作品已删除' : (item.status === 1 ? '作品已下架' : '作品已上架'))
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('work.title')" :page-description="t('work.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="作品标题">
          <UInput v-model="draft.title" placeholder="请输入作品标题" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="状态">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('work.langLabel')">
          <USelect v-model="draft.lang" :items="langItems" value-key="value" class="w-full" />
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
      <UEmpty
        v-else-if="pageRows.length === 0"
        icon="i-lucide-clapperboard"
        :title="t('work.empty')"
        :description="t('work.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[68rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-32 px-4 py-3">封面</th>
                <th class="px-4 py-3">作品标题</th>
                <th class="w-40 px-4 py-3">作者名称</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('work.langLabel') }}</th>
                <th class="whitespace-nowrap px-4 py-3">时长</th>
                <th class="whitespace-nowrap px-4 py-3">播放量</th>
                <th class="whitespace-nowrap px-4 py-3">点赞数</th>
                <th class="whitespace-nowrap px-4 py-3">状态</th>
                <th class="whitespace-nowrap px-4 py-3">创建时间</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="work in pageRows" :key="work.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="px-4 py-3">
                  <img
                    :src="work.cover || DEFAULT_WORK_COVER"
                    alt=""
                    class="h-12 w-20 rounded object-cover"
                  >
                </td>
                <td class="px-4 py-3">
                  <div class="truncate font-medium">{{ work.title }}</div>
                  <div class="mt-1 truncate font-mono text-xs text-zinc-400">{{ work.uuid }}</div>
                </td>
                <td class="truncate px-4 py-3">{{ work.authorName }}</td>
                <td class="whitespace-nowrap px-4 py-3">{{ langOf(work) }}</td>
                <td class="px-4 py-3 tabular-nums">{{ work.duration }}</td>
                <td class="px-4 py-3 tabular-nums">{{ work.playCount.toLocaleString() }}</td>
                <td class="px-4 py-3 tabular-nums">{{ work.likeCount.toLocaleString() }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="work.status === 1 ? 'success' : 'neutral'" variant="subtle">
                    {{ work.status === 1 ? '已上架' : '已下架' }}
                  </UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-zinc-500">{{ work.createdAt }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <div class="flex flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(work)">编辑</UButton>
                    <UButton
                      type="button"
                      size="sm"
                      variant="soft"
                      :color="work.status === 1 ? 'warning' : 'success'"
                      @click="requestConfirm(work, 'status')"
                    >
                      {{ work.status === 1 ? '下架' : '上架' }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(work, 'delete')">
                      删除
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
        />
      </template>
    </div>

    <UModal
      v-model:open="formOpen"
      title="编辑作品"
      description="作者由发布账号决定，后台只能改标题、简介、分类和封面。"
      :ui="{ content: 'w-[min(96vw,36rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UFormField label="作品标题" required :error="errors.title || undefined">
          <UInput v-model="form.title" maxlength="40" placeholder="请输入作品标题" class="w-full" />
        </UFormField>
        <UFormField label="作者名称">
          <UInput :model-value="editing?.authorName ?? ''" disabled class="w-full" />
        </UFormField>
        <UFormField label="分类">
          <USelect v-model="form.category" :items="formCategoryItems" value-key="value" placeholder="请选择分类" class="w-full" />
        </UFormField>
        <UFormField label="简介" hint="选填">
          <UTextarea v-model="form.description" :rows="3" maxlength="1000" placeholder="请输入作品简介" class="w-full" />
        </UFormField>
        <UFormField label="封面">
          <div v-if="coverPreviewUrl" class="relative">
            <img :src="coverPreviewUrl" alt="" class="aspect-video w-full rounded-lg object-cover">
            <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearCover">
              清除
            </UButton>
          </div>
          <UFileUpload
            v-else
            :model-value="coverFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            :label="uploading ? '上传中…' : '点击或拖拽上传封面'"
            description="选填，建议 1280×720，jpg / png / webp / gif，不超过 8MB；留空时前台使用视频首帧"
            class="w-full min-h-40"
            :disabled="uploading"
            @update:model-value="onCoverFile"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="submit">{{ saving ? '保存中…' : '保存' }}</UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? '确认删除作品' : `确认${confirmItem?.status === 1 ? '下架' : '上架'}作品`"
      :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          <template v-if="confirmAction === 'delete'">
            删除作品“{{ confirmItem?.title }}”后无法恢复，确定继续吗？
          </template>
          <template v-else>
            确定要{{ confirmItem?.status === 1 ? '下架' : '上架' }}作品“{{ confirmItem?.title }}”吗？
          </template>
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">
          取消
        </UButton>
        <UButton
          type="button"
          :color="confirmAction === 'delete' ? 'error' : 'primary'"
          :loading="confirming"
          :disabled="confirming"
          @click="confirm"
        >
          {{ confirming ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
