<script setup lang="ts">
import type { AdminOrder } from '~/types/easytv-admin'
import {
  ORDER_KIND_ITEMS,
  ORDER_KIND_LABEL,
  ORDER_STATUS_COLOR,
  ORDER_STATUS_ITEMS,
  ORDER_STATUS_LABEL,
} from '~/utils/pricing-admin'
import { adminOrderApi } from '~/api/billing'
import { formatUnix, isOk, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('order.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const route = useRoute()
const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminOrder[]>([])
const draft = reactive({
  keyword: '',
  kind: '__all__',
  status: '__all__',
  userId: '',
})
const applied = ref({ ...draft })
const detailOpen = ref(false)
const detailItem = ref<AdminOrder | null>(null)
const confirmOpen = ref(false)
const confirmAction = ref<'refund' | 'close'>('refund')
const confirmItem = ref<AdminOrder | null>(null)
const confirming = ref(false)

const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)

function toRow(item: any): AdminOrder {
  return {
    id: item.id,
    no: item.order_no,
    kind: item.kind,
    userId: item.user_id,
    userName: item.user_name || `#${item.user_id}`,
    title: item.title,
    price: Number(item.price) || 0,
    origin: Number(item.origin) || 0,
    status: item.status,
    createdAt: formatUnix(item.created_at),
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminOrderApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.keyword || undefined,
      kind: applied.value.kind === '__all__' ? undefined : applied.value.kind,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
      user_id: applied.value.userId ? Number(applied.value.userId) : undefined,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? '订单加载失败', 'error')
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
  const validStatus = ['pending', 'paid', 'closed', 'refunded']
  if (userId)
    draft.userId = userId
  if (validStatus.includes(status))
    draft.status = status
  if (userId || validStatus.includes(status))
    applied.value = { ...draft }
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { ...draft, keyword: draft.keyword.trim(), userId: draft.userId.trim() }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { keyword: '', kind: '__all__', status: '__all__', userId: '' })
  search()
}

function openDetail(item: AdminOrder) {
  detailItem.value = item
  detailOpen.value = true
}

function gotoWallet(userId: number) {
  return navigateTo(localePath({ path: '/wallet', query: { userId: String(userId) } }))
}

function requestConfirm(item: AdminOrder, action: 'refund' | 'close') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}

async function confirmChange() {
  if (!confirmItem.value)
    return
  confirming.value = true
  try {
    const raw = confirmAction.value === 'refund'
      ? await adminOrderApi.refund(confirmItem.value.id, '后台退款')
      : await adminOrderApi.close(confirmItem.value.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(confirmAction.value === 'refund' ? '订单已标记退款，未消耗积分已回收' : '订单已关闭')
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
    <ManagePageHeader :page-title="t('order.title')" :page-description="t('order.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField label="订单号 / 套餐">
          <UInput v-model="draft.keyword" placeholder="请输入订单号或套餐名称" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="用户 ID">
          <UInput v-model="draft.userId" placeholder="单个查询" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="订单类型">
          <USelect v-model="draft.kind" :items="ORDER_KIND_ITEMS" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="订单状态">
          <USelect v-model="draft.status" :items="ORDER_STATUS_ITEMS" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-receipt" :title="t('order.empty')" :description="t('order.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">订单号</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">类型</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">用户</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">套餐</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">实付</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">原价</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">下单时间</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="truncate font-mono text-xs" :title="item.no">{{ item.no }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ ORDER_KIND_LABEL[item.kind] }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.userName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.title }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-medium">¥{{ item.price }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">¥{{ item.origin }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="ORDER_STATUS_COLOR[item.status]" variant="subtle">{{ ORDER_STATUS_LABEL[item.status] }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="() => { void openDetail(item) }">详情</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="() => { void gotoWallet(item.userId) }">会员积分</UButton>
                    <UButton
                      v-if="item.status === 'paid'"
                      type="button"
                      size="sm"
                      variant="soft"
                      color="error"
                      @click="requestConfirm(item, 'refund')"
                    >
                      退款
                    </UButton>
                    <UButton
                      v-else-if="item.status === 'pending'"
                      type="button"
                      size="sm"
                      variant="soft"
                      color="warning"
                      @click="requestConfirm(item, 'close')"
                    >
                      关闭
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="detailOpen" title="订单详情" :ui="{ content: 'w-[min(96vw,32rem)]' }">
      <template #body>
        <dl v-if="detailItem" class="grid gap-3 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">订单号</dt><dd class="font-mono">{{ detailItem.no }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">类型</dt><dd>{{ ORDER_KIND_LABEL[detailItem.kind] }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">用户</dt><dd>{{ detailItem.userName }}（{{ detailItem.userId }}）</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">套餐</dt><dd class="text-right">{{ detailItem.title }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">实付</dt><dd>¥{{ detailItem.price }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">原价</dt><dd>¥{{ detailItem.origin }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">状态</dt><dd>{{ ORDER_STATUS_LABEL[detailItem.status] }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">下单时间</dt><dd>{{ detailItem.createdAt }}</dd></div>
        </dl>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'refund' ? '确认退款' : '确认关闭订单'"
      :tone="confirmAction === 'refund' ? 'error' : 'warning'"
      :icon="confirmAction === 'refund' ? 'i-lucide-undo-2' : 'i-lucide-circle-x'"
      :loading="confirming"
      @confirm="confirmChange"
    >
      确定要{{ confirmAction === 'refund' ? '退款' : '关闭' }}订单“{{ confirmItem?.no }}”吗？该操作不可撤销。
    </ManageConfirmModal>
  </div>
</template>
