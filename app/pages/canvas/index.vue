<script setup lang="ts">
import { adminCanvasApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import type { AdminCanvas } from '~/types/easytv-admin'

const { t } = useI18n()
useHead({ title: () => t('canvas.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminCanvas[]>([])
const draft = reactive({ title: '', status: '__all__' })
const applied = ref({ ...draft })
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminCanvas | null>(null)
const confirming = ref(false)

/** 与旧模板兼容：filtered/pageRows 直接指向服务端当前页 */
const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
const DRAFT_DEFAULT = { title: '', status: '__all__' }
const API = adminCanvasApi
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '正常', value: '1' },
  { label: '回收站', value: '2' },
]
function toRow(item: any): AdminCanvas {
  return {
    id: item.id,
    title: item.name,
    ownerName: item.owner_name || `#${item.user_id}`,
    nodeCount: Number(item.node_count) || 0,
    publicVisible: false,
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.created_at),
  }
}
function LIST_FN() {
  return API.list({
    page: page.value,
    page_size: pageSize.value,
    keyword: applied.value.title || undefined,
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
function requestConfirm(item: AdminCanvas, action: 'status' | 'delete') {
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
    notify(confirmAction.value === 'delete' ? '画布已删除' : (item.status === 1 ? '画布已移入回收站' : '画布已恢复'))
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
    <ManagePageHeader :page-title="t('canvas.title')" :page-description="t('canvas.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="画布名称">
          <UInput v-model="draft.title" placeholder="请输入画布名称" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-workflow" :title="t('canvas.empty')" :description="t('canvas.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">画布名称</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">创建人</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">节点数</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">公开</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">创建时间</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                  <div class="truncate" :title="item.title">{{ item.title }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.ownerName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.nodeCount }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.publicVisible ? '是' : '否' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '正常' : '回收站' }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? '回收' : '恢复' }}
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

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? '确认删除画布' : `确认${confirmItem?.status === 1 ? '下架' : '上架'}画布`"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      确定要{{ confirmAction === 'delete' ? '删除' : (confirmItem?.status === 1 ? '下架' : '上架') }}“{{ confirmItem?.title }}”吗？
    </ManageConfirmModal>
  </div>
</template>
