<script setup lang="ts">
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { adminPartnerApi, type AdminPartner } from '~/api/partner'
import { adminWithdrawApi, type AdminWithdraw } from '~/api/withdraw'
import { CONSOLE_DEFAULT_PAGE_SIZE, SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'

/**
 * 提现审核：管理员查看，超级管理员通过 / 驳回 / 标记已打款 / 打款失败。
 * 状态：0 待审核、2 打款中、1 已打款、-1 打款失败、-9 已驳回。
 */

const { t } = useI18n()
useHead({ title: () => t('withdraw.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const STATUS_OPTIONS = [
  { value: '0', key: 'pending' },
  { value: '2', key: 'paying' },
  { value: '1', key: 'paid' },
  { value: '-1', key: 'failed' },
  { value: '-9', key: 'rejected' },
] as const

type StatusFilter = typeof SELECT_ITEM_ALL | (typeof STATUS_OPTIONS)[number]['value']

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<AdminWithdraw[]>([])
const draft = reactive({ status: '0' as StatusFilter })
const applied = ref({ status: '0' as StatusFilter })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: SELECT_ITEM_ALL },
  ...STATUS_OPTIONS.map(s => ({ label: t(`withdraw.status.${s.key}`), value: s.value })),
])

function statusText(s: number) {
  const found = STATUS_OPTIONS.find(item => item.value === String(s))
  return found ? t(`withdraw.status.${found.key}`) : String(s)
}

function statusColor(s: number) {
  if (s === 1)
    return 'success'
  if (s === 0)
    return 'warning'
  if (s === 2)
    return 'info'
  if (s === -1 || s === -9)
    return 'error'
  return 'neutral'
}

const money = (v: unknown) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ownerText(item: AdminWithdraw) {
  const kind = item.owner_type === 2
    ? t('withdraw.ownerPartner')
    : item.owner_type === 3
      ? t('withdraw.ownerCreator')
      : t('withdraw.ownerUser')
  return `${kind} #${item.owner_id}`
}

function wayText(way: string) {
  if (way === 'alipay' || way === 'wechat' || way === 'bank')
    return t(`withdraw.way.${way}`)
  return way || '—'
}

function accountText(raw: string) {
  const text = String(raw || '').trim()
  if (!text)
    return '—'
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const parts = Object.values(parsed).map(v => String(v ?? '').trim()).filter(Boolean)
      return parts.length ? parts.join(' · ') : '—'
    }
  }
  catch {
    return text
  }
  return text
}

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.status !== SELECT_ITEM_ALL)
    q.status = Number(applied.value.status)
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminWithdrawApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<AdminWithdraw>(raw)
    if (!paged) {
      notify(raw?.message ?? t('withdraw.loadFail'), 'error')
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
  draft.status = '0'
  search()
}

const detailOpen = ref(false)
const detailItem = ref<AdminWithdraw | null>(null)

function openDetail(item: AdminWithdraw) {
  detailItem.value = item
  detailOpen.value = true
}

const userOpen = ref(false)
const userId = ref<number | null>(null)
const partnerUsers = new Map<number, number>()

function openUser(id: number) {
  if (!id)
    return
  userId.value = id
  userOpen.value = true
}

async function partnerUserId(partnerId: number) {
  const cached = partnerUsers.get(partnerId)
  if (cached)
    return cached
  for (let pageNo = 1; pageNo <= 5; pageNo++) {
    const raw = await adminPartnerApi.list({ page: pageNo, page_size: 100 })
    const paged = parsePaged<AdminPartner>(raw)
    if (!paged)
      return 0
    for (const partner of paged.items)
      partnerUsers.set(partner.id, partner.user_id)
    if (partnerUsers.has(partnerId) || paged.items.length < 100)
      break
  }
  return partnerUsers.get(partnerId) || 0
}

async function openApplicant(item: AdminWithdraw) {
  if (item.owner_type !== 2) {
    openUser(item.owner_id)
    return
  }
  const id = await partnerUserId(item.owner_id)
  if (!id) {
    notify(t('withdraw.partnerUserMissing'), 'error')
    return
  }
  openUser(id)
}

type ReviewAction = 'approve' | 'reject'

const reviewOpen = ref(false)
const reviewAction = ref<ReviewAction>('approve')
const reviewItem = ref<AdminWithdraw | null>(null)
const reviewing = ref(false)
const reviewForm = reactive({ remark: '' })
const reviewError = ref('')

function openReview(item: AdminWithdraw, action: ReviewAction) {
  reviewItem.value = item
  reviewAction.value = action
  reviewForm.remark = ''
  reviewError.value = ''
  reviewOpen.value = true
}

async function submitReview() {
  const item = reviewItem.value
  if (!item || reviewing.value)
    return
  const remark = reviewForm.remark.trim()
  if (reviewAction.value === 'reject' && !remark) {
    reviewError.value = t('withdraw.remarkRequired')
    return
  }
  if (remark.length > 255) {
    reviewError.value = t('withdraw.remarkTooLong')
    return
  }
  reviewError.value = ''
  reviewing.value = true
  try {
    const raw = await adminWithdrawApi.audit(item.id, reviewAction.value, remark)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(reviewAction.value === 'approve' ? t('withdraw.approved') : t('withdraw.rejected'))
    reviewOpen.value = false
    await fetchList(`r-${Date.now()}`)
  }
  finally {
    reviewing.value = false
  }
}

const paidOpen = ref(false)
const paidItem = ref<AdminWithdraw | null>(null)
const paying = ref(false)
const paidForm = reactive({ transactionNo: '' })
const paidError = ref('')

function openPaid(item: AdminWithdraw) {
  paidItem.value = item
  paidForm.transactionNo = ''
  paidError.value = ''
  paidOpen.value = true
}

async function submitPaid() {
  const item = paidItem.value
  if (!item || paying.value)
    return
  const no = paidForm.transactionNo.trim()
  if (!no) {
    paidError.value = t('withdraw.txnRequired')
    return
  }
  if (no.length > 64) {
    paidError.value = t('withdraw.txnTooLong')
    return
  }
  paidError.value = ''
  paying.value = true
  try {
    const raw = await adminWithdrawApi.markPaid(item.id, no)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(t('withdraw.paid'))
    paidOpen.value = false
    await fetchList(`p-${Date.now()}`)
  }
  finally {
    paying.value = false
  }
}

const failOpen = ref(false)
const failItem = ref<AdminWithdraw | null>(null)
const failing = ref(false)
const failForm = reactive({ failureMsg: '' })
const failError = ref('')

function openFail(item: AdminWithdraw) {
  failItem.value = item
  failForm.failureMsg = ''
  failError.value = ''
  failOpen.value = true
}

async function submitFail() {
  const item = failItem.value
  if (!item || failing.value)
    return
  const msg = failForm.failureMsg.trim()
  if (!msg) {
    failError.value = t('withdraw.failRequired')
    return
  }
  if (msg.length > 255) {
    failError.value = t('withdraw.failTooLong')
    return
  }
  failError.value = ''
  failing.value = true
  try {
    const raw = await adminWithdrawApi.markFailed(item.id, msg)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(t('withdraw.failed'))
    failOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    failing.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('withdraw.title')" :page-description="t('withdraw.description')" />

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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-banknote" :title="t('withdraw.empty')" :description="t('withdraw.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[76rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="whitespace-nowrap px-4 py-3">{{ t('withdraw.colNo') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('withdraw.colOwner') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('withdraw.colAmount') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('withdraw.colWay') }}</th>
                <th class="px-4 py-3">{{ t('withdraw.colAccount') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('withdraw.colApplied') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.withdraw_no }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    class="inline-flex min-h-8 items-center rounded-md px-2 text-primary hover:bg-primary/10"
                    @click="openApplicant(item)"
                  >
                    {{ ownerText(item) }}
                  </button>
                </td>
                <td class="px-4 py-3 text-right tabular-nums">
                  <div>{{ money(item.amount) }}</div>
                  <div class="text-xs text-zinc-400">{{ t('withdraw.actual', { money: money(item.actual_amount) }) }}</div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">{{ wayText(item.way) }}</td>
                <td class="max-w-56 truncate px-4 py-3 text-xs" :title="accountText(item.account_info)">{{ accountText(item.account_info) }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(item.status)" variant="subtle">{{ statusText(item.status) }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.created_at) }}</td>
                <td class="sticky right-0 z-10 whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900">
                  <div class="flex gap-2">
                    <UButton type="button" size="xs" variant="soft" color="neutral" @click="openDetail(item)">{{ t('withdraw.view') }}</UButton>
                    <template v-if="isSuperAdmin && item.status === 0">
                      <UButton type="button" size="xs" color="success" variant="soft" @click="openReview(item, 'approve')">{{ t('withdraw.approve') }}</UButton>
                      <UButton type="button" size="xs" color="error" variant="soft" @click="openReview(item, 'reject')">{{ t('withdraw.reject') }}</UButton>
                    </template>
                    <template v-if="isSuperAdmin && item.status === 2">
                      <UButton type="button" size="xs" variant="soft" @click="openPaid(item)">{{ t('withdraw.markPaid') }}</UButton>
                      <UButton type="button" size="xs" color="error" variant="soft" @click="openFail(item)">{{ t('withdraw.markFailed') }}</UButton>
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

    <USlideover
      v-model:open="detailOpen"
      :title="detailItem?.withdraw_no || t('withdraw.detailTitle')"
      :ui="{ content: 'w-[min(96vw,32rem)] max-w-none' }"
    >
      <template #body>
        <dl v-if="detailItem" class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-zinc-500">{{ t('withdraw.colOwner') }}</dt>
            <dd>
              <button
                type="button"
                class="inline-flex min-h-8 items-center rounded-md px-2 text-primary hover:bg-primary/10"
                @click="openApplicant(detailItem)"
              >
                {{ ownerText(detailItem) }}
              </button>
            </dd>
          </div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.colAmount') }}</dt><dd class="tabular-nums">{{ money(detailItem.amount) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.fee') }}</dt><dd class="tabular-nums">{{ money(detailItem.fee) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.actualLabel') }}</dt><dd class="tabular-nums">{{ money(detailItem.actual_amount) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.colWay') }}</dt><dd>{{ wayText(detailItem.way) }}</dd></div>
          <div><dt class="text-zinc-500">{{ t('withdraw.colAccount') }}</dt><dd class="mt-1 break-all">{{ accountText(detailItem.account_info) }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('common.status') }}</dt><dd><UBadge :color="statusColor(detailItem.status)" variant="subtle">{{ statusText(detailItem.status) }}</UBadge></dd></div>
          <div v-if="detailItem.audit_remark"><dt class="text-zinc-500">{{ t('withdraw.remark') }}</dt><dd class="mt-1 whitespace-pre-wrap">{{ detailItem.audit_remark }}</dd></div>
          <div v-if="detailItem.failure_msg"><dt class="text-zinc-500">{{ t('withdraw.failure') }}</dt><dd class="mt-1">{{ detailItem.failure_msg }}</dd></div>
          <div v-if="detailItem.transaction_no" class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.txn') }}</dt><dd class="font-mono text-xs">{{ detailItem.transaction_no }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.colApplied') }}</dt><dd>{{ formatUnix(detailItem.created_at) || '—' }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.auditedAt') }}</dt><dd>{{ formatUnix(detailItem.audit_time) || '—' }}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-zinc-500">{{ t('withdraw.completedAt') }}</dt><dd>{{ formatUnix(detailItem.complete_time) || '—' }}</dd></div>
        </dl>
      </template>
    </USlideover>

    <UModal
      v-model:open="reviewOpen"
      :title="reviewAction === 'approve' ? t('withdraw.approveTitle') : t('withdraw.rejectTitle')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="mb-3 text-sm text-zinc-500">{{ reviewAction === 'approve' ? t('withdraw.approveHint') : t('withdraw.rejectHint') }}</p>
        <UFormField :label="t('withdraw.remark')" :required="reviewAction === 'reject'" :error="reviewError || undefined">
          <UTextarea v-model="reviewForm.remark" :rows="3" maxlength="255" class="w-full" :placeholder="t('withdraw.remarkPh')" />
        </UFormField>
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
          {{ reviewing ? t('common.processing') : (reviewAction === 'approve' ? t('withdraw.approve') : t('withdraw.reject')) }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="paidOpen"
      :title="t('withdraw.paidTitle')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="mb-3 text-sm text-zinc-500">{{ t('withdraw.paidHint', { no: paidItem?.withdraw_no ?? '' }) }}</p>
        <UFormField :label="t('withdraw.txn')" required :error="paidError || undefined">
          <UInput v-model="paidForm.transactionNo" maxlength="64" class="w-full" :placeholder="t('withdraw.txnPh')" />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="paying" @click="() => { paidOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="paying" :disabled="paying" @click="submitPaid">
          {{ paying ? t('common.processing') : t('withdraw.markPaid') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="failOpen"
      :title="t('withdraw.failTitle')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="mb-3 text-sm text-zinc-500">{{ t('withdraw.failHint', { no: failItem?.withdraw_no ?? '' }) }}</p>
        <UFormField :label="t('withdraw.failure')" required :error="failError || undefined">
          <UTextarea v-model="failForm.failureMsg" :rows="3" maxlength="255" class="w-full" :placeholder="t('withdraw.failPh')" />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="failing" @click="() => { failOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" color="error" :loading="failing" :disabled="failing" @click="submitFail">
          {{ failing ? t('common.processing') : t('withdraw.markFailed') }}
        </UButton>
      </template>
    </UModal>

    <UserDetailModal v-model:open="userOpen" :user-id="userId" />
  </div>
</template>
