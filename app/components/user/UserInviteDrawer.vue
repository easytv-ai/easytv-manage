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

const { t } = useI18n()
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

const STATUS_COLOR: Record<InviteRecord['status'], 'neutral' | 'success' | 'primary'> = {
  registered: 'neutral',
  effective: 'success',
  paid: 'primary',
}
function statusText(status: InviteRecord['status']) {
  if (status === 'registered')
    return t('user.stRegistered')
  if (status === 'effective')
    return t('user.stEffective')
  if (status === 'paid')
    return t('user.stPaid')
  return status
}
function bizText(type: number) {
  if (type === 1)
    return t('user.bizSignup')
  if (type === 2)
    return t('user.bizRecharge')
  if (type === 6)
    return t('user.bizRevoke')
  return String(type)
}

async function load() {
  if (!props.user)
    return
  loading.value = true
  try {
    const raw = await userApi.invites(props.user.id, { page: 1, page_size: 50 })
    if (!isApiSuccess(raw) || !raw?.data) {
      notify(raw?.message ?? t('user.inviteLoadFail'), 'error')
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
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    blocked.value = next
    emit('blockChanged', props.user.id, next)
    notify(next ? t('user.frozenOk') : t('user.unfrozenOk'))
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
    :title="user ? t('user.inviteTitle', { name: user.nickname }) : t('user.inviteTitleEmpty')"
    :description="affCode ? t('user.inviteCode', { code: affCode }) : undefined"
    :ui="{ content: 'w-[min(96vw,40rem)] max-w-none' }"
  >
    <template #body>
      <div v-if="loading" class="flex min-h-40 items-center justify-center text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
      </div>
      <div v-else class="space-y-6">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.invited') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.invited) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.effective') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.effective) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.pointsTotal') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.points_total) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.rebatePoints') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(totals.rebate_points) }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-200 p-3 dark:border-zinc-800">
          <div>
            <div class="text-sm font-medium">
              {{ t('user.inviteReward') }}
              <UBadge :color="blocked ? 'warning' : 'success'" variant="subtle" class="ml-1">{{ blocked ? t('user.frozen') : t('user.statusNormal') }}</UBadge>
            </div>
            <p class="mt-0.5 text-xs text-zinc-500">{{ t('user.freezeHint') }}</p>
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
            {{ blocked ? t('user.unfreeze') : t('user.freeze') }}
          </UButton>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold">{{ t('user.invitees') }}</h3>
          <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th class="px-3 py-2">{{ t('common.user') }}</th>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('common.status') }}</th>
                  <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('user.rewardPoints') }}</th>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('user.registeredAt') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr v-if="!records.length">
                  <td colspan="4" class="px-3 py-6 text-center text-zinc-400">{{ t('user.noInvitees') }}</td>
                </tr>
                <tr v-for="r in records" :key="r.user_id">
                  <td class="px-3 py-2">
                    <span>{{ r.nickname || '—' }}</span>
                    <span class="ml-1 font-mono text-xs text-zinc-400">#{{ r.user_id }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2">
                    <UBadge :color="STATUS_COLOR[r.status] ?? 'neutral'" variant="subtle">{{ statusText(r.status) }}</UBadge>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ r.points || '—' }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{{ formatUnix(r.created_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold">{{ t('user.rebateLog') }} <span class="font-normal text-zinc-400">{{ billsTotal ? t('user.rebateLogCount', { n: billsTotal }) : '' }}</span></h3>
          <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('common.type') }}</th>
                  <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('common.points') }}</th>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('user.fromUser') }}</th>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('user.baseRate') }}</th>
                  <th class="whitespace-nowrap px-3 py-2">{{ t('common.time') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr v-if="!bills.length">
                  <td colspan="5" class="px-3 py-6 text-center text-zinc-400">{{ t('user.noRebate') }}</td>
                </tr>
                <tr v-for="b in bills" :key="b.id" :class="b.status === 3 ? 'text-zinc-400 line-through' : ''">
                  <td class="whitespace-nowrap px-3 py-2">{{ bizText(b.biz_type) }}</td>
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
