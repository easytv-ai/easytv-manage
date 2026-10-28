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
const TYPE_LABEL: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}
const typeItems = [
  { label: '全部类型', value: '__all__' },
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
]
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '排队中', value: 'pending' },
  { label: '进行中', value: 'running' },
  { label: '已完成', value: 'succeeded' },
  { label: '失败', value: 'failed' },
  { label: '已取消', value: 'cancelled' },
]

function typeLabel(type: string) {
  return TYPE_LABEL[type] || type || '—'
}
function statusLabel(status: string) {
  return STATUS_LABEL[status] || status || '—'
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
    return `${item.costPoints} 积分`
  if (item.status === 'pending' || item.status === 'running')
    return `占用 ${item.pointsFrozen} 积分`
  return '积分已退回'
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
      notify(raw?.message ?? '任务加载失败', 'error')
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
  if (STATUS_LABEL[status])
    draft.status = status
  if (TYPE_LABEL[type])
    draft.type = type
  if (userId || STATUS_LABEL[status] || TYPE_LABEL[type])
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
    notify('提示词已复制')
  }
  catch {
    notify('复制失败', 'error')
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('task.title')" :page-description="t('task.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="用户">
          <UInput v-model="draft.userId" placeholder="请输入用户 ID" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-list-checks" :title="t('task.empty')" :description="t('task.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">单号</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">用户</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">类型</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">模型</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">提示词</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">积分</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">创建时间</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
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
                  <div class="truncate" :title="item.prompt">{{ item.prompt || '（无提示词）' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ pointsText(item) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openDetail(item)">查看详情</UButton>
                    <UButton v-if="item.resultUrl" type="button" size="sm" variant="soft" @click="gotoResult(item.resultUrl)">查看结果</UButton>
                    <UButton v-if="item.prompt" type="button" size="sm" variant="soft" @click="() => { void copyPrompt(item.prompt) }">复制提示词</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="detailOpen" title="任务详情" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div v-if="detailItem" class="grid gap-3 text-sm">
          <p><span class="text-zinc-500">单号</span>　{{ detailItem.taskNo || detailItem.id }}</p>
          <p><span class="text-zinc-500">用户</span>　{{ detailItem.userName }}</p>
          <p><span class="text-zinc-500">类型</span>　{{ typeLabel(detailItem.type) }}</p>
          <p><span class="text-zinc-500">状态</span>　{{ statusLabel(detailItem.status) }}{{ detailItem.status === 'running' && detailItem.progress ? ` ${detailItem.progress}%` : '' }}</p>
          <p><span class="text-zinc-500">模型</span>　{{ detailItem.model || '—' }}</p>
          <p><span class="text-zinc-500">积分</span>　{{ pointsText(detailItem) }}</p>
          <p><span class="text-zinc-500">创建时间</span>　{{ detailItem.createdAt }}</p>
          <p v-if="detailItem.startedAt"><span class="text-zinc-500">开始时间</span>　{{ detailItem.startedAt }}</p>
          <p v-if="detailItem.finishedAt"><span class="text-zinc-500">结束时间</span>　{{ detailItem.finishedAt }}</p>
          <p v-if="detailItem.canvasId"><span class="text-zinc-500">画布</span>　
            <UButton type="button" size="sm" variant="link" class="-ml-2" @click="() => { void gotoCanvas(detailItem.canvasId) }">#{{ detailItem.canvasId }}</UButton>
          </p>
          <div>
            <p class="mb-1 text-zinc-500">提示词</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">{{ detailItem.prompt || '（无提示词）' }}</p>
          </div>
          <div v-if="detailItem.errorMsg">
            <p class="mb-1 text-zinc-500">失败原因</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-rose-50 p-3 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{{ detailItem.errorMsg }}</p>
          </div>
          <div v-if="detailItem.resultText">
            <p class="mb-1 text-zinc-500">文本结果</p>
            <p class="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">{{ detailItem.resultText }}</p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" @click="() => { detailOpen = false }">关闭</UButton>
        <UButton v-if="detailItem?.resultUrl" type="button" @click="gotoResult(detailItem.resultUrl)">查看结果</UButton>
      </template>
    </UModal>
  </div>
</template>
