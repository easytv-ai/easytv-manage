<script setup lang="ts">
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { adminPartnerApi, type AdminPartner, type PartnerCustomer, type PartnerReviewPayload } from '~/api/partner'
import { CONSOLE_DEFAULT_PAGE_SIZE, SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'

/**
 * 渠道伙伴计划（T34）：GET /admin/partner 申请队列（管理员可查看），
 * PUT /admin/partner/:id/review 通过 / 驳回 / 停用为 Root，GET /admin/partner/:id/customers 归属客户。
 * 与 easytv-api/API.md 9.3 对齐。
 */

const { t } = useI18n()
useHead({ title: () => t('partner.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const KINDS = ['mcn', 'school', 'kol', 'dev', 'other'] as const
const SOURCES = ['code', 'link', 'manual'] as const

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<AdminPartner[]>([])
const draft = reactive({ status: '0', keyword: '' })
const applied = ref({ ...draft })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: SELECT_ITEM_ALL },
  ...[0, 1, 2, 3].map(s => ({ label: t(`partner.status${s}`), value: String(s) })),
])
const statusText = (s: number) => t(`partner.status${s >= 0 && s <= 3 ? s : 0}`)
const statusColor = (s: number) => s === 1 ? 'success' : s === 2 ? 'error' : s === 3 ? 'neutral' : 'warning'
const kindLabel = (k: string) => (KINDS as readonly string[]).includes(k) ? t(`partner.kind.${k}`) : (k || '—')
const kindColor = (k: string) => k === 'mcn' ? 'primary' : k === 'school' ? 'info' : k === 'kol' ? 'error' : k === 'dev' ? 'success' : 'neutral'
const sourceLabel = (s: string) => (SOURCES as readonly string[]).includes(s) ? t(`partner.source.${s}`) : (s || '—')
const sourceColor = (s: string) => s === 'code' ? 'primary' : s === 'link' ? 'info' : 'neutral'

const num = (v: unknown) => (Number(v) || 0).toLocaleString()
const money = (v: unknown) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const rateText = (v: unknown) => Number(v) > 0 ? `${Math.round(Number(v) * 10000) / 100}%` : t('partner.rateDefault')

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.status !== SELECT_ITEM_ALL)
    q.status = Number(applied.value.status)
  if (applied.value.keyword.trim())
    q.keyword = applied.value.keyword.trim()
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminPartnerApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<AdminPartner>(raw)
    if (!paged) {
      notify(raw?.message ?? t('partner.loadFail'), 'error')
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
  applied.value = { ...draft, keyword: draft.keyword.trim() }
  page.value = 1
}
function reset() {
  Object.assign(draft, { status: '0', keyword: '' })
  search()
}

async function copyCode(code: string) {
  if (!code)
    return
  try {
    await navigator.clipboard.writeText(code)
    notify(t('partner.codeCopied'))
  }
  catch {
    notify(t('partner.copyFail'), 'error')
  }
}

// ---- 通过 / 驳回 弹窗 ----
type ReviewAction = PartnerReviewPayload['action']

const reviewOpen = ref(false)
const reviewAction = ref<ReviewAction>('approve')
const reviewItem = ref<AdminPartner | null>(null)
const reviewing = ref(false)
const form = reactive({ rate: '', remark: '' })
const errors = reactive({ rate: '', remark: '' })

function openReview(item: AdminPartner, action: ReviewAction) {
  reviewItem.value = item
  reviewAction.value = action
  Object.assign(form, {
    rate: action === 'approve' && Number(item.rebate_rate) > 0 ? String(item.rebate_rate) : '',
    remark: action === 'approve' ? (item.remark || '') : '',
  })
  Object.assign(errors, { rate: '', remark: '' })
  reviewOpen.value = true
}

function validate() {
  Object.assign(errors, { rate: '', remark: '' })
  const rateRaw = String(form.rate ?? '').trim()
  if (reviewAction.value === 'approve' && rateRaw) {
    const n = Number(rateRaw)
    if (!Number.isFinite(n) || n < 0 || n > 1)
      errors.rate = t('partner.rateInvalid')
  }
  if (reviewAction.value === 'reject' && !form.remark.trim())
    errors.remark = t('partner.remarkRequired')
  return !errors.rate && !errors.remark
}

async function submitReview() {
  const item = reviewItem.value
  if (!item || reviewing.value || !validate())
    return
  const action = reviewAction.value
  reviewing.value = true
  try {
    const rateRaw = String(form.rate ?? '').trim()
    const payload: PartnerReviewPayload = {
      action,
      rebate_rate: action === 'approve' && rateRaw ? Number(rateRaw) : undefined,
      remark: form.remark.trim() || undefined,
    }
    const raw = await adminPartnerApi.review(item.id, payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || t(`partner.done.${action}`))
    reviewOpen.value = false
    await fetchList(`r-${Date.now()}`)
  }
  finally {
    reviewing.value = false
  }
}

// ---- 停用确认 ----
const confirmOpen = ref(false)
const confirmItem = ref<AdminPartner | null>(null)
const confirming = ref(false)

function openDisable(item: AdminPartner) {
  confirmItem.value = item
  confirmOpen.value = true
}

async function doDisable() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = await adminPartnerApi.review(item.id, { action: 'disable' })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || t('partner.done.disable'))
    confirmOpen.value = false
    await fetchList(`d-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

// ---- 详情抽屉（含归属客户）----
const detailOpen = ref(false)
const detailItem = ref<AdminPartner | null>(null)
const customers = ref<PartnerCustomer[]>([])
const customersTotal = ref(0)
const customersPage = ref(1)
const customersPageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const customersLoading = ref(false)

let customersSeq = 0
async function loadCustomers() {
  const item = detailItem.value
  if (!item)
    return
  const mySeq = ++customersSeq
  customersLoading.value = true
  try {
    const raw = await adminPartnerApi.customers(item.id, { page: customersPage.value, page_size: customersPageSize.value })
    if (mySeq !== customersSeq)
      return
    const paged = parsePaged<PartnerCustomer>(raw)
    if (!paged) {
      notify(raw?.message ?? t('partner.customersLoadFail'), 'error')
      return
    }
    customers.value = paged.items
    customersTotal.value = paged.total
  }
  finally {
    if (mySeq === customersSeq)
      customersLoading.value = false
  }
}

function openDetail(item: AdminPartner) {
  detailItem.value = item
  customers.value = []
  customersTotal.value = 0
  customersPage.value = 1
  detailOpen.value = true
  void loadCustomers()
}

watch([customersPage, customersPageSize], ([, size], [, prevSize]) => {
  if (!detailOpen.value)
    return
  if (size !== prevSize)
    customersPage.value = 1
  void loadCustomers()
})

const detailTiles = computed(() => {
  const d = detailItem.value
  if (!d)
    return []
  return [
    { label: t('partner.colCustomers'), value: num(d.customers) },
    { label: t('partner.colPaidUsers'), value: num(d.paid_users) },
    { label: t('partner.colAmount'), value: money(d.amount_total) },
    { label: t('partner.colRebate'), value: money(d.rebate_total) },
  ]
})
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('partner.title')" :page-description="t('partner.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('partner.keywordPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-handshake" :title="t('partner.empty')" :description="t('partner.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[82rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="px-4 py-3">{{ t('partner.colName') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('partner.colCode') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('partner.colRate') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('partner.colCustomersShort') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('partner.colAmount') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('partner.colRebate') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('partner.colApplied') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="px-4 py-3">
                  <div class="max-w-56 truncate font-medium" :title="item.name">{{ item.name || '—' }}</div>
                  <div class="text-xs text-zinc-500">
                    <span>{{ item.nickname || '—' }}</span>
                    <span class="ml-1 font-mono text-zinc-400">#{{ item.user_id }}</span>
                  </div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="kindColor(item.kind)" variant="subtle">{{ kindLabel(item.kind) }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <div v-if="item.code" class="flex items-center gap-1">
                    <span class="font-mono text-sm font-semibold">{{ item.code }}</span>
                    <UButton
                      type="button"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-copy"
                      :aria-label="t('partner.copyCode')"
                      @click="copyCode(item.code)"
                    />
                  </div>
                  <span v-else class="text-zinc-400">—</span>
                </td>
                <td class="whitespace-nowrap px-4 py-3 tabular-nums">{{ rateText(item.rebate_rate) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {{ num(item.customers) }} / {{ num(item.paid_users) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">{{ money(item.amount_total) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">{{ money(item.rebate_total) }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(item.status)" variant="subtle">{{ statusText(item.status) }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.applied_at) || '—' }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex flex-nowrap gap-1">
                    <UButton type="button" size="xs" variant="soft" color="neutral" @click="openDetail(item)">{{ t('common.detail') }}</UButton>
                    <template v-if="isSuperAdmin">
                      <UButton v-if="item.status !== 1" type="button" size="xs" variant="soft" color="success" @click="openReview(item, 'approve')">{{ t('partner.approve') }}</UButton>
                      <UButton v-if="item.status === 0" type="button" size="xs" variant="soft" color="error" @click="openReview(item, 'reject')">{{ t('partner.reject') }}</UButton>
                      <UButton v-if="item.status === 1" type="button" size="xs" variant="soft" color="warning" @click="openDisable(item)">{{ t('partner.disable') }}</UButton>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <UModal
      v-model:open="reviewOpen"
      :title="reviewAction === 'approve' ? t('partner.approveTitle') : t('partner.rejectTitle')"
      :description="reviewItem ? `${reviewItem.name || `#${reviewItem.id}`} · ${kindLabel(reviewItem.kind)}` : undefined"
      :ui="{ content: 'w-[min(96vw,32rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <template v-if="reviewItem">
          <div class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div class="text-zinc-500">{{ t('partner.contact') }}</div>
            <p class="mt-0.5 break-all">{{ reviewItem.contact || '—' }}</p>
            <div class="mt-2 text-zinc-500">{{ t('partner.intro') }}</div>
            <p class="mt-0.5 whitespace-pre-wrap break-words">{{ reviewItem.intro || '—' }}</p>
          </div>

          <UFormField
            v-if="reviewAction === 'approve'"
            :label="t('partner.rate')"
            :help="t('partner.rateHelp')"
            :error="errors.rate || undefined"
          >
            <UInput
              :model-value="form.rate"
              type="number"
              min="0"
              max="1"
              step="0.01"
              :placeholder="t('partner.ratePh')"
              class="w-full"
              @update:model-value="form.rate = String($event ?? '')"
            />
          </UFormField>

          <UFormField
            :label="t('partner.remark')"
            :help="reviewAction === 'approve' ? t('partner.remarkHelp') : t('partner.remarkRejectHelp')"
            :error="errors.remark || undefined"
          >
            <UTextarea v-model="form.remark" :rows="3" maxlength="255" class="w-full" />
          </UFormField>

          <p v-if="reviewAction === 'approve'" class="text-xs text-zinc-500">{{ t('partner.approveHint') }}</p>
        </template>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="reviewing" @click="() => { reviewOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton
          type="button"
          :color="reviewAction === 'approve' ? 'success' : 'error'"
          :loading="reviewing"
          :disabled="reviewing"
          @click="submitReview"
        >
          {{ reviewAction === 'approve' ? t('partner.approve') : t('partner.reject') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="confirmOpen"
      :title="t('partner.confirmDisable')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm">{{ t('partner.confirmDisableBody', { name: confirmItem?.name ?? '' }) }}</p>
        <p class="mt-2 text-xs text-zinc-500">{{ t('partner.confirmDisableHint') }}</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" color="warning" :loading="confirming" :disabled="confirming" @click="doDisable">{{ t('common.confirm') }}</UButton>
      </template>
    </UModal>

    <USlideover
      v-model:open="detailOpen"
      :title="detailItem ? `${t('partner.detailTitle')} — ${detailItem.name || `#${detailItem.id}`}` : t('partner.detailTitle')"
      :description="detailItem ? `${detailItem.nickname || `#${detailItem.user_id}`} · ${kindLabel(detailItem.kind)}` : undefined"
      :ui="{ content: 'w-[min(96vw,44rem)] max-w-none' }"
    >
      <template #body>
        <div v-if="detailItem" class="space-y-6">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div v-for="tile in detailTiles" :key="tile.label" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="text-xs text-zinc-500">{{ tile.label }}</div>
              <p class="mt-1 text-xl font-semibold tabular-nums">{{ tile.value }}</p>
            </div>
          </div>

          <div class="space-y-3 rounded-lg border border-dashed border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-zinc-500">{{ t('common.status') }}</span>
              <UBadge :color="statusColor(detailItem.status)" variant="subtle">{{ statusText(detailItem.status) }}</UBadge>
              <span class="text-zinc-500">{{ t('partner.colCode') }}</span>
              <span v-if="detailItem.code" class="font-mono font-semibold">{{ detailItem.code }}</span>
              <span v-else class="text-zinc-400">—</span>
              <UButton
                v-if="detailItem.code"
                type="button"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-copy"
                :aria-label="t('partner.copyCode')"
                @click="copyCode(detailItem.code)"
              />
              <span class="text-zinc-500">{{ t('partner.colRate') }}</span>
              <span class="tabular-nums">{{ rateText(detailItem.rebate_rate) }}</span>
            </div>
            <div>
              <div class="text-xs text-zinc-500">{{ t('partner.contact') }}</div>
              <p class="mt-0.5 break-all">{{ detailItem.contact || '—' }}</p>
            </div>
            <div>
              <div class="text-xs text-zinc-500">{{ t('partner.intro') }}</div>
              <p class="mt-0.5 whitespace-pre-wrap break-words">{{ detailItem.intro || '—' }}</p>
            </div>
            <div class="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
              <div>{{ t('partner.appliedAt', { time: formatUnix(detailItem.applied_at) || '—' }) }}</div>
              <div>{{ t('partner.reviewedAt', { time: formatUnix(detailItem.reviewed_at) || '—', by: detailItem.reviewed_by ? `#${detailItem.reviewed_by}` : '—' }) }}</div>
            </div>
            <div v-if="detailItem.remark" class="text-xs text-zinc-500">{{ t('partner.remark') }}：{{ detailItem.remark }}</div>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-semibold">
              {{ t('partner.customersTitle') }}
              <span class="font-normal text-zinc-400">{{ customersTotal ? t('common.totalItems', { total: customersTotal }) : '' }}</span>
            </h3>
            <div v-if="customersLoading && !customers.length" class="flex min-h-40 items-center justify-center text-zinc-500">
              <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
            </div>
            <div v-else class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div class="overflow-x-auto">
                <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                  <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th class="px-3 py-2">{{ t('partner.customerUser') }}</th>
                      <th class="whitespace-nowrap px-3 py-2">{{ t('partner.customerSource') }}</th>
                      <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('partner.customerAmount') }}</th>
                      <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('partner.customerRebate') }}</th>
                      <th class="whitespace-nowrap px-3 py-2">{{ t('partner.customerBoundAt') }}</th>
                      <th class="whitespace-nowrap px-3 py-2">{{ t('partner.customerFirstPaidAt') }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <tr v-if="!customers.length">
                      <td colspan="6" class="px-3 py-6 text-center text-zinc-400">{{ t('partner.customersEmpty') }}</td>
                    </tr>
                    <tr v-for="c in customers" :key="c.id">
                      <td class="px-3 py-2">
                        <span>{{ c.nickname || '—' }}</span>
                        <span class="ml-1 font-mono text-xs text-zinc-400">#{{ c.user_id }}</span>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2">
                        <UBadge :color="sourceColor(c.source)" variant="subtle">{{ sourceLabel(c.source) }}</UBadge>
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{{ money(c.amount) }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums">{{ money(c.rebate) }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ formatUnix(c.created_at) || '—' }}</td>
                      <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ formatUnix(c.first_paid_at) || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ConsoleTablePagination v-model:page="customersPage" v-model:page-size="customersPageSize" :total="customersTotal" :disabled="customersLoading" />
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
