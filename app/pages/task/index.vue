<script setup lang="ts">
import { adminTaskApi, formatUnix, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('task.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const route = useRoute()
const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<any[]>([])
const DRAFT_DEFAULT = { userId: '', type: '__all__', status: '__all__' }
const draft = reactive({ ...DRAFT_DEFAULT })
const applied = ref({ ...draft })
const detailOpen = ref(false)
const detailItem = ref<any | null>(null)

const pageRows = computed(() => rows.value)
const TYPE_LABEL = computed<Record<string, string>>(() => ({
  text: t('common.text'),
  image: t('common.image'),
  video: t('common.video'),
  audio: t('common.audio'),
}))
const STATUS_LABEL = computed<Record<string, string>>(() => ({
  pending: t('common.queued'),
  running: t('common.running'),
  succeeded: t('common.succeeded'),
  failed: t('common.failed'),
  cancelled: t('common.cancelled'),
}))
const typeItems = computed(() => [
  { label: t('common.allTypes'), value: '__all__' },
  { label: t('common.text'), value: 'text' },
  { label: t('common.image'), value: 'image' },
  { label: t('common.video'), value: 'video' },
  { label: t('common.audio'), value: 'audio' },
])
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.queued'), value: 'pending' },
  { label: t('common.running'), value: 'running' },
  { label: t('common.succeeded'), value: 'succeeded' },
  { label: t('common.failed'), value: 'failed' },
  { label: t('common.cancelled'), value: 'cancelled' },
])

function typeLabel(type: string) {
  return TYPE_LABEL.value[type] || type || '—'
}
function statusLabel(status: string) {
  return STATUS_LABEL.value[status] || status || '—'
}
function statusColor(status: string) {
  if (status === 'succeeded')
    return 'success'
  if (status === 'running')
    return 'info'
  if (status === 'pending')
    return 'warning'
  if (status === 'failed')
    return 'error'
  return 'neutral'
}
function pointsText(item: any) {
  if (item.status === 'succeeded')
    return `${item.costPoints} ${t('common.points')}`
  if (item.status === 'pending' || item.status === 'running')
    return `${t('common.occupy')} ${item.pointsFrozen} ${t('common.points')}`
  return t('task.pointsBack')
}
function toRow(item: any) {
  return {
    id: item.id,
    taskNo: item.task_no || '',
    userId: item.user_id,
    userName: item.owner_name || `#${item.user_id}`,
    type: item.type || '',
    status: item.status || '',
    progress: Number(item.progress) || 0,
    model: item.model || '',
    prompt: item.prompt || '',
    errorMsg: item.error_msg || '',
    resultUrl: item.result_url || '',
    resultText: item.result_text || '',
    canvasId: Number(item.canvas_id) || 0,
    projectId: Number(item.project_id) || 0,
    pointsFrozen: Number(item.points_frozen) || 0,
    costPoints: Number(item.cost_points) || 0,
    createdAt: formatUnix(item.created_at),
    startedAt: item.started_at ? formatUnix(item.started_at) : '',
    finishedAt: item.finished_at ? formatUnix(item.finished_at) : '',
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminTaskApi.list({
      page: page.value,
      page_size: pageSize.value,
      user_id: applied.value.userId ? Number(applied.value.userId) : undefined,
      type: applied.value.type === '__all__' ? undefined : applied.value.type,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('task.loadFail'), 'error')
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
  const userId = String(route.query.userId || '')
  const status = String(route.query.status || '')
  const type = String(route.query.type || '')
  if (userId)
    draft.userId = userId
  if (STATUS_LABEL.value[status])
    draft.status = status
  if (TYPE_LABEL.value[type])
    draft.type = type
  if (userId || STATUS_LABEL.value[status] || TYPE_LABEL.value[type])
    applied.value = { ...draft }
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { ...draft, userId: draft.userId.trim() }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, DRAFT_DEFAULT)
  search()
}
function openDetail(item: any) {
  detailItem.value = item
  detailOpen.value = true
}
function gotoUser(userId: number) {
  return navigateTo(localePath({ path: '/user', query: { keyword: String(userId) } }))
}
function gotoCanvas(canvasId: number) {
  return navigateTo(localePath({ path: '/canvas', query: { keyword: String(canvasId) } }))
}
function gotoResult(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
async function copyPrompt(text: string) {
  if (!text)
    return
  try {
    await navigator.clipboard.writeText(text)
    notify(t('task.copied'))
  }
  catch {
    notify(t('common.copyFail'), 'error')
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('task.title')" :page-description="t('task.description')" />

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.user')">
          <UInput v-model="draft.userId" :placeholder="t('task.userPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-list-checks" :title="t('task.empty')" :description="t('task.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.code') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.user') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.model') }}</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.prompt') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.points') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.taskNo || item.id }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UButton type="button" size="sm" variant="link" class="-ml-2" @click="() => { void gotoUser(item.userId) }">
                    {{ item.userName }}
                  </UButton>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ typeLabel(item.type) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(item.status)" variant="subtle">
                    {{ statusLabel(item.status) }}{{ item.status === 'running' && item.progress ? ` ${item.progress}%` : '' }}
                  </UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3" :title="item.model">{{ item.model || '—' }}</td>
                <td class="max-w-0 w-full px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  <div class="truncate" :title="item.prompt">{{ item.prompt || '—' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ pointsText(item) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openDetail(item)">{{ t('common.detail') }}</UButton>
                    <UButton v-if="item.resultUrl" type="button" size="sm" variant="soft" @click="gotoResult(item.resultUrl)">{{ t('common.viewResult') }}</UButton>
                    <UButton v-if="item.prompt" type="button" size="sm" variant="soft" @click="() => { void copyPrompt(item.prompt) }">{{ t('common.copyPrompt') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="detailOpen" :title="t('common.detail')" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div v-if="detailItem" class="grid gap-3 text-sm">
          <p><span class="text-zinc-500">{{ t('common.code') }}</span>　{{ detailItem.taskNo || detailItem.id }}</p>
          <p><span class="text-zinc-500">{{ t('common.user') }}</span>　{{ detailItem.userName }}</p>
          <p><span class="text-zinc-500">{{ t('common.type') }}</span>　{{ typeLabel(detailItem.type) }}</p>
          <p><span class="text-zinc-500">{{ t('common.status') }}</span>　{{ statusLabel(detailItem.status) }}{{ detailItem.status === 'running' && detailItem.progress ? ` ${detailItem.progress}%` : '' }}</p>
          <p><span class="text-zinc-500">{{ t('common.model') }}</span>　{{ detailItem.model || '—' }}</p>
          <p><span class="text-zinc-500">{{ t('common.points') }}</span>　{{ pointsText(detailItem) }}</p>
          <p><span class="text-zinc-500">{{ t('common.createTime') }}</span>　{{ detailItem.createdAt }}</p>
          <p v-if="detailItem.startedAt"><span class="text-zinc-500">{{ t('task.startedAt') }}</span>　{{ detailItem.startedAt }}</p>
          <p v-if="detailItem.finishedAt"><span class="text-zinc-500">{{ t('task.endedAt') }}</span>　{{ detailItem.finishedAt }}</p>
          <p v-if="detailItem.canvasId"><span class="text-zinc-500">{{ t('common.kindCanvas') }}</span>　
            <UButton type="button" size="sm" variant="link" class="-ml-2" @click="() => { void gotoCanvas(detailItem.canvasId) }">#{{ detailItem.canvasId }}</UButton>
          </p>
          <div>
            <p class="mb-1 text-zinc-500">{{ t('common.prompt') }}</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">{{ detailItem.prompt || '—' }}</p>
          </div>
          <div v-if="detailItem.errorMsg">
            <p class="mb-1 text-zinc-500">{{ t('common.failReason') }}</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-rose-50 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{{ detailItem.errorMsg }}</p>
          </div>
          <div v-if="detailItem.resultText">
            <p class="mb-1 text-zinc-500">{{ t('task.textResult') }}</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">{{ detailItem.resultText }}</p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" @click="() => { detailOpen = false }">{{ t('common.close') }}</UButton>
        <UButton v-if="detailItem?.resultUrl" type="button" @click="gotoResult(detailItem.resultUrl)">{{ t('common.viewResult') }}</UButton>
      </template>
    </UModal>
  </div>
</template>
