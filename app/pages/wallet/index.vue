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

const typeItems = [
  { label: '补发积分', value: 'add' },
  { label: '扣减积分', value: 'deduct' },
]

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

const LOG_LABEL: Record<string, string> = {
  grant: '入账',
  freeze: '任务预扣',
  settle: '结算',
  unfreeze: '任务退回',
  expire: '到期作废',
  adjust: '后台调整',
}

function toLog(item: any): AdminPointLog {
  const amount = Number(item.amount) || 0
  return {
    id: item.id,
    userId: item.user_id,
    type: amount >= 0 ? 'add' : 'deduct',
    amount: Math.abs(amount),
    reason: `${LOG_LABEL[item.type] ?? item.type}：${item.reason || ''}`,
    createdAt: formatUnix(item.created_at),
    operator: item.operator_id ? `管理员 #${item.operator_id}` : '系统',
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
      notify(raw?.message ?? '钱包列表加载失败', 'error')
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
    notify(raw?.message ?? '流水加载失败', 'error')
    return
  }
  currentLogs.value = parsed.items.map(toLog)
}

function validateAdjust() {
  adjustErrors.amount = toPositiveInt(adjustForm.amount) ? '' : '请输入大于 0 的整数'
  if (adjustForm.type === 'deduct' && current.value && toPositiveInt(adjustForm.amount) > current.value.points)
    adjustErrors.amount = '扣减数量不能大于当前积分'
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
      notify(raw?.message ?? '调整失败', 'error')
      return
    }
    notify(adjustForm.type === 'add' ? '积分已补发' : '积分已扣减')
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

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="账号 / 用户名">
          <UInput v-model="draft.keyword" placeholder="请输入账号或用户名" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-wallet" :title="t('wallet.empty')" :description="t('wallet.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">用户</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">用户 ID</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">手机号</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">会员套餐</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">到期时间</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">积分余额</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.userId" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="truncate font-medium" :title="item.userName">{{ item.userName }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.userId }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.mobile || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.planName || '未开通' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.expireAt || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-medium">{{ item.points }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openAdjust(item)">调整积分</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="openLog(item)">流水</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="() => { void gotoOrder(item.userId) }">订单</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="adjustOpen" title="调整积分" :ui="{ content: 'w-[min(96vw,32rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="mb-4 text-sm text-zinc-500">
          用户 {{ current?.userName }}，当前积分 {{ current?.points ?? 0 }}
        </p>
        <div class="space-y-4">
          <UFormField label="调整类型" required>
            <USelect v-model="adjustForm.type" :items="typeItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="积分数量" required :error="adjustErrors.amount || undefined">
            <UInput v-model="adjustForm.amount" type="number" min="1" placeholder="请输入整数" class="w-full" />
          </UFormField>
          <UFormField label="调整原因" hint="选填，不填则记为后台调整">
            <UTextarea v-model="adjustForm.reason" :rows="3" maxlength="120" placeholder="例如：活动补发、生成失败补偿" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="adjustSaving" @click="() => { adjustOpen = false }">取消</UButton>
        <UButton type="button" :disabled="adjustSaving" @click="requestAdjust">下一步</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" title="确认调整积分" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          确定要为“{{ current?.userName }}”{{ adjustForm.type === 'add' ? '补发' : '扣减' }} {{ adjustForm.amount }} 积分吗？该操作会写入流水。
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="adjustSaving" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton
          type="button"
          :color="adjustForm.type === 'deduct' ? 'error' : 'primary'"
          :loading="adjustSaving"
          :disabled="adjustSaving"
          @click="confirmAdjust"
        >
          {{ adjustSaving ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="logOpen" title="积分流水" :ui="{ content: 'w-[min(96vw,40rem)]' }">
      <template #body>
        <UEmpty v-if="!currentLogs.length" icon="i-lucide-list" title="暂无流水" description="该用户还没有积分变动记录。" />
        <div v-else class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="text-left text-xs text-zinc-500">
              <tr>
                <th class="w-[1%] whitespace-nowrap py-2">时间</th>
                <th class="w-[1%] whitespace-nowrap py-2">类型</th>
                <th class="w-[1%] whitespace-nowrap py-2">数量</th>
                <th class="min-w-0 w-full py-2 text-left">原因</th>
                <th class="w-[1%] whitespace-nowrap py-2">操作人</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in currentLogs" :key="item.id">
                <td class="w-[1%] whitespace-nowrap py-2 text-zinc-500">{{ item.createdAt }}</td>
                <td class="w-[1%] whitespace-nowrap py-2">{{ item.type === 'add' ? '补发' : '扣减' }}</td>
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
