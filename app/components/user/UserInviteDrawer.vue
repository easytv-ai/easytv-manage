<script setup lang="ts">
import type { AdminUser } from '~/types/easytv-admin'
import userApi from '~/api/user'
import { formatUnix } from '~/api/creative'
import { isApiSuccess } from '~/utils/admin-user'

/**
 * 用户邀请关系抽屉：该用户邀请的人、返利流水，Root 可冻结 / 解冻邀请奖励。
 * 数据：GET /admin/user/:id/invites → { totals, records, bills, bills_total, invite_blocked }
 */

interface InviteTotals { invited: number, effective: number, points_total: number, rebate_points: number }
interface InviteRecord { user_id: number, nickname: string, status: 'registered' | 'effective' | 'paid', points: number, created_at: number }
interface PromoterBill { id: number, biz_type: number, amount: number, from_user_id: number, source_no: string, source_amount: number, rate: number, status: number, created_at: number, remark: string }

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ user: AdminUser | null }>()
const emit = defineEmits<{ blockChanged: [userId: number, blocked: boolean] }>()

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()

const loading = ref(false)
const totals = ref<InviteTotals>({ invited: 0, effective: 0, points_total: 0, rebate_points: 0 })
const records = ref<InviteRecord[]>([])
const bills = ref<PromoterBill[]>([])
const billsTotal = ref(0)
const blocked = ref(false)
const blockSaving = ref(false)
const affCode = computed(() => props.user?.affCode || '')

const STATUS_LABEL: Record<InviteRecord['status'], { text: string, color: 'neutral' | 'success' | 'primary' }> = {
  registered: { text: '已注册', color: 'neutral' },
  effective: { text: '已生效', color: 'success' },
  paid: { text: '已付费', color: 'primary' },
}
const BIZ_LABEL: Record<number, string> = { 1: '注册返', 2: '充值返', 6: '返利作废' }

async function load() {
  if (!props.user)
    return
  loading.value = true
  try {
    const raw = await userApi.invites(props.user.id, { page: 1, page_size: 50 })
    if (!isApiSuccess(raw) || !raw?.data) {
      notify(raw?.message ?? '邀请信息加载失败', 'error')
      return
    }
    const d = raw.data
    totals.value = { invited: 0, effective: 0, points_total: 0, rebate_points: 0, ...(d.totals ?? {}) }
    records.value = Array.isArray(d.records) ? d.records : []
    bills.value = Array.isArray(d.bills) ? d.bills : []
    billsTotal.value = Number(d.bills_total) || 0
    blocked.value = Boolean(d.invite_blocked)
  }
  finally {
    loading.value = false
  }
}

watch(open, (visible) => {
  if (visible)
    void load()
})

async function toggleBlock() {
  if (!props.user || blockSaving.value)
    return
  const next = !blocked.value
  blockSaving.value = true
  try {
    const raw = await userApi.setInviteBlock(props.user.id, next)
    if (!isApiSuccess(raw)) {
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    blocked.value = next
    emit('blockChanged', props.user.id, next)
    notify(next ? '已冻结该用户的邀请奖励' : '已恢复该用户的邀请奖励')
  }
  finally {
    blockSaving.value = false
  }
}

const num = (v: number) => (Number(v) || 0).toLocaleString()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="`邀请关系${user ? ` — ${user.nickname}` : ''}`"
    :description="affCode ? `邀请码 ${affCode}` : undefined"
    :ui="{ content: 'w-[min(96vw,40rem)] max-w-none' }"
  >
    <template #body>
      <div v-if="loading" class="flex min-h-40 items-center justify-center text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
      </div>
      <div v-else class="space-y-6">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">已邀请</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.invited) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">已生效</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.effective) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">累计积分</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.points_total) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">首充返利积分</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.rebate_points) }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-200 p-3 dark:border-zinc-800">
          <div>
            <div class="text-sm font-medium">
              邀请奖励
              <UBadge :color="blocked ? 'warning' : 'success'" variant="subtle" class="ml-1">{{ blocked ? '已冻结' : '正常' }}</UBadge>
            </div>
            <p class="mt-0.5 text-xs text-zinc-500">冻结后该用户作为邀请人或被邀请人都不再发放奖励，已绑定关系保留。</p>
          </div>
          <UButton
            v-if="isSuperAdmin"
            type="button"
            size="sm"
            :color="blocked ? 'success' : 'warning'"
            variant="soft"
            :loading="blockSaving"
            :disabled="blockSaving"
            @click="toggleBlock"
          >
            {{ blocked ? '解冻奖励' : '冻结奖励' }}
          </UButton>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold">邀请的人</h3>
          <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th class="px-3 py-2">用户</th>
                  <th class="whitespace-nowrap px-3 py-2">状态</th>
                  <th class="whitespace-nowrap px-3 py-2 text-right">奖励积分</th>
                  <th class="whitespace-nowrap px-3 py-2">注册时间</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr v-if="!records.length">
                  <td colspan="4" class="px-3 py-6 text-center text-zinc-400">还没有邀请到任何人</td>
                </tr>
                <tr v-for="r in records" :key="r.user_id">
                  <td class="px-3 py-2">
                    <span>{{ r.nickname || '—' }}</span>
                    <span class="ml-1 font-mono text-xs text-zinc-400">#{{ r.user_id }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2">
                    <UBadge :color="STATUS_LABEL[r.status]?.color ?? 'neutral'" variant="subtle">{{ STATUS_LABEL[r.status]?.text ?? r.status }}</UBadge>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ r.points || '—' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ formatUnix(r.created_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold">返利流水 <span class="font-normal text-zinc-400">{{ billsTotal ? `共 ${billsTotal} 条` : '' }}</span></h3>
          <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th class="whitespace-nowrap px-3 py-2">类型</th>
                  <th class="whitespace-nowrap px-3 py-2 text-right">积分</th>
                  <th class="whitespace-nowrap px-3 py-2">来源用户</th>
                  <th class="whitespace-nowrap px-3 py-2">基数 / 比例</th>
                  <th class="whitespace-nowrap px-3 py-2">时间</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr v-if="!bills.length">
                  <td colspan="5" class="px-3 py-6 text-center text-zinc-400">暂无返利流水</td>
                </tr>
                <tr v-for="b in bills" :key="b.id" :class="b.status === 3 ? 'text-zinc-400 line-through' : ''">
                  <td class="whitespace-nowrap px-3 py-2">{{ BIZ_LABEL[b.biz_type] ?? b.biz_type }}</td>
                  <td class="px-3 py-2 text-right tabular-nums" :class="b.amount < 0 ? 'text-rose-600' : ''">{{ b.amount > 0 ? `+${num(b.amount)}` : num(b.amount) }}</td>
                  <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">{{ b.from_user_id ? `#${b.from_user_id}` : '—' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ b.source_amount ? `¥${b.source_amount} × ${b.rate}` : '—' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ formatUnix(b.created_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
