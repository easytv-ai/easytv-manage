<script setup lang="ts">
import { adminRechargeApi } from '~/api/billing'
import { formatUnix, parsePaged } from '~/api/creative'
import { CONSOLE_DEFAULT_PAGE_SIZE, SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'

/**
 * 充值记录（只读）：GET /admin/recharge。与会员订单页分开，这里是支付渠道入账流水。
 */

const { t } = useI18n()
useHead({ title: () => t('recharge.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const STATUSES = ['pending', 'success', 'failed', 'expired', 'refunded'] as const

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<any[]>([])
const draft = reactive({ status: SELECT_ITEM_ALL })
const applied = ref({ status: SELECT_ITEM_ALL })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: SELECT_ITEM_ALL },
  ...STATUSES.map(s => ({ label: t(`recharge.status.${s}`), value: s })),
])

function statusText(s: string) {
  return (STATUSES as readonly string[]).includes(s) ? t(`recharge.status.${s}`) : (s || '—')
}

function statusColor(s: string) {
  if (s === 'success')
    return 'success'
  if (s === 'pending')
    return 'warning'
  if (s === 'failed' || s === 'refunded')
    return 'error'
  return 'neutral'
}

const money = (v: unknown) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quota = (v: unknown) => (Number(v) || 0).toLocaleString()

function methodText(method: string) {
  const known = ['wechat_native', 'alipay_f2f', 'alipay_pc', 'stripe', 'creem', 'waffo', 'waffo_pancake']
  return known.includes(method) ? t(`recharge.method.${method}`) : (method || '—')
}

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.status !== SELECT_ITEM_ALL)
    q.status = applied.value.status
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminRechargeApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<any>(raw)
    if (!paged) {
      notify(raw?.message ?? t('recharge.loadFail'), 'error')
      return
    }
    rows.value = paged.items
    total.value = paged.total
  }
  finally {
    if (mySeq === seq)
      markListReady()
    else
      loading.value = false
  }
})

onMounted(() => void fetchList())
watch(() => [page.value, pageSize.value, applied.value] as const, () => void fetchList(`q-${Date.now()}`), { deep: true })

function search() {
  applied.value = { status: draft.status }
  page.value = 1
}

function reset() {
  draft.status = SELECT_ITEM_ALL
  search()
}

const detailOpen = ref(false)
const detailItem = ref<any>(null)
const userOpen = ref(false)
const userId = ref<number | null>(null)

function openDetail(item: any) {
  detailItem.value = item
  detailOpen.value = true
}

function openUser(id: number) {
  if (!id)
    return
  userId.value = id
  userOpen.value = true
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('recharge.title')" :page-description="t('recharge.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.status')">
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-wallet" :title="t('recharge.empty')" :description="t('recharge.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[72rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="whitespace-nowrap px-4 py-3">{{ t('recharge.colNo') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('recharge.colUser') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('recharge.colMoney') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('recharge.colMethod') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('recharge.colInvoice') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.trade_no }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    class="inline-flex min-h-8 items-center rounded-md px-2 font-mono text-xs text-primary hover:bg-primary/10"
                    @click="openUser(item.user_id)"
                  >
                    #{{ item.user_id }}
                  </button>
                  <div v-if="item.team_id" class="px-2 text-xs text-zinc-400">{{ t('recharge.team') }} #{{ item.team_id }}</div>
                </td>
                <td class="px-4 py-3 text-right tabular-nums">{{ money(item.money) }}</td>
                <td class="whitespace-nowrap px-4 py-3">{{ methodText(item.payment_method) }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(item.status)" variant="subtle">{{ statusText(item.status) }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.invoiced ? 'success' : 'neutral'" variant="subtle">{{ item.invoiced ? t('recharge.invoiced') : t('recharge.notInvoiced') }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.create_time) }}</td>
                <td class="sticky right-0 z-10 whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900">
                  <UButton type="button" size="xs" variant="soft" @click="openDetail(item)">{{ t('recharge.view') }}</UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <USlideover
      v-model:open="detailOpen"
      :title="t('recharge.detailTitle')"
      :description="detailItem?.trade_no || undefined"
      :ui="{ content: 'w-[min(96vw,28rem)] max-w-none' }"
    >
      <template #body>
        <div v-if="detailItem" class="space-y-4 text-sm">
          <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-xs text-zinc-500">{{ t('recharge.colMoney') }}</div>
                <p class="mt-1 text-2xl font-semibold tabular-nums">{{ money(detailItem.money) }}</p>
              </div>
              <UBadge :color="statusColor(detailItem.status)" variant="subtle">{{ statusText(detailItem.status) }}</UBadge>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <UBadge :color="detailItem.invoiced ? 'success' : 'neutral'" variant="subtle">
                {{ detailItem.invoiced ? t('recharge.invoiced') : t('recharge.notInvoiced') }}
              </UBadge>
              <span class="text-xs text-zinc-500">
                {{ detailItem.team_id ? `${t('recharge.team')} #${detailItem.team_id}` : t('recharge.personal') }}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="text-xs text-zinc-500">{{ t('recharge.quota') }}</div>
              <p class="mt-1 font-semibold tabular-nums">{{ quota(detailItem.amount) }}</p>
            </div>
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="text-xs text-zinc-500">{{ t('recharge.invoiceable') }}</div>
              <p class="mt-1 font-semibold tabular-nums">{{ money(detailItem.invoiceable_amount) }}</p>
            </div>
            <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="text-xs text-zinc-500">{{ t('recharge.refunded') }}</div>
              <p class="mt-1 font-semibold tabular-nums">{{ money(detailItem.refunded_amount) }}</p>
            </div>
          </div>

          <dl class="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <div class="flex items-center justify-between gap-4 px-3 py-2.5">
              <dt class="text-zinc-500">{{ t('recharge.colUser') }}</dt>
              <dd>
                <button
                  type="button"
                  class="inline-flex min-h-8 items-center rounded-md px-2 font-mono text-xs text-primary hover:bg-primary/10"
                  @click="openUser(detailItem.user_id)"
                >
                  #{{ detailItem.user_id }}
                </button>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 px-3 py-2.5">
              <dt class="text-zinc-500">{{ t('recharge.colMethod') }}</dt>
              <dd>{{ methodText(detailItem.payment_method) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-4 px-3 py-2.5">
              <dt class="text-zinc-500">{{ t('recharge.provider') }}</dt>
              <dd class="truncate">{{ detailItem.payment_provider || '—' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-4 px-3 py-2.5">
              <dt class="text-zinc-500">{{ t('common.createTime') }}</dt>
              <dd>{{ formatUnix(detailItem.create_time) || '—' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-4 px-3 py-2.5">
              <dt class="text-zinc-500">{{ t('recharge.completedAt') }}</dt>
              <dd>{{ formatUnix(detailItem.complete_time) || '—' }}</dd>
            </div>
          </dl>

          <div
            v-if="detailItem.refund_reason || detailItem.out_request_no || detailItem.refunded_time"
            class="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div v-if="detailItem.out_request_no" class="flex items-start justify-between gap-4">
              <span class="shrink-0 text-zinc-500">{{ t('recharge.refundNo') }}</span>
              <span class="break-all text-right font-mono text-xs">{{ detailItem.out_request_no }}</span>
            </div>
            <div v-if="detailItem.refunded_time" class="flex items-center justify-between gap-4">
              <span class="text-zinc-500">{{ t('recharge.refundedAt') }}</span>
              <span>{{ formatUnix(detailItem.refunded_time) || '—' }}</span>
            </div>
            <div v-if="detailItem.refund_reason">
              <div class="text-zinc-500">{{ t('recharge.refundReason') }}</div>
              <p class="mt-1 whitespace-pre-wrap">{{ detailItem.refund_reason }}</p>
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <UserDetailModal v-model:open="userOpen" :user-id="userId" />
  </div>
</template>
