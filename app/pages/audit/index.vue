<script setup lang="ts">
import { adminAuditApi } from '~/api/audit'
import { formatUnix, parsePaged } from '~/api/creative'
import { SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'
import { localInputToTs } from '~/utils/datetime-input'

const { t } = useI18n()
useHead({ title: () => t('audit.pageTitle') })
definePageMeta({ layout: 'console' })

const localePath = useLocalePath()
const route = useRoute()
const { notify } = useNotifyToast()

type AuditRow = {
  id: number
  eventId: string
  userId: number
  username: string
  actorRole: number
  createdAt: string
  category: string
  action: string
  ip: string
  userAgent: string
  method: string
  route: string
  status: number
  success: boolean
  requestId: string
  content: string
  params: Record<string, unknown> | null
  device: string
  payload: unknown
}

const CATEGORY_LABEL = computed<Record<string, string>>(() => ({
  login: t('audit.catAuth'),
  usage: t('audit.catFeature'),
  operation: t('audit.catAdmin'),
  security: t('audit.catSecurity'),
}))
const ROLE_LABEL = computed<Record<number, string>>(() => ({
  1: t('user.roleUser'),
  10: t('common.admin'),
  100: t('common.superAdmin'),
}))
const paramLabel = computed<Record<string, string>>(() => ({
  email: t('audit.paramEmail'),
  mobile: t('audit.actSms'),
  points_earned: t('audit.paramPoints'),
  amount: t('common.amount'),
  trade_no: t('audit.paramTrade'),
  payment_method: t('audit.actPayMethod'),
  task_id: t('audit.paramTask'),
  model: t('common.model'),
  type: t('audit.paramType'),
  provider: t('audit.paramProvider'),
  task_no: t('audit.paramTaskNo'),
  cost_points: t('audit.paramCost'),
  id: t('audit.paramTarget'),
  key: t('audit.paramSetting'),
  method: t('audit.paramMethod'),
  route: t('audit.paramRoute'),
}))

const DRAFT_DEFAULT = {
  username: '',
  userId: '',
  category: SELECT_ITEM_ALL as string,
  action: '',
  startAt: '',
  endAt: '',
  success: SELECT_ITEM_ALL as string,
}

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AuditRow[]>([])
const draft = reactive({ ...DRAFT_DEFAULT })
const applied = ref({ ...draft })
const detailOpen = ref(false)
const detailItem = ref<AuditRow | null>(null)

const pageRows = computed(() => rows.value)
const categoryItems = computed(() => [
  { label: t('audit.allCategories'), value: SELECT_ITEM_ALL },
  { label: CATEGORY_LABEL.value.login, value: 'login' },
  { label: CATEGORY_LABEL.value.usage, value: 'usage' },
  { label: CATEGORY_LABEL.value.operation, value: 'operation' },
  { label: CATEGORY_LABEL.value.security, value: 'security' },
])
const successItems = computed(() => [
  { label: t('audit.allResults'), value: SELECT_ITEM_ALL },
  { label: t('common.success'), value: 'true' },
  { label: t('common.fail'), value: 'false' },
])

function categoryLabel(category: string) {
  return CATEGORY_LABEL.value[category] || category || '—'
}

function categoryColor(category: string) {
  if (category === 'login')
    return 'info'
  if (category === 'usage')
    return 'success'
  if (category === 'operation')
    return 'warning'
  if (category === 'security')
    return 'error'
  return 'neutral'
}

function roleLabel(role: number) {
  return ROLE_LABEL.value[role] || `${t('audit.role')} ${role}`
}

function paramLabel(key: string) {
  return paramLabel.value[key] || key
}

function formatParamValue(value: unknown) {
  if (value == null || value === '')
    return '—'
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

function paramEntries(params: Record<string, unknown> | null | undefined) {
  if (!params || typeof params !== 'object')
    return []
  return Object.entries(params)
}

function toRow(item: any): AuditRow {
  const op = item?.other?.op
  const params = op?.params && typeof op.params === 'object' ? op.params : null
  return {
    id: Number(item.id) || 0,
    eventId: item.event_id || '',
    userId: Number(item.user_id) || 0,
    username: item.username || (item.user_id ? `#${item.user_id}` : '—'),
    actorRole: Number(item.actor_role) || 0,
    createdAt: formatUnix(item.created_at),
    category: item.category || '',
    action: item.action || '',
    ip: item.ip || '',
    userAgent: item.user_agent || '',
    method: item.method || '',
    route: item.route || '',
    status: Number(item.status) || 0,
    success: !!item.success,
    requestId: item.request_id || '',
    content: item.content || '',
    params,
    device: item?.other?.device || '',
    payload: item?.other?.payload ?? null,
  }
}

function buildQuery() {
  const query: Record<string, unknown> = {
    page: page.value,
    page_size: pageSize.value,
  }
  const username = applied.value.username.trim()
  if (username)
    query.username = username
  const userId = Number(applied.value.userId)
  if (Number.isInteger(userId) && userId > 0)
    query.user_id = userId
  if (applied.value.category !== SELECT_ITEM_ALL)
    query.category = applied.value.category
  const action = applied.value.action.trim()
  if (action)
    query.action = action
  const startTs = localInputToTs(applied.value.startAt)
  if (startTs)
    query.start_timestamp = startTs
  const endTs = localInputToTs(applied.value.endAt)
  if (endTs)
    query.end_timestamp = endTs
  if (applied.value.success === 'true')
    query.success = true
  else if (applied.value.success === 'false')
    query.success = false
  return query
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminAuditApi.list(buildQuery())
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify((raw as any)?.message ?? t('audit.loadFail'), 'error')
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
  const userId = String(route.query.userId || '')
  const username = String(route.query.username || '')
  const category = String(route.query.category || '')
  const action = String(route.query.action || '')
  const success = String(route.query.success || '')
  if (userId)
    draft.userId = userId
  if (username)
    draft.username = username
  if (CATEGORY_LABEL.value[category])
    draft.category = category
  if (action)
    draft.action = action
  if (success === 'true' || success === 'false')
    draft.success = success
  if (userId || username || CATEGORY_LABEL.value[category] || action || success === 'true' || success === 'false')
    applied.value = { ...draft }
  void fetchList()
})

watch([page, pageSize], ([, size]: [number, number], [, prevSize]: [number, number]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  const startTs = localInputToTs(draft.startAt)
  const endTs = localInputToTs(draft.endAt)
  if (startTs && endTs && startTs > endTs) {
    notify(t('common.startAfterEnd'), 'error')
    return
  }
  applied.value = {
    ...draft,
    username: draft.username.trim(),
    userId: draft.userId.trim(),
    action: draft.action.trim(),
  }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, DRAFT_DEFAULT)
  search()
}

function openDetail(item: AuditRow) {
  detailItem.value = item
  detailOpen.value = true
}

function gotoUser(userId: number) {
  if (!userId)
    return
  return navigateTo(localePath({ path: '/user', query: { keyword: String(userId) } }))
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('audit.title')" :page-description="t('audit.description')" />

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.username')">
          <UInput icon="i-lucide-search" v-model="draft.username" :placeholder="t('audit.usernameEnter')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.userId')">
          <UInput v-model="draft.userId" :placeholder="t('audit.userEnter')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('audit.logCategory')">
          <USelect v-model="draft.category" :items="categoryItems" value-key="value" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('audit.actionId')">
          <UInput v-model="draft.action" :placeholder="t('audit.actionIdPh')" class="w-full font-mono" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.startTime')">
          <UInput v-model="draft.startAt" type="datetime-local" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.endTime')">
          <UInput v-model="draft.endAt" type="datetime-local" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.result')">
          <USelect v-model="draft.success" :items="successItems" value-key="value" class="w-full" />
        </ManageFilterField>
    </ManageFilterBar>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-scroll-text" :title="t('audit.empty')" :description="t('audit.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('audit.colTime') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.username') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('audit.logCategory') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('audit.actionId') }}</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('audit.colDesc') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.result') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">IP</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <button
                    v-if="item.userId"
                    type="button"
                    class="inline-flex flex-col items-start rounded-md px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    @click="() => { void gotoUser(item.userId) }"
                  >
                    <span class="text-primary">{{ item.username }}</span>
                    <span class="font-mono text-xs text-zinc-400">#{{ item.userId }} · {{ roleLabel(item.actorRole) }}</span>
                  </button>
                  <span v-else class="text-zinc-400">{{ item.username }}</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="categoryColor(item.category)" variant="subtle">{{ categoryLabel(item.category) }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.action || '—' }}</td>
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="truncate" :title="item.content">{{ item.content || '—' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.success ? 'success' : 'error'" variant="subtle">{{ item.success ? t('common.success') : t('common.fail') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500">{{ item.ip || '—' }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openDetail(item)">{{ t('common.detail') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="detailOpen" :title="t('audit.detailTitle')" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <dl v-if="detailItem" class="grid gap-3 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.colTime') }}</dt>
            <dd>{{ detailItem.createdAt || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('common.username') }}</dt>
            <dd class="text-right">
              <UButton
                v-if="detailItem.userId"
                type="button"
                size="sm"
                variant="link"
                class="-mr-2"
                @click="() => { if (detailItem) void gotoUser(detailItem.userId) }"
              >
                {{ detailItem.username }}（{{ detailItem.userId }}）
              </UButton>
              <span v-else>{{ detailItem.username }}</span>
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.role') }}</dt>
            <dd>{{ roleLabel(detailItem.actorRole) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.logCategory') }}</dt>
            <dd>{{ categoryLabel(detailItem.category) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.actionId') }}</dt>
            <dd class="font-mono text-xs">{{ detailItem.action || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.colDesc') }}</dt>
            <dd class="text-right">{{ detailItem.content || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('common.result') }}</dt>
            <dd>{{ detailItem.success ? t('common.success') : t('common.fail') }}{{ detailItem.status ? `（${detailItem.status}）` : '' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.request') }}</dt>
            <dd class="text-right font-mono text-xs">{{ [detailItem.method, detailItem.route].filter(Boolean).join(' ') || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">IP</dt>
            <dd class="font-mono text-xs">{{ detailItem.ip || '—' }}</dd>
          </div>
          <div v-if="detailItem.userAgent">
            <dt class="mb-1 text-zinc-500">User-Agent</dt>
            <dd class="break-all rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">{{ detailItem.userAgent }}</dd>
          </div>
          <div v-if="detailItem.eventId" class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.eventId') }}</dt>
            <dd class="break-all text-right font-mono text-xs">{{ detailItem.eventId }}</dd>
          </div>
          <div v-if="detailItem.requestId" class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('audit.requestId') }}</dt>
            <dd class="break-all text-right font-mono text-xs">{{ detailItem.requestId }}</dd>
          </div>
          <div v-if="detailItem.device" class="flex justify-between gap-4">
            <dt class="shrink-0 text-zinc-500">{{ t('common.device') }}</dt>
            <dd>{{ detailItem.device }}</dd>
          </div>
          <div>
            <dt class="mb-1 text-zinc-500">{{ t('audit.params') }}</dt>
            <dd v-if="paramEntries(detailItem.params).length" class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
              <div
                v-for="[key, value] in paramEntries(detailItem.params)"
                :key="key"
                class="flex justify-between gap-4 py-1"
              >
                <span class="shrink-0 text-zinc-500">{{ paramLabel(key) }}</span>
                <span class="break-all text-right font-mono text-xs">{{ formatParamValue(value) }}</span>
              </div>
            </dd>
            <dd v-else class="text-zinc-400">{{ t('audit.noParams') }}</dd>
          </div>
          <div v-if="detailItem.payload != null">
            <dt class="mb-1 text-zinc-500">{{ t('audit.extraData') }}</dt>
            <dd class="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">{{ formatParamValue(detailItem.payload) }}</dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" @click="() => { detailOpen = false }">{{ t('common.close') }}</UButton>
      </template>
    </UModal>
  </div>
</template>
