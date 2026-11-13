<script setup lang="ts">
import type { AdminOrder } from '~/types/easytv-admin'
import {
  ORDER_STATUS_COLOR,
  orderKindItems,
  orderKindLabel,
  orderStatusItems,
  orderStatusLabel,
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
const kindItems = computed(() => orderKindItems(t))
const statusSelectItems = computed(() => orderStatusItems(t))

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
      notify(raw?.message ?? t('order.loadFail'), 'error')
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
      ? await adminOrderApi.refund(confirmItem.value.id, t('order.refund'))
      : await adminOrderApi.close(confirmItem.value.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'refund' ? t('order.refunded') : t('order.closed'))
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

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('order.keywordLabel')">
          <UInput icon="i-lucide-search" v-model="draft.keyword" :placeholder="t('order.keywordPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.userId')">
          <UInput v-model="draft.userId" :placeholder="t('order.userPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('order.kind')">
          <USelect v-model="draft.kind" :items="kindItems" value-key="value" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('order.status')">
          <USelect v-model="draft.status" :items="statusSelectItems" value-key="value" class="w-full" />
        </ManageFilterField>
    </ManageFilterBar>

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
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('order.colNo') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.user') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('order.colPack') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('order.colPay') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('order.colOrigin') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('order.colCreated') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="truncate font-mono text-xs" :title="item.no">{{ item.no }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ orderKindLabel(item.kind, t) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.userName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.title }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-medium">¥{{ item.price }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">¥{{ item.origin }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="ORDER_STATUS_COLOR[item.status]" variant="subtle">{{ orderStatusLabel(item.status, t) }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="() => { void openDetail(item) }">{{ t('common.detail') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="() => { void gotoWallet(item.userId) }">{{ t('user.menuWallet') }}</UButton>
                    <UButton
                      v-if="item.status === 'paid'"
                      type="button"
                      size="sm"
                      variant="soft"
                      color="error"
                      @click="requestConfirm(item, 'refund')"
                    >
                      {{ t('order.refundBtn') }}
                    </UButton>
                    <UButton
                      v-else-if="item.status === 'pending'"
                      type="button"
                      size="sm"
                      variant="soft"
                      color="warning"
                      @click="requestConfirm(item, 'close')"
                    >
                      {{ t('order.closeBtn') }}
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

    <UModal v-model:open="detailOpen" :title="t('common.detail')" :ui="{ content: 'w-[min(96vw,32rem)]' }">
      <template #body>
        <dl v-if="detailItem" class="grid gap-3 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('order.colNo') }}</dt><dd class="font-mono">{{ detailItem.no }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('common.type') }}</dt><dd>{{ orderKindLabel(detailItem.kind, t) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('common.user') }}</dt><dd>{{ detailItem.userName }}（{{ detailItem.userId }}）</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('order.colPack') }}</dt><dd class="text-right">{{ detailItem.title }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('order.colPay') }}</dt><dd>¥{{ detailItem.price }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('order.colOrigin') }}</dt><dd>¥{{ detailItem.origin }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('common.status') }}</dt><dd>{{ orderStatusLabel(detailItem.status, t) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('order.colCreated') }}</dt><dd>{{ detailItem.createdAt }}</dd></div>
        </dl>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'refund' ? t('order.confirmRefund') : t('order.confirmClose')"
      :tone="confirmAction === 'refund' ? 'error' : 'warning'"
      :icon="confirmAction === 'refund' ? 'i-lucide-undo-2' : 'i-lucide-circle-x'"
      :loading="confirming"
      @confirm="confirmChange"
    >
      {{ confirmAction === 'refund' ? t('order.confirmRefundBody', { no: confirmItem?.no }) : t('order.confirmCloseBody', { no: confirmItem?.no }) }}
    </ManageConfirmModal>
  </div>
</template>
