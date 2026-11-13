<script setup lang="ts">
import type { AdminPointLog, AdminWallet } from '~/types/easytv-admin'
import { toPositiveInt } from '~/utils/pricing-admin'
import { adminWalletApi } from '~/api/billing'
import { formatUnix, isOk, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('wallet.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const route = useRoute()
const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminWallet[]>([])
const draft = reactive({ keyword: '' })
const applied = ref({ ...draft })

const adjustOpen = ref(false)
const logOpen = ref(false)
const current = ref<AdminWallet | null>(null)
const currentLogs = ref<AdminPointLog[]>([])
const adjustForm = reactive({ type: 'add' as 'add' | 'deduct', amount: '', reason: '' })
const adjustErrors = reactive({ amount: '' })
const adjustSaving = ref(false)
const confirmOpen = ref(false)

const typeItems = computed(() => [
  { label: t('wallet.grantTitle'), value: 'add' },
  { label: t('wallet.deduct'), value: 'deduct' },
])

const pageRows = computed(() => rows.value)

function toRow(item: any): AdminWallet {
  return {
    userId: item.user_id,
    userName: item.user_name || item.username || `#${item.user_id}`,
    mobile: /^1\d{10}$/.test(String(item.username ?? '')) ? String(item.username) : '',
    planName: item.plan_name || '',
    expireAt: item.expires_at ? formatUnix(item.expires_at) : '',
    points: Number(item.balance) || 0,
  }
}

function logLabel(type: string) {
  const map: Record<string, string> = {
    grant: t('wallet.logGrant'),
    freeze: t('wallet.logFreeze'),
    settle: t('wallet.logSettle'),
    unfreeze: t('wallet.logUnfreeze'),
    expire: t('wallet.logExpire'),
    adjust: t('wallet.adminOp'),
  }
  return map[type] ?? type
}

function toLog(item: any): AdminPointLog {
  const amount = Number(item.amount) || 0
  return {
    id: item.id,
    userId: item.user_id,
    type: amount >= 0 ? 'add' : 'deduct',
    amount: Math.abs(amount),
    reason: `${logLabel(item.type)}：${item.reason || ''}`,
    createdAt: formatUnix(item.created_at),
    operator: item.operator_id ? t('wallet.operatorAdmin', { id: item.operator_id }) : t('wallet.system'),
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminWalletApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.keyword || undefined,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('wallet.loadFail'), 'error')
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
  const keyword = String(route.query.keyword || '').trim()
  if (keyword) {
    draft.keyword = keyword
    applied.value = { ...draft }
  }
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { keyword: draft.keyword.trim() }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { keyword: '' })
  search()
}

function gotoOrder(userId: number) {
  return navigateTo(localePath({ path: '/order', query: { userId: String(userId) } }))
}

function openAdjust(item: AdminWallet) {
  current.value = item
  Object.assign(adjustForm, { type: 'add', amount: '', reason: '' })
  Object.assign(adjustErrors, { amount: '' })
  adjustOpen.value = true
}

async function openLog(item: AdminWallet) {
  current.value = item
  currentLogs.value = []
  logOpen.value = true
  const raw = await adminWalletApi.logs({ user_id: item.userId, page: 1, page_size: 50 })
  const parsed = parsePaged(raw)
  if (!parsed) {
    notify(raw?.message ?? t('wallet.logFail'), 'error')
    return
  }
  currentLogs.value = parsed.items.map(toLog)
}

function validateAdjust() {
  adjustErrors.amount = toPositiveInt(adjustForm.amount) ? '' : t('wallet.amountRequired')
  if (adjustForm.type === 'deduct' && current.value && toPositiveInt(adjustForm.amount) > current.value.points)
    adjustErrors.amount = t('wallet.deductOver')
  return !adjustErrors.amount
}

function requestAdjust() {
  if (!validateAdjust())
    return
  confirmOpen.value = true
}

async function confirmAdjust() {
  if (!current.value)
    return
  adjustSaving.value = true
  try {
    const amount = toPositiveInt(adjustForm.amount)
    const raw = await adminWalletApi.adjust(current.value.userId, adjustForm.type === 'add' ? amount : -amount, adjustForm.reason.trim())
    if (!isOk(raw)) {
      notify(raw?.message ?? t('wallet.adjustFail'), 'error')
      return
    }
    notify(adjustForm.type === 'add' ? t('wallet.granted') : t('wallet.deducted'))
    confirmOpen.value = false
    adjustOpen.value = false
    await fetchList(`a-${Date.now()}`)
  }
  finally {
    adjustSaving.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('wallet.title')" :page-description="t('wallet.description')" />

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('wallet.keywordLabel')">
          <UInput icon="i-lucide-search" v-model="draft.keyword" :placeholder="t('wallet.keywordPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
    </ManageFilterBar>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-wallet" :title="t('wallet.empty')" :description="t('wallet.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.user') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.userId') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('wallet.mobile') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('wallet.plan') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('wallet.expire') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('wallet.balance') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.userId" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="truncate font-medium" :title="item.userName">{{ item.userName }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.userId }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.mobile || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.planName || t('wallet.noMember') }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.expireAt || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-medium">{{ item.points }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openAdjust(item)">{{ t('wallet.adjust') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="openLog(item)">{{ t('wallet.log') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="() => { void gotoOrder(item.userId) }">{{ t('wallet.orders') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="adjustOpen" :title="t('wallet.adjust')" :ui="{ content: 'w-[min(96vw,32rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="mb-4 text-sm text-zinc-500">
          {{ t('wallet.adjustHint', { name: current?.userName, n: current?.points ?? 0 }) }}
        </p>
        <div class="space-y-4">
          <UFormField :label="t('wallet.adjustType')" required>
            <USelect v-model="adjustForm.type" :items="typeItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField :label="t('wallet.amount')" required :error="adjustErrors.amount || undefined">
            <UInput v-model="adjustForm.amount" type="number" min="1" :placeholder="t('wallet.amountPh')" class="w-full" />
          </UFormField>
          <UFormField :label="t('wallet.reason')" :hint="t('wallet.reasonHintAlt')">
            <UTextarea v-model="adjustForm.reason" :rows="3" maxlength="120" :placeholder="t('wallet.reasonPh')" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="adjustSaving" @click="() => { adjustOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :disabled="adjustSaving" @click="requestAdjust">{{ t('common.next') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="t('wallet.confirmAdjust')"
      :tone="adjustForm.type === 'deduct' ? 'error' : 'primary'"
      :icon="adjustForm.type === 'deduct' ? 'i-lucide-circle-minus' : 'i-lucide-circle-plus'"
      :loading="adjustSaving"
      @confirm="confirmAdjust"
    >
      {{ adjustForm.type === 'add'
        ? t('wallet.confirmGrantBody', { name: current?.userName, n: adjustForm.amount })
        : t('wallet.confirmDeductBody', { name: current?.userName, n: adjustForm.amount }) }}
    </ManageConfirmModal>

    <UModal v-model:open="logOpen" :title="t('wallet.logTitle')" :ui="{ content: 'w-[min(96vw,40rem)]' }">
      <template #body>
        <UEmpty v-if="!currentLogs.length" icon="i-lucide-list" :title="t('wallet.logEmptyTitle')" :description="t('wallet.logEmpty')" />
        <div v-else class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="text-left text-xs text-zinc-500">
              <tr>
                <th class="w-[1%] whitespace-nowrap py-2">{{ t('common.time') }}</th>
                <th class="w-[1%] whitespace-nowrap py-2">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap py-2">{{ t('wallet.qty') }}</th>
                <th class="min-w-0 w-full py-2 text-left">{{ t('wallet.reasonCol') }}</th>
                <th class="w-[1%] whitespace-nowrap py-2">{{ t('wallet.operatorCol') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in currentLogs" :key="item.id">
                <td class="w-[1%] whitespace-nowrap py-2 text-zinc-500">{{ item.createdAt }}</td>
                <td class="w-[1%] whitespace-nowrap py-2">{{ item.type === 'add' ? t('wallet.grant') : t('wallet.deduct') }}</td>
                <td class="w-[1%] whitespace-nowrap py-2">{{ item.type === 'add' ? '+' : '-' }}{{ item.amount }}</td>
                <td class="max-w-0 w-full py-2">
                  <div class="truncate" :title="item.reason">{{ item.reason }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap py-2">{{ item.operator }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </UModal>
  </div>
</template>
