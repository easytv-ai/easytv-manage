<script setup lang="ts">
import { stats as statsApi } from '~/api/stats'
import { formatUnix, isOk } from '~/api/creative'

/**
 * 创作指标（API.md 17）：按真实交付衡量——生成成功率、首次成片成功率、每镜重试、引用丢失、
 * 退款补偿积压、长时间无进展的任务。
 */
const { t } = useI18n()
useHead({ title: () => t('creationMetrics.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const { notify } = useNotifyToast()

type Pct = number | null
type TaskTypeStat = { type: string, total: number, succeeded: number, failed: number, cancelled: number, active: number, success_rate: Pct }
type Metrics = {
  from: number
  to: number
  days: number
  idle_minutes: number
  tasks: { total: number, succeeded: number, failed: number, cancelled: number, active: number, success_rate: Pct, timeout_failed: number, by_type: TaskTypeStat[] }
  compose: { jobs: number, done: number, failed: number, active: number, success_rate: Pct, first_users: number, first_succeeded: number, first_failed: number, first_success_rate: Pct, eventually_done: number, eventual_rate: Pct }
  retries: { nodes: number, tasks: number, avg_per_node: number, retried_nodes: number, retried_rate: Pct, buckets: { label: string, nodes: number }[], by_type: { type: string, nodes: number, tasks: number, avg_per_node: number }[] }
  ref_missing: { events: number, items: number, users: number, per_hundred_tasks: Pct, by_source: { source: string, events: number, items: number, users: number }[] }
  refund: { backlog_tasks: number, backlog_points: number, backlog_oldest: number, refunded_tasks: number, refunded_points: number }
  stuck: { tasks: number, compose_jobs: number, active_tasks: number, scan_limit_hit: boolean, items: { id: number, user_id: number, type: string, model: string, status: string, progress: number, created_at: number, last_at: number, idle_minutes: number }[] }
  failures: { models: { model: string, type: string, total: number, failed: number, fail_rate: Pct }[], errors: { message: string, count: number }[] }
  daily: { day: string, tasks: number, tasks_failed: number, compose: number, compose_done: number, compose_failed: number }[]
}

const DAY_OPTIONS = [7, 14, 30, 90]
const IDLE_OPTIONS = [5, 10, 30, 60]

const days = ref(7)
const idleMinutes = ref(10)
const loading = ref(false)
const data = ref<Metrics | null>(null)

async function load() {
  if (loading.value)
    return
  loading.value = true
  try {
    const raw = await statsApi.creation({ days: days.value, idle_minutes: idleMinutes.value })
    if (!isOk(raw) || !raw.data?.tasks) {
      notify(raw?.message ?? t('creationMetrics.loadFail'), 'error')
      return
    }
    data.value = raw.data as Metrics
  }
  finally {
    loading.value = false
  }
}

onMounted(load)
watch([days, idleMinutes], load)

const num = (v: number) => (Number(v) || 0).toLocaleString()
const pct = (v: Pct) => v == null ? '—' : `${v}%`
const typeLabel = (type: string) => t(`creationMetrics.type.${type}`, type)
const sourceLabel = (source: string) => t(`creationMetrics.source.${source}`, source)

/** 率类指标的颜色：低于阈值标红，便于一眼看出问题 */
function rateTone(v: Pct, warn: number, bad: number) {
  if (v == null)
    return 'text-zinc-400'
  if (v < bad)
    return 'text-rose-600'
  if (v < warn)
    return 'text-amber-600'
  return 'text-emerald-600'
}

const cards = computed(() => {
  const d = data.value
  if (!d)
    return []
  return [
    {
      key: 'task',
      title: t('creationMetrics.cardTaskSuccess'),
      value: pct(d.tasks.success_rate),
      tone: rateTone(d.tasks.success_rate, 90, 75),
      sub: t('creationMetrics.cardTaskSuccessSub', { total: num(d.tasks.total), failed: num(d.tasks.failed), timeout: num(d.tasks.timeout_failed) }),
      icon: 'i-lucide-sparkles',
    },
    {
      key: 'first',
      title: t('creationMetrics.cardFirstCompose'),
      value: pct(d.compose.first_success_rate),
      tone: rateTone(d.compose.first_success_rate, 85, 60),
      sub: t('creationMetrics.cardFirstComposeSub', { users: num(d.compose.first_users), eventual: pct(d.compose.eventual_rate) }),
      icon: 'i-lucide-clapperboard',
    },
    {
      key: 'retry',
      title: t('creationMetrics.cardRetries'),
      value: d.retries.nodes ? String(d.retries.avg_per_node) : '—',
      tone: 'text-zinc-900 dark:text-zinc-100',
      sub: t('creationMetrics.cardRetriesSub', { nodes: num(d.retries.nodes), rate: pct(d.retries.retried_rate) }),
      icon: 'i-lucide-repeat',
    },
    {
      key: 'ref',
      title: t('creationMetrics.cardRefMissing'),
      value: d.ref_missing.per_hundred_tasks == null ? '—' : String(d.ref_missing.per_hundred_tasks),
      tone: (d.ref_missing.per_hundred_tasks ?? 0) >= 5 ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-100',
      sub: t('creationMetrics.cardRefMissingSub', { events: num(d.ref_missing.events), users: num(d.ref_missing.users) }),
      icon: 'i-lucide-unlink',
    },
    {
      key: 'refund',
      title: t('creationMetrics.cardRefundBacklog'),
      value: num(d.refund.backlog_tasks),
      tone: d.refund.backlog_tasks > 0 ? 'text-rose-600' : 'text-emerald-600',
      sub: t('creationMetrics.cardRefundBacklogSub', { points: num(d.refund.backlog_points), refunded: num(d.refund.refunded_points), count: num(d.refund.refunded_tasks) }),
      icon: 'i-lucide-undo-2',
    },
    {
      key: 'stuck',
      title: t('creationMetrics.cardStuck', { n: d.idle_minutes }),
      value: num(d.stuck.tasks),
      tone: d.stuck.tasks > 0 ? 'text-amber-600' : 'text-emerald-600',
      sub: t('creationMetrics.cardStuckSub', { active: num(d.stuck.active_tasks), compose: num(d.stuck.compose_jobs) }),
      icon: 'i-lucide-hourglass',
    },
  ]
})

const dailyBars = computed(() => {
  const list = data.value?.daily ?? []
  const maxTasks = Math.max(1, ...list.map(d => d.tasks))
  const maxCompose = Math.max(1, ...list.map(d => d.compose))
  return list.map(d => ({
    ...d,
    hTasks: Math.round((d.tasks / maxTasks) * 100),
    hTasksFailed: d.tasks ? Math.round((d.tasks_failed / d.tasks) * 100) : 0,
    hCompose: Math.round((d.compose / maxCompose) * 100),
    hComposeFailed: d.compose ? Math.round((d.compose_failed / d.compose) * 100) : 0,
  }))
})

const bucketMax = computed(() => Math.max(1, ...(data.value?.retries.buckets ?? []).map(b => b.nodes)))
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('creationMetrics.title')" :page-description="t('creationMetrics.description')">
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <button
              v-for="n in DAY_OPTIONS"
              :key="n"
              type="button"
              class="px-3 py-1.5 text-xs"
              :class="days === n ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900'"
              @click="days = n"
            >
              {{ t('creationMetrics.lastDays', { n }) }}
            </button>
          </div>
          <USelect
            v-model="idleMinutes"
            size="sm"
            class="w-36"
            :items="IDLE_OPTIONS.map(n => ({ label: t('creationMetrics.idleOption', { n }), value: n }))"
          />
          <UButton type="button" variant="outline" size="sm" icon="i-lucide-refresh-cw" :loading="loading" @click="load">{{ t('dashboard.refresh') }}</UButton>
        </div>
      </template>
    </ManagePageHeader>

    <div v-if="loading && !data" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
      <span class="text-sm">{{ t('common.loading') }}</span>
    </div>

    <template v-else-if="data">
      <p class="mb-4 text-xs text-zinc-500">{{ t('creationMetrics.range', { from: formatUnix(data.from), to: formatUnix(data.to) }) }}</p>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="card in cards"
          :key="card.key"
          class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div class="flex items-center justify-between text-sm text-zinc-500">
            <span>{{ card.title }}</span>
            <UIcon :name="card.icon" class="size-5 text-zinc-400" />
          </div>
          <p class="mt-3 text-3xl font-semibold tabular-nums" :class="card.tone">{{ card.value }}</p>
          <p class="mt-2 text-xs text-zinc-500">{{ card.sub }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-5 xl:grid-cols-2">
        <!-- 分类型成功率 -->
        <section class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 class="text-sm font-semibold">{{ t('creationMetrics.byTypeTitle') }}</h2>
          <p class="mt-0.5 text-xs text-zinc-500">{{ t('creationMetrics.byTypeDesc') }}</p>
          <div class="mt-4 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-zinc-500">
                <tr>
                  <th class="py-2 pr-3">{{ t('creationMetrics.colType') }}</th>
                  <th class="px-3 py-2 text-right">{{ t('creationMetrics.colTotal') }}</th>
                  <th class="px-3 py-2 text-right">{{ t('creationMetrics.colSucceeded') }}</th>
                  <th class="px-3 py-2 text-right">{{ t('creationMetrics.colFailed') }}</th>
                  <th class="px-3 py-2 text-right">{{ t('creationMetrics.colCancelled') }}</th>
                  <th class="py-2 pl-3 text-right">{{ t('creationMetrics.colSuccessRate') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-900">
                <tr v-for="row in data.tasks.by_type" :key="row.type">
                  <td class="py-2 pr-3">
                    <NuxtLink :to="localePath({ path: '/task', query: { type: row.type, status: 'failed' } })" class="hover:underline">{{ typeLabel(row.type) }}</NuxtLink>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ num(row.total) }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ num(row.succeeded) }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ num(row.failed) }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{{ num(row.cancelled) }}</td>
                  <td class="py-2 pl-3 text-right font-medium tabular-nums" :class="rateTone(row.success_rate, 90, 75)">{{ pct(row.success_rate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-900">
            <div>
              <div class="text-zinc-500">{{ t('creationMetrics.composeJobs') }}</div>
              <div class="mt-1 text-lg font-semibold tabular-nums">{{ num(data.compose.jobs) }}</div>
            </div>
            <div>
              <div class="text-zinc-500">{{ t('creationMetrics.composeSuccess') }}</div>
              <div class="mt-1 text-lg font-semibold tabular-nums" :class="rateTone(data.compose.success_rate, 85, 60)">{{ pct(data.compose.success_rate) }}</div>
            </div>
            <div>
              <div class="text-zinc-500">{{ t('creationMetrics.composeFirst') }}</div>
              <div class="mt-1 tabular-nums">{{ t('creationMetrics.composeFirstDetail', { ok: num(data.compose.first_succeeded), fail: num(data.compose.first_failed), done: num(data.compose.eventually_done) }) }}</div>
            </div>
          </div>
        </section>

        <!-- 每镜重试分布 -->
        <section class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 class="text-sm font-semibold">{{ t('creationMetrics.retriesTitle') }}</h2>
          <p class="mt-0.5 text-xs text-zinc-500">{{ t('creationMetrics.retriesDesc') }}</p>
          <div class="mt-4 space-y-2">
            <div v-for="b in data.retries.buckets" :key="b.label" class="flex items-center gap-3 text-xs">
              <span class="w-14 shrink-0 text-zinc-500">{{ t('creationMetrics.bucket', { label: b.label }) }}</span>
              <div class="h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                <div class="h-full rounded bg-blue-500/80" :style="{ width: `${Math.round(b.nodes / bucketMax * 100)}%` }" />
              </div>
              <span class="w-12 shrink-0 text-right tabular-nums">{{ num(b.nodes) }}</span>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-900">
            <span v-for="row in data.retries.by_type" :key="row.type">
              {{ t('creationMetrics.retriesByType', { type: typeLabel(row.type), avg: row.avg_per_node, nodes: num(row.nodes) }) }}
            </span>
            <span v-if="!data.retries.by_type.length">{{ t('creationMetrics.empty') }}</span>
          </div>
        </section>

        <!-- 引用丢失 -->
        <section class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 class="text-sm font-semibold">{{ t('creationMetrics.refTitle') }}</h2>
          <p class="mt-0.5 text-xs text-zinc-500">{{ t('creationMetrics.refDesc') }}</p>
          <table class="mt-4 w-full text-sm">
            <thead class="text-left text-xs text-zinc-500">
              <tr>
                <th class="py-2 pr-3">{{ t('creationMetrics.colSource') }}</th>
                <th class="px-3 py-2 text-right">{{ t('creationMetrics.colEvents') }}</th>
                <th class="px-3 py-2 text-right">{{ t('creationMetrics.colItems') }}</th>
                <th class="py-2 pl-3 text-right">{{ t('creationMetrics.colUsers') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-900">
              <tr v-if="!data.ref_missing.by_source.length">
                <td colspan="4" class="py-6 text-center text-zinc-400">{{ t('creationMetrics.refEmpty') }}</td>
              </tr>
              <tr v-for="row in data.ref_missing.by_source" :key="row.source">
                <td class="py-2 pr-3">{{ sourceLabel(row.source) }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ num(row.events) }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ num(row.items) }}</td>
                <td class="py-2 pl-3 text-right tabular-nums">{{ num(row.users) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- 失败分布 -->
        <section class="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 class="text-sm font-semibold">{{ t('creationMetrics.failTitle') }}</h2>
          <p class="mt-0.5 text-xs text-zinc-500">{{ t('creationMetrics.failDesc') }}</p>
          <table class="mt-4 w-full text-sm">
            <thead class="text-left text-xs text-zinc-500">
              <tr>
                <th class="py-2 pr-3">{{ t('creationMetrics.colModel') }}</th>
                <th class="px-3 py-2 text-right">{{ t('creationMetrics.colFailed') }}</th>
                <th class="py-2 pl-3 text-right">{{ t('creationMetrics.colFailRate') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-900">
              <tr v-if="!data.failures.models.length">
                <td colspan="3" class="py-6 text-center text-zinc-400">{{ t('creationMetrics.failEmpty') }}</td>
              </tr>
              <tr v-for="row in data.failures.models" :key="`${row.type}-${row.model}`">
                <td class="py-2 pr-3">
                  <span class="font-mono text-xs">{{ row.model }}</span>
                  <span class="ml-1 text-xs text-zinc-400">{{ typeLabel(row.type) }}</span>
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{{ t('creationMetrics.failOfTotal', { failed: num(row.failed), total: num(row.total) }) }}</td>
                <td class="py-2 pl-3 text-right tabular-nums" :class="(row.fail_rate ?? 0) >= 25 ? 'text-rose-600' : ''">{{ pct(row.fail_rate) }}</td>
              </tr>
            </tbody>
          </table>
          <ul v-if="data.failures.errors.length" class="mt-4 space-y-1.5 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-900">
            <li v-for="(e, i) in data.failures.errors" :key="i" class="flex gap-3">
              <span class="w-8 shrink-0 text-right tabular-nums text-zinc-500">{{ num(e.count) }}</span>
              <span class="min-w-0 break-words text-zinc-700 dark:text-zinc-300">{{ e.message }}</span>
            </li>
          </ul>
        </section>
      </div>

      <!-- 长时间无进展 -->
      <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 class="text-sm font-semibold">{{ t('creationMetrics.stuckTitle', { n: data.idle_minutes }) }}</h2>
        <p class="mt-0.5 text-xs text-zinc-500">
          {{ t('creationMetrics.stuckDesc') }}
          <span v-if="data.stuck.scan_limit_hit" class="text-amber-600">{{ t('creationMetrics.stuckScanLimit') }}</span>
        </p>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="text-left text-xs text-zinc-500">
              <tr>
                <th class="py-2 pr-3">ID</th>
                <th class="px-3 py-2">{{ t('creationMetrics.colUser') }}</th>
                <th class="px-3 py-2">{{ t('creationMetrics.colModel') }}</th>
                <th class="px-3 py-2">{{ t('creationMetrics.colStatus') }}</th>
                <th class="px-3 py-2 text-right">{{ t('creationMetrics.colProgress') }}</th>
                <th class="px-3 py-2">{{ t('creationMetrics.colLastAt') }}</th>
                <th class="py-2 pl-3 text-right">{{ t('creationMetrics.colIdle') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-900">
              <tr v-if="!data.stuck.items.length">
                <td colspan="7" class="py-6 text-center text-zinc-400">{{ t('creationMetrics.stuckEmpty') }}</td>
              </tr>
              <tr v-for="row in data.stuck.items" :key="row.id">
                <td class="py-2 pr-3 font-mono text-xs">{{ row.id }}</td>
                <td class="px-3 py-2">
                  <NuxtLink :to="localePath({ path: '/task', query: { userId: String(row.user_id), status: row.status } })" class="hover:underline">{{ row.user_id }}</NuxtLink>
                </td>
                <td class="px-3 py-2">
                  <span class="font-mono text-xs">{{ row.model }}</span>
                  <span class="ml-1 text-xs text-zinc-400">{{ typeLabel(row.type) }}</span>
                </td>
                <td class="px-3 py-2 text-xs">{{ t(`creationMetrics.status.${row.status}`, row.status) }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ row.progress }}%</td>
                <td class="px-3 py-2 text-xs text-zinc-500">{{ formatUnix(row.last_at) }}</td>
                <td class="py-2 pl-3 text-right tabular-nums text-amber-600">{{ t('creationMetrics.minutes', { n: num(row.idle_minutes) }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 按天 -->
      <section class="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{{ t('creationMetrics.dailyTitle') }}</h2>
          <div class="flex gap-4 text-xs text-zinc-500">
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-blue-500" />{{ t('creationMetrics.legendTasks') }}</span>
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-violet-500" />{{ t('creationMetrics.legendCompose') }}</span>
            <span class="flex items-center gap-1"><i class="inline-block size-2 rounded-sm bg-rose-500" />{{ t('creationMetrics.legendFailed') }}</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <div class="flex items-end gap-2" :style="{ height: '180px', minWidth: `${Math.max(640, dailyBars.length * 28)}px` }">
            <UTooltip
              v-for="d in dailyBars"
              :key="d.day"
              :delay-duration="0"
              :content="{ side: 'bottom', sideOffset: 4 }"
              :ui="{ content: 'h-auto max-w-64 whitespace-normal px-2.5 py-2 text-left' }"
            >
              <div class="group flex min-w-0 flex-1 flex-col items-center gap-1">
                <div class="flex h-[150px] w-full items-end justify-center gap-[2px] rounded-md group-hover:bg-zinc-50 dark:group-hover:bg-zinc-900">
                  <div class="relative w-1/2 overflow-hidden rounded-t bg-blue-500/80" :style="{ height: `${d.hTasks}%` }">
                    <div class="absolute inset-x-0 top-0 bg-rose-500" :style="{ height: `${d.hTasksFailed}%` }" />
                  </div>
                  <div class="relative w-1/2 overflow-hidden rounded-t bg-violet-500/80" :style="{ height: `${d.hCompose}%` }">
                    <div class="absolute inset-x-0 top-0 bg-rose-500" :style="{ height: `${d.hComposeFailed}%` }" />
                  </div>
                </div>
                <span class="text-[10px] text-zinc-500">{{ d.day }}</span>
              </div>
              <template #content>
                <div class="text-[11px] leading-5">
                  <p class="font-medium">{{ d.day }}</p>
                  <p class="flex items-center gap-1.5"><i class="inline-block size-2 rounded-sm bg-blue-500" />{{ t('creationMetrics.legendTasks') }} {{ num(d.tasks) }}</p>
                  <p class="flex items-center gap-1.5"><i class="inline-block size-2 rounded-sm bg-rose-500" />{{ t('creationMetrics.tipFailed', { n: num(d.tasks_failed) }) }}</p>
                  <p class="flex items-center gap-1.5">
                    <i class="inline-block size-2 shrink-0 rounded-sm bg-violet-500" />
                    <span>{{ t('creationMetrics.legendCompose') }} {{ num(d.compose) }}<template v-if="d.compose"> {{ t('creationMetrics.barComposeDetail', { done: num(d.compose_done), failed: num(d.compose_failed) }) }}</template></span>
                  </p>
                </div>
              </template>
            </UTooltip>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
