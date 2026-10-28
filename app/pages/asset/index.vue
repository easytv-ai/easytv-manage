<script setup lang="ts">
import { adminAssetApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import type { AdminAssetItem } from '~/types/easytv-admin'
import { downloadBlob } from '~/utils/datetime-input'
import { resolveMediaUrl } from '~/utils/media'

const { t } = useI18n()
useHead({ title: () => t('asset.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminAssetItem[]>([])
const draft = reactive({ title: '', type: '__all__', status: '__all__' })
const applied = ref({ ...draft })
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminAssetItem | null>(null)
const confirming = ref(false)
const previewOpen = ref(false)
const previewItem = ref<AdminAssetItem | null>(null)
const previewMediaRef = ref<HTMLVideoElement | HTMLAudioElement | null>(null)
const downloadingId = ref<number | null>(null)

/** 与旧模板兼容：filtered/pageRows 直接指向服务端当前页 */
const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
const DRAFT_DEFAULT = { title: '', type: '__all__', status: '__all__' }
const API = adminAssetApi
const typeLabels: Record<string, string> = { video: '视频', image: '图片', audio: '音频', text: '文本', other: '文件' }
const typeItems = [
  { label: '全部类型', value: '__all__' },
  { label: '视频', value: 'video' },
  { label: '图片', value: 'image' },
  { label: '音频', value: 'audio' },
]
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '正常', value: '1' },
  { label: '回收站', value: '2' },
]
function toRow(item: any): AdminAssetItem {
  return {
    id: item.id,
    title: item.name,
    ownerName: item.owner_name || `#${item.user_id}`,
    userId: Number(item.user_id) || 0,
    type: item.type,
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.created_at),
    url: resolveMediaUrl(item.url),
    mime: item.mime || '',
  }
}
function objectKey(url: string) {
  const value = String(url || '').trim()
  if (!value)
    return ''
  try {
    return new URL(value).pathname.replace(/^\//, '') || value
  }
  catch {
    return value.replace(/^https?:\/\/[^/]+\//, '')
  }
}
function LIST_FN() {
  return API.list({
    page: page.value,
    page_size: pageSize.value,
    keyword: applied.value.title || undefined,
    type: applied.value.type === '__all__' ? undefined : applied.value.type,
    status: applied.value.status === '__all__' ? undefined : applied.value.status,
  })
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

onMounted(() => void fetchList())
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
function requestConfirm(item: AdminAssetItem, action: 'status' | 'delete') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}
function requestStatus(item: AdminAssetItem) {
  requestConfirm(item, 'status')
}
function requestDelete(item: AdminAssetItem) {
  requestConfirm(item, 'delete')
}
function openPreview(item: AdminAssetItem) {
  if (!item.url) {
    notify('暂无文件地址，无法预览', 'error')
    return
  }
  previewItem.value = item
  previewOpen.value = true
}
watch(previewOpen, (open) => {
  if (open)
    return
  previewMediaRef.value?.pause()
})
async function downloadAsset(item: AdminAssetItem | null) {
  if (!item?.url) {
    notify('暂无文件地址，无法下载', 'error')
    return
  }
  if (downloadingId.value === item.id)
    return
  downloadingId.value = item.id
  try {
    const res = await fetch(item.url)
    if (!res.ok)
      throw new Error('download failed')
    downloadBlob(await res.blob(), item.title || 'asset')
    notify('已开始下载')
  }
  catch {
    const a = document.createElement('a')
    a.href = item.url
    a.download = item.title || 'asset'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  finally {
    downloadingId.value = null
  }
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
    notify(confirmAction.value === 'delete' ? '资产已删除' : (item.status === 1 ? '资产已回收' : '资产已恢复'))
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
    <ManagePageHeader :page-title="t('asset.title')" :page-description="t('asset.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField label="资产名称">
          <UInput v-model="draft.title" placeholder="请输入资产名称" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="类型">
          <USelect v-model="draft.type" :items="typeItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-image" :title="t('asset.empty')" :description="t('asset.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">资产名称</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">用户</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">类型</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">创建时间</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 text-left shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left">
                  <div class="truncate font-medium" :title="item.title">{{ item.title }}</div>
                  <div class="truncate font-mono text-xs text-zinc-400" :title="item.url || String(item.id)">{{ objectKey(item.url) || `#${item.id}` }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <div>{{ item.ownerName }}</div>
                  <div class="font-mono text-xs text-zinc-400">#{{ item.userId || '-' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ typeLabels[item.type] || item.type }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '正常' : '回收站' }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 text-left shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :disabled="!item.url" @click="openPreview(item)">预览</UButton>
                    <UButton type="button" size="sm" variant="soft" :loading="downloadingId === item.id" :disabled="!item.url || downloadingId === item.id" @click="downloadAsset(item)">
                      {{ downloadingId === item.id ? '下载中…' : '下载' }}
                    </UButton>
                    <UButton v-if="item.status === 1" type="button" size="sm" variant="soft" color="warning" @click="requestStatus(item)">回收</UButton>
                    <UButton v-else type="button" size="sm" variant="soft" color="success" @click="requestStatus(item)">恢复</UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">删除</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="previewOpen" :title="previewItem?.title || '预览'" :ui="{ content: 'w-[min(96vw,52rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div v-if="previewItem?.url" class="overflow-hidden">
          <video
            v-if="previewItem.type === 'video'"
            :key="previewItem.id"
            ref="previewMediaRef"
            :src="previewItem.url"
            controls
            playsinline
            class="max-h-[70vh] w-full rounded-lg bg-black"
          />
          <img
            v-else-if="previewItem.type === 'image'"
            :src="previewItem.url"
            :alt="previewItem.title"
            class="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg"
          >
          <audio
            v-else-if="previewItem.type === 'audio'"
            :key="previewItem.id"
            ref="previewMediaRef"
            :src="previewItem.url"
            controls
            class="w-full"
          />
          <p v-else class="text-sm text-zinc-500">该类型暂不支持在线预览，请下载后查看。</p>
        </div>
      </template>
      <template #footer>
        <UButton
          type="button"
          color="neutral"
          variant="outline"
          :loading="previewItem ? downloadingId === previewItem.id : false"
          :disabled="!previewItem?.url || (previewItem ? downloadingId === previewItem.id : true)"
          @click="() => { void downloadAsset(previewItem) }"
        >
          <UIcon name="i-lucide-download" class="size-4" />
          {{ previewItem && downloadingId === previewItem.id ? '下载中…' : '下载原文件' }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="confirmAction === 'delete' ? '确认删除资产' : `确认${confirmItem?.status === 1 ? '回收' : '恢复'}资产`" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">确定要{{ confirmAction === 'delete' ? '删除' : (confirmItem?.status === 1 ? '回收' : '恢复') }}“{{ confirmItem?.title }}”吗？</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton type="button" :color="confirmAction === 'delete' ? 'error' : 'primary'" :loading="confirming" :disabled="confirming" @click="confirm">
          {{ confirming ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
