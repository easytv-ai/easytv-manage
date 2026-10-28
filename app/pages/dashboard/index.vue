<script setup lang="ts">
import { stats as statsApi } from '~/api/stats'
import { isOk, parsePaged } from '~/api/creative'
import { adminPartnerApi } from '~/api/partner'

const { t } = useI18n()
useHead({ title: () => t('dashboard.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const { notify } = useNotifyToast()

type ChannelPaid = {
  paid_today: number
  money_today: number
  paid_month: number
  money_month: number
}
type ChannelRecharge = {
  count_today: number
  money_today: number
  count_month: number
  money_month: number
}
type Stats = {
  users: { total: number, today: number, members: number }
  content: { works_published: number, projects: number, canvases: number, assets: number, skills: number }
  tasks: { total: number, today: number, running: number, succeeded: number, failed: number }
  points: { consumed_today: number, consumed_month: number, granted_month: number }
  orders: {
    paid_today: number
    money_today: number
    paid_month: number
    money_month: number
    pending: number
    refunded_month: number
    refunded_money_month: number
    wechat?: ChannelPaid
    alipay?: ChannelPaid
  }
  recharge?: { wechat?: ChannelRecharge, alipay?: ChannelRecharge }
  daily: { day: string, users: number, tasks: number, money: number }[]
}

/** 增长漏斗（T3）：GET /admin/stats/funnel */
type FunnelDay = { day: string, register: number, first_task: number, first_video: number, first_work: number, pay_success: number }
type FunnelSource = { source: string, aff_code: string, bonus_code: string, register: number, paid: number, amount: number }
type FunnelData = { from: number, to: number, days: FunnelDay[], by_source: FunnelSource[] }

function emptyPaid(): ChannelPaid {
  return { paid_today: 0, money_today: 0, paid_month: 0, money_month: 0 }
}
function emptyRecharge(): ChannelRecharge {
  return { count_today: 0, money_today: 0, count_month: 0, money_month: 0 }
}

const loading = ref(true)
const data = ref<Stats | null>(null)

const fetchStats = useClientListFetch(async () => {
  loading.value = true
  try {
    const raw = await statsApi.overview()
    if (!isOk(raw) || !raw.data?.users) {
      notify(raw?.message ?? t('dashboard.loadFail'), 'error')
      return
    }
    data.value = raw.data as Stats
  }
  finally {
    loading.value = false
  }
})

/** 渠道伙伴卡片（T34）：只用 /admin/partner 的 total，不引入不存在的聚合接口 */
const partnerStats = ref<{ approved: number, pending: number } | null>(null)
async function loadPartnerStats() {
  try {
    const [approvedRaw, pendingRaw] = await Promise.all([
      adminPartnerApi.list({ page: 1, page_size: 1, status: 1 }),
      adminPartnerApi.list({ page: 1, page_size: 1, status: 0 }),
    ])
    const approved = parsePaged(approvedRaw)
    const pending = parsePaged(pendingRaw)
    if (!approved || !pending)
      return
    partnerStats.value = { approved: approved.total, pending: pending.total }
  }
  catch {
    // 伙伴统计失败不影响看板其他卡片
  }
}

onMounted(() => {
  void fetchStats()
  void loadFunnel()
  void loadPartnerStats()
})

function dateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const funnelLoading = ref(false)
const funnel = ref<FunnelData | null>(null)
const funnelForm = reactive({
  from: dateInput(new Date(Date.now() - 13 * 86400 * 1000)),
  to: dateInput(new Date()),
  source: '',
})

async function loadFunnel() {
  if (funnelLoading.value)
    return
  funnelLoading.value = true
  try {
    const from = Math.floor(Date.parse(`${funnelForm.from}T00:00:00`) / 1000)
    const to = Math.floor(Date.parse(`${funnelForm.to}T23:59:59`) / 1000)
    const query: { from?: number, to?: number, source?: string } = {}
    if (Number.isFinite(from) && from > 0)
      query.from = from
    if (Number.isFinite(to) && to > 0)
      query.to = to
    if (funnelForm.source.trim())
      query.source = funnelForm.source.trim()
    const raw = await statsApi.funnel(query)
    if (!isOk(raw) || !raw.data?.days) {
      notify(raw?.message ?? t('dashboard.funnelLoadFail'), 'error')
      return
    }
    funnel.value = raw.data as FunnelData
  }
  finally {
    funnelLoading.value = false
  }
}

const FUNNEL_STEPS = ['register', 'first_task', 'first_video', 'first_work', 'pay_success'] as const
type FunnelStep = typeof FUNNEL_STEPS[number]

/** 漏斗汇总：每步人数与相对上一步的转化率 */
const funnelSteps = computed(() => {
  const days = funnel.value?.days ?? []
  const sum = (k: FunnelStep) => days.reduce((acc, d) => acc + (Number(d[k]) || 0), 0)
  let prev = 0
  return FUNNEL_STEPS.map((key, i) => {
    const value = sum(key)
    const rate = i === 0 ? null : prev > 0 ? Math.round((value / prev) * 1000) / 10 : 0
    prev = value
    return { key, value, rate }
  })
})

const pct = (v: number | null) => v == null ? '' : `${v}%`
const sourceName = (s: FunnelSource) => s.source || s.aff_code || s.bonus_code ? [s.source, s.aff_code, s.bonus_code].filter(Boolean).join(' · ') : t('dashboard.funnelDirect')

const money = (v: number) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const num = (v: number) => (Number(v) || 0).toLocaleString()

const cards = computed(() => {
  const d = data.value
  if (!d)
    return []
  return [
    { title: t('dashboard.incomeToday'), value: money(d.orders.money_today), sub: t('dashboard.incomeTodaySub', { count: d.orders.paid_today, money: money(d.orders.money_month), monthCount: d.orders.paid_month }), to: { path: '/order', query: { status: 'paid' } }, icon: 'i-lucide-banknote', color: 'text-emerald-600' },
    { title: t('dashboard.genToday'), value: num(d.tasks.today), sub: t('dashboard.genTodaySub', { running: d.tasks.running, succeeded: num(d.tasks.succeeded), failed: num(d.tasks.failed) }), to: { path: '/task' }, icon: 'i-lucide-sparkles', color: 'text-blue-600' },
    { title: t('dashboard.pointsToday'), value: num(d.points.consumed_today), sub: t('dashboard.pointsTodaySub', { consumed: num(d.points.consumed_month), granted: num(d.points.granted_month) }), to: { path: '/wallet' }, icon: 'i-lucide-coins', color: 'text-amber-600' },
    { title: t('dashboard.users'), value: num(d.users.total), sub: t('dashboard.usersSub', { today: d.users.today, members: d.users.members }), to: { path: '/user' }, icon: 'i-lucide-users', color: 'text-violet-600' },
    { title: t('dashboard.works'), value: num(d.content.works_published), sub: t('dashboard.worksSub', { projects: num(d.content.projects), canvases: num(d.content.canvases), assets: num(d.content.assets) }), to: { path: '/work' }, icon: 'i-lucide-clapperboard', color: 'text-pink-600' },
    { title: t('dashboard.pendingOrders'), value: num(d.orders.pending), sub: t('dashboard.pendingOrdersSub', { skills: d.content.skills }), to: { path: '/order', query: { status: 'pending' } }, icon: 'i-lucide-receipt', color: 'text-zinc-500' },
    { title: t('dashboard.refundMonth'), value: money(d.orders.refunded_money_month), sub: t('dashboard.refundMonthSub', { count: d.orders.refunded_month }), to: { path: '/order', query: { status: 'refunded' } }, icon: 'i-lucide-undo-2', color: 'text-rose-600' },
    { title: t('dashboard.partners'), value: num(partnerStats.value?.approved ?? 0), sub: t('dashboard.partnersSub', { pending: num(partnerStats.value?.pending ?? 0) }), to: { path: '/partner' }, icon: 'i-lucide-handshake', color: 'text-teal-600' },
  ]
})

const channels = computed(() => {
  const d = data.value
  if (!d)
    return []
  return [
    {
      key: 'wechat',
      name: t('dashboard.wechatPay'),
      icon: 'i-lucide-smartphone',
      color: 'text-emerald-600',
      order: d.orders.wechat ?? emptyPaid(),
      recharge: d.recharge?.wechat ?? emptyRecharge(),
    },
    {
      key: 'alipay',
      name: t('dashboard.alipay'),
      icon: 'i-lucide-wallet',
      color: 'text-blue-600',
      order: d.orders.alipay ?? emptyPaid(),
      recharge: d.recharge?.alipay ?? emptyRecharge(),
    },
  ]
})

/** 近 14 天柱状图：三列各自按最大值归一 */
const dailyBars = computed(() => {
  const days = data.value?.daily ?? []
  const max = (k: 'users' | 'tasks' | 'money') => Math.max(1, ...days.map(d => Number(d[k]) || 0))
  const mu = max('users')
  const mt = max('tasks')
  const mm = max('money')
  return days.map(d => ({
    ...d,
    hUsers: Math.round((d.users / mu) * 100),
    hTasks: Math.round((d.tasks / mt) * 100),
    hMoney: Math.round((d.money / mm) * 100),
  }))
})
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('dashboard.title')" :page-description="t('dashboard.description')">
      <template #actions>
        <UButton type="button" variant="outline" icon="i-lucide-refresh-cw" :loading="loading" @click="fetchStats(`r-${Date.now()}`)">{{ t('dashboard.refresh') }}</UButton>
      </template>
    </ManagePageHeader>

    <div v-if="loading && !data" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
      <span class="text-sm">{{ t('common.loading') }}</span>
    </div>

    <template v-else-if="data">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="card in cards"
          :key="card.title"
          :to="localePath(card.to)"
          class="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
        >
          <div class="flex items-center justify-between text-sm text-zinc-500">
            <span>{{ card.title }}</span>
            <UIcon :name="card.icon" class="size-5" :class="card.color" />
          </div>
          <p class="mt-3 text-3xl font-semibold tabular-nums">{{ card.value }}</p>
          <p class="mt-2 text-xs text-zinc-500">{{ card.sub }}</p>
        </NuxtLink>
      </div>

      <div class="mt-6">
        <h2 class="mb-3 text-sm font-semibold">{{ t('dashboard.channels') }}</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <NuxtLink
            v-for="ch in channels"
            :key="ch.key"
            :to="localePath({ path: '/order', query: { status: 'paid' } })"
            class="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <div class="flex items-center justify-between text-sm text-zinc-500">
              <span>{{ ch.name }}</span>
              <UIcon :name="ch.icon" class="size-5" :class="ch.color" />
            </div>
            <p class="mt-3 text-3xl font-semibold tabular-nums">{{ money(ch.order.money_today) }}</p>
            <p class="mt-2 text-xs text-zinc-500">{{ t('dashboard.channelOrder', { count: ch.order.paid_today, money: money(ch.order.money_month), monthCount: ch.order.paid_month }) }}</p>
            <p class="mt-1 text-xs text-zinc-400">{{ t('dashboard.channelRecharge', { money: money(ch.recharge.money_today), count: ch.recharge.count_today, monthMoney: money(ch.recharge.money_month), monthCount: ch.recharge.count_month }) }}</p>
          </NuxtLink>
        </div>
      </div>

      <div class="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">{{ t('dashboard.funnelTitle') }}</h2>
            <p class="mt-0.5 text-xs text-zinc-500">{{ t('dashboard.funnelDesc') }}</p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <UInput v-model="funnelForm.from" type="date" size="sm" class="w-36" />
            <span class="pb-1.5 text-xs text-zinc-400">–</span>
            <UInput v-model="funnelForm.to" type="date" size="sm" class="w-36" />
            <UInput v-model="funnelForm.source" size="sm" class="w-36" :placeholder="t('dashboard.funnelSourcePh')" @keyup.enter="loadFunnel" />
            <UButton type="button" size="sm" :loading="funnelLoading" @click="loadFunnel">{{ t('common.search') }}</UButton>
          </div>
        </div>

        <div v-if="funnelLoading && !funnel" class="flex min-h-40 items-center justify-center text-zinc-500">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
        <template v-else-if="funnel">
          <div class="grid gap-3 sm:grid-cols-5">
            <div
              v-for="(step, i) in funnelSteps"
              :key="step.key"
              class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div class="text-xs text-zinc-500">{{ t(`dashboard.funnelStep.${step.key}`) }}</div>
              <p class="mt-2 text-2xl font-semibold tabular-nums">{{ num(step.value) }}</p>
              <p class="mt-1 text-xs tabular-nums" :class="i === 0 ? 'text-zinc-400' : 'text-emerald-600'">
                {{ i === 0 ? t('dashboard.funnelBase') : t('dashboard.funnelRate', { rate: pct(step.rate) }) }}
              </p>
            </div>
          </div>

          <div class="mt-5 grid gap-5 xl:grid-cols-2">
            <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th class="px-3 py-2">{{ t('dashboard.funnelColDay') }}</th>
                    <th v-for="key in FUNNEL_STEPS" :key="key" class="whitespace-nowrap px-3 py-2 text-right">{{ t(`dashboard.funnelStep.${key}`) }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <tr v-if="!funnel.days.length">
                    <td colspan="6" class="px-3 py-6 text-center text-zinc-400">{{ t('dashboard.funnelEmpty') }}</td>
                  </tr>
                  <tr v-for="d in funnel.days" :key="d.day" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                    <td class="whitespace-nowrap px-3 py-2 font-mono text-xs">{{ d.day }}</td>
                    <td v-for="key in FUNNEL_STEPS" :key="key" class="px-3 py-2 text-right tabular-nums">{{ d[key] || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th class="px-3 py-2">{{ t('dashboard.funnelColSource') }}</th>
                    <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('dashboard.funnelStep.register') }}</th>
                    <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('dashboard.funnelColPaid') }}</th>
                    <th class="whitespace-nowrap px-3 py-2 text-right">{{ t('dashboard.funnelColAmount') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <tr v-if="!funnel.by_source.length">
                    <td colspan="4" class="px-3 py-6 text-center text-zinc-400">{{ t('dashboard.funnelEmpty') }}</td>
                  </tr>
                  <tr v-for="(s, i) in funnel.by_source" :key="i" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                    <td class="max-w-64 truncate px-3 py-2" :title="sourceName(s)">
                      <span>{{ sourceName(s) }}</span>
                      <span v-if="s.aff_code" class="ml-1 text-xs text-zinc-400">{{ t('dashboard.funnelAff') }}</span>
                      <span v-if="s.bonus_code" class="ml-1 text-xs text-zinc-400">{{ t('dashboard.funnelBonus') }}</span>
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">{{ num(s.register) }}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{{ num(s.paid) }}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{{ money(s.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <div class="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-semibold">{{ t('dashboard.last14') }}</h2>
          <div class="flex gap-4 text-xs text-zinc-500">
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-emerald-500" />{{ t('dashboard.legendIncome') }}</span>
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-blue-500" />{{ t('dashboard.legendGen') }}</span>
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-violet-500" />{{ t('dashboard.legendUsers') }}</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <div class="flex min-w-[640px] items-end gap-2" style="height: 180px;">
            <UTooltip
              v-for="d in dailyBars"
              :key="d.day"
              :delay-duration="0"
              :content="{ side: 'bottom', sideOffset: 4 }"
              :ui="{ content: 'h-auto max-w-56 whitespace-normal px-2.5 py-2 text-left' }"
            >
              <div class="group flex min-w-0 flex-1 flex-col items-center gap-1">
                <div class="flex h-[150px] w-full items-end justify-center gap-[2px] rounded-md group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900">
                  <div class="w-1/3 rounded-t bg-emerald-500/80" :style="{ height: `${d.hMoney}%` }" />
                  <div class="w-1/3 rounded-t bg-blue-500/80" :style="{ height: `${d.hTasks}%` }" />
                  <div class="w-1/3 rounded-t bg-violet-500/80" :style="{ height: `${d.hUsers}%` }" />
                </div>
                <span class="text-[10px] text-zinc-500">{{ d.day }}</span>
              </div>
              <template #content>
                <div class="text-[11px] leading-5">
                  <p class="font-medium">{{ d.day }}</p>
                  <p class="flex items-center gap-1.5"><i class="inline-block size-2 rounded-sm bg-emerald-500" />{{ t('dashboard.legendIncome') }} {{ money(d.money) }}</p>
                  <p class="flex items-center gap-1.5"><i class="inline-block size-2 rounded-sm bg-blue-500" />{{ t('dashboard.legendGen') }} {{ num(d.tasks) }}</p>
                  <p class="flex items-center gap-1.5"><i class="inline-block size-2 rounded-sm bg-violet-500" />{{ t('dashboard.legendUsers') }} {{ num(d.users) }}</p>
                </div>
              </template>
            </UTooltip>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
