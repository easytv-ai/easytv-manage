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
const typeLabels = computed<Record<string, string>>(() => ({
  video: t('common.video'),
  image: t('common.image'),
  audio: t('common.audio'),
  text: t('common.text'),
  other: t('common.file'),
}))
const typeItems = computed(() => [
  { label: t('common.allTypes'), value: '__all__' },
  { label: t('common.video'), value: 'video' },
  { label: t('common.image'), value: 'image' },
  { label: t('common.audio'), value: 'audio' },
])
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.normal'), value: '1' },
  { label: t('common.trash'), value: '2' },
])
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
      notify(raw?.message ?? t('asset.loadFail'), 'error')
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
    notify(t('common.noFilePreview'), 'error')
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
    notify(t('common.noFileDownload'), 'error')
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
    notify(t('common.downloadStarted'))
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
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? t('asset.deleted') : (item.status === 1 ? t('asset.trashed') : t('asset.restored')))
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

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.name')">
          <UInput icon="i-lucide-search" v-model="draft.title" :placeholder="t('asset.namePh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.type')">
          <USelect v-model="draft.type" :items="typeItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-image" :title="t('asset.empty')" :description="t('asset.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.name') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.user') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 text-left shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
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
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('common.normal') : t('common.trash') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 text-left shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :disabled="!item.url" @click="openPreview(item)">{{ t('common.preview') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" :loading="downloadingId === item.id" :disabled="!item.url || downloadingId === item.id" @click="downloadAsset(item)">
                      {{ downloadingId === item.id ? t('common.downloading') : t('common.download') }}
                    </UButton>
                    <UButton v-if="item.status === 1" type="button" size="sm" variant="soft" color="warning" @click="requestStatus(item)">{{ t('common.moveToTrash') }}</UButton>
                    <UButton v-else type="button" size="sm" variant="soft" color="success" @click="requestStatus(item)">{{ t('common.restore') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">{{ t('common.delete') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="previewOpen" :title="previewItem?.title || t('common.preview')" :ui="{ content: 'w-[min(96vw,52rem)]', footer: 'justify-end gap-2' }">
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
          <p v-else class="text-sm text-zinc-500">{{ t('common.noPreview') }}</p>
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
          {{ previewItem && downloadingId === previewItem.id ? t('common.downloading') : t('common.downloadOrigin') }}
        </UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('asset.confirmDelete') : (confirmItem?.status === 1 ? t('asset.confirmTrash') : t('asset.confirmRestore'))"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      {{ t('common.confirmNamed', { action: confirmAction === 'delete' ? t('common.delete') : (confirmItem?.status === 1 ? t('common.moveToTrash') : t('common.restore')), name: confirmItem?.title }) }}
    </ManageConfirmModal>
  </div>
</template>
