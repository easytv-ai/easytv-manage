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
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.normal'), value: '1' },
  { label: t('common.trash'), value: '2' },
])
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
      notify(raw?.message ?? t('canvas.loadFail'), 'error')
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
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? t('canvas.deleted') : (item.status === 1 ? t('canvas.trashed') : t('canvas.restored')))
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

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('canvas.colName')">
          <UInput icon="i-lucide-search" v-model="draft.title" :placeholder="t('canvas.namePh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-workflow" :title="t('canvas.empty')" :description="t('canvas.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('canvas.colName') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.owner') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.nodes') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.public') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                  <div class="truncate" :title="item.title">{{ item.title }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.ownerName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.nodeCount }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.publicVisible ? t('common.yes') : t('common.no') }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('common.normal') : t('common.trash') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? t('common.moveToTrash') : t('common.restore') }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
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
      :title="confirmAction === 'delete' ? t('canvas.confirmDelete') : (confirmItem?.status === 1 ? t('canvas.confirmTrash') : t('canvas.confirmRestore'))"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      {{ t('common.confirmNamed', { action: confirmAction === 'delete' ? t('common.delete') : (confirmItem?.status === 1 ? t('common.moveToTrash') : t('common.restore')), name: confirmItem?.title }) }}
    </ManageConfirmModal>
  </div>
</template>
