<script setup lang="ts">
import type { AdminBanner } from '~/types/easytv-admin'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'
import { adminBannerApi } from '~/api/content'
import { formatUnix, isOk, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('banner.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminBanner[]>([])
const draft = reactive({ title: '', status: '__all__' })
const applied = ref({ ...draft })
const formOpen = ref(false)
const editing = ref<AdminBanner | null>(null)
const form = reactive({ title: '', subtitle: '', tag: '', cover: '', videoUrl: '', linkUrl: '', cta: '', sortOrder: 0 })
const errors = reactive({ title: '', linkUrl: '' })
const saving = ref(false)
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminBanner | null>(null)
const confirming = ref(false)

const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架', value: '1' },
  { label: '已下架', value: '2' },
]

const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
/** 接口原始字段，编辑回填用 */
const raws = new Map<number, any>()

function toRow(item: any): AdminBanner {
  raws.set(item.id, item)
  return {
    id: item.id,
    title: item.title,
    cover: resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER,
    linkUrl: item.link_url || '',
    sortOrder: Number(item.sort_order) || 0,
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.created_at),
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminBannerApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.title || undefined,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? 'Banner 加载失败', 'error')
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

onMounted(() => void fetchList())
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { title: draft.title.trim(), status: draft.status }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, { title: '', status: '__all__' })
  search()
}
function openCreate() {
  editing.value = null
  Object.assign(form, { title: '', subtitle: '', tag: '', cover: '', videoUrl: '', linkUrl: '', cta: '立即观看', sortOrder: rows.value.length })
  Object.assign(errors, { title: '', linkUrl: '' })
  formOpen.value = true
}
function openEdit(item: AdminBanner) {
  editing.value = item
  const raw = raws.get(item.id) ?? {}
  Object.assign(form, {
    title: item.title,
    subtitle: raw.subtitle ?? '',
    tag: raw.tag ?? '',
    cover: raw.cover_url ?? '',
    videoUrl: raw.video_url ?? '',
    linkUrl: item.linkUrl,
    cta: raw.cta ?? '',
    sortOrder: item.sortOrder,
  })
  Object.assign(errors, { title: '', linkUrl: '' })
  formOpen.value = true
}
function validate() {
  errors.title = form.title.trim() ? '' : '请输入 Banner 标题'
  const link = form.linkUrl.trim()
  errors.linkUrl = !link || /^https?:\/\/.+/i.test(link) || link.startsWith('/') ? '' : '请输入 http(s) 链接或以 / 开头的站内路径'
  return !errors.title && !errors.linkUrl
}
async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      tag: form.tag.trim(),
      cover_url: form.cover.trim(),
      video_url: form.videoUrl.trim(),
      link_url: form.linkUrl.trim(),
      cta: form.cta.trim(),
      sort_order: Number(form.sortOrder) || 0,
    }
    const raw = editing.value
      ? await adminBannerApi.update(editing.value.id, payload)
      : await adminBannerApi.create({ ...payload, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editing.value ? 'Banner 更新成功' : 'Banner 创建成功')
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminBanner, action: 'status' | 'delete') {
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
      ? await adminBannerApi.remove(item.id)
      : await adminBannerApi.update(item.id, { status: item.status === 1 ? 2 : 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? 'Banner 已删除' : (item.status === 1 ? 'Banner 已下架' : 'Banner 已上架'))
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
    <ManagePageHeader :page-title="t('banner.title')" :page-description="t('banner.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('banner.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Banner 标题">
          <UInput v-model="draft.title" placeholder="请输入 Banner 标题" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-images" :title="t('banner.empty')" :description="t('banner.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">Banner 标题</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">跳转链接</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-14 w-36 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="item.cover || DEFAULT_WORK_COVER" alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="min-w-0 truncate font-medium" :title="item.title">{{ item.title }}</div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <a
                    v-if="item.linkUrl"
                    :href="item.linkUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block max-w-xs truncate font-mono text-xs text-zinc-400 hover:underline"
                    :title="item.linkUrl"
                  >
                    {{ item.linkUrl }}
                  </a>
                  <span v-else class="text-xs text-zinc-400">—</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '已上架' : '已下架' }}</UBadge>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? '下架' : '上架' }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">删除</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? '编辑 Banner' : '新建 Banner'" :ui="{ content: 'w-[min(96vw,34rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="Banner 标题" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="40" placeholder="例如：Skill 商店活动" class="w-full" />
          </UFormField>
          <UFormField label="跳转链接" hint="选填，填写后将在新窗口打开" :error="errors.linkUrl || undefined">
            <UInput v-model="form.linkUrl" placeholder="https://www.easytv.ai/studio" class="w-full" />
          </UFormField>
          <UFormField label="副标题" hint="显示在标题下方，例如「Pixel · 154 喜欢」">
            <UInput v-model="form.subtitle" maxlength="80" placeholder="例如：Pixel · 154 喜欢" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="标签">
              <UInput v-model="form.tag" maxlength="20" placeholder="例如：动画游戏" class="w-full" />
            </UFormField>
            <UFormField label="按钮文案">
              <UInput v-model="form.cta" maxlength="20" placeholder="立即观看" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="封面地址" hint="可填创作台静态路径（/images/...）或 /upload/ 资产地址">
            <UInput v-model="form.cover" placeholder="/images/showcase/mountain.jpg" class="w-full" />
          </UFormField>
          <UFormField label="背景视频地址" hint="选填，悬停自动播放">
            <UInput v-model="form.videoUrl" placeholder="/videos/showcase/scenic.mp4" class="w-full" />
          </UFormField>
          <UFormField label="排序" hint="数字越大越靠前">
            <UInput v-model="form.sortOrder" type="number" class="w-full" />
          </UFormField>
          <UFormField label="预览">
            <img :src="resolveMediaUrl(form.cover) || DEFAULT_WORK_COVER" alt="" class="h-20 w-48 rounded object-cover">
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '保存' }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? '确认删除 Banner' : `确认${confirmItem?.status === 1 ? '下架' : '上架'} Banner`"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      确定要{{ confirmAction === 'delete' ? '删除' : (confirmItem?.status === 1 ? '下架' : '上架') }}“{{ confirmItem?.title }}”吗？
    </ManageConfirmModal>
  </div>
</template>
