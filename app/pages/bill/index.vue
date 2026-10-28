<script setup lang="ts">
import { adminBillApi } from '~/api/billing'
import { formatUnix, parsePaged } from '~/api/creative'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'

/**
 * 全站资金流水（只读）：GET /admin/bills。单用户返利仍在用户详情抽屉里。
 */

const { t } = useI18n()
useHead({ title: () => t('bill.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const BIZ_KEY: Record<number, string> = {
  1: 'register',
  2: 'recharge',
  3: 'withdraw',
  4: 'withdrawRefund',
  5: 'convert',
  6: 'revoke',
  7: 'skill',
  8: 'skillExchange',
  9: 'partner',
  10: 'skillCash',
  11: 'skillCashRefund',
}

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<any[]>([])
const draft = reactive({ userId: '' })
const applied = ref({ userId: '' })
const userIdError = ref('')

function bizText(type: number) {
  const key = BIZ_KEY[type]
  return key ? t(`bill.biz.${key}`) : String(type)
}

function amountText(item: any) {
  const n = Number(item.amount) || 0
  const text = n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
  return item.biz_type === 9 ? `¥${text}` : text
}

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.userId)
    q.user_id = Number(applied.value.userId)
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminBillApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<any>(raw)
    if (!paged) {
      notify(raw?.message ?? t('bill.loadFail'), 'error')
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
  const text = draft.userId.trim()
  if (text && (!/^\d+$/.test(text) || Number(text) <= 0)) {
    userIdError.value = t('bill.idInvalid')
    return
  }
  userIdError.value = ''
  applied.value = { userId: text ? String(Number(text)) : '' }
  page.value = 1
}

function reset() {
  draft.userId = ''
  userIdError.value = ''
  search()
}

const userOpen = ref(false)
const userId = ref<number | null>(null)

function openUser(id: number) {
  if (!id)
    return
  userId.value = id
  userOpen.value = true
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('bill.title')" :page-description="t('bill.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.userId')" :error="userIdError || undefined">
          <UInput v-model="draft.userId" :placeholder="t('bill.userIdPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-scroll-text" :title="t('bill.empty')" :description="t('bill.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[72rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.userId') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('bill.colAmount') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('bill.colBalance') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('bill.colFrom') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('bill.colSource') }}</th>
                <th class="px-4 py-3">{{ t('bill.colRemark') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60" :class="item.status === 3 ? 'text-zinc-400 line-through' : ''">
                <td class="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    class="inline-flex min-h-8 items-center rounded-md px-2 font-mono text-xs text-primary hover:bg-primary/10"
                    @click="openUser(item.user_id)"
                  >
                    #{{ item.user_id }}
                  </button>
                </td>
                <td class="whitespace-nowrap px-4 py-3">{{ bizText(item.biz_type) }}</td>
                <td class="px-4 py-3 text-right tabular-nums" :class="Number(item.amount) < 0 ? 'text-rose-600' : ''">{{ amountText(item) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ Number(item.balance) || 0 }}</td>
                <td class="whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.from_user_id ? `#${item.from_user_id}` : '—' }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-xs">
                  <div class="font-mono">{{ item.source_no || '—' }}</div>
                  <div v-if="item.source_amount" class="text-zinc-400">{{ item.source_amount }} × {{ item.rate }}</div>
                </td>
                <td class="max-w-56 truncate px-4 py-3 text-xs" :title="item.remark || ''">{{ item.remark || '—' }}</td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 3 ? 'neutral' : 'success'" variant="subtle">{{ item.status === 3 ? t('bill.revoked') : t('bill.valid') }}</UBadge>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <UserDetailModal v-model:open="userOpen" :user-id="userId" />
  </div>
</template>
