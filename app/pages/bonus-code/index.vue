<script setup lang="ts">
import { adminBonusCodeApi, type BonusCodeItem, type BonusCodePayload, type BonusCodeStats } from '~/api/bonus-code'
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'
import { downloadBlob, localInputToTs, tsToLocalInput } from '~/utils/datetime-input'

const { t } = useI18n()
useHead({ title: () => t('bonusCode.pageTitle') })
definePageMeta({ layout: 'console', middleware: 'super-admin' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<BonusCodeItem[]>([])
const draft = reactive({ keyword: '', kind: '__all__', status: '__all__', partner: '' })
const applied = ref({ ...draft })

const kindItems = computed(() => [
  { label: t('common.allTypes'), value: '__all__' },
  { label: t('bonusCode.kind1'), value: '1' },
  { label: t('bonusCode.kind2'), value: '2' },
  { label: t('bonusCode.kind3'), value: '3' },
])
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.enabled'), value: '1' },
  { label: t('common.disabled'), value: '0' },
])
const formKindItems = computed(() => [
  { label: t('bonusCode.kind1'), value: 1 },
  { label: t('bonusCode.kind2'), value: 2 },
  { label: t('bonusCode.kind3'), value: 3 },
])
const kindLabel = (kind: number) => t(`bonusCode.kind${kind}`)

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.keyword.trim())
    q.keyword = applied.value.keyword.trim()
  if (applied.value.kind !== '__all__')
    q.kind = Number(applied.value.kind)
  if (applied.value.status !== '__all__')
    q.status = Number(applied.value.status)
  if (applied.value.partner.trim())
    q.partner = applied.value.partner.trim()
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminBonusCodeApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<BonusCodeItem>(raw)
    if (!paged) {
      notify(raw?.message ?? t('bonusCode.loadFail'), 'error')
      return
    }
    rows.value = paged.items
    total.value = paged.total
    selected.value = selected.value.filter(id => paged.items.some(item => item.id === id))
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
  applied.value = { ...draft }
  page.value = 1
}
function reset() {
  Object.assign(draft, { keyword: '', kind: '__all__', status: '__all__', partner: '' })
  search()
}

// ---- 选择与导出 ----
const selected = ref<number[]>([])
const selectedSet = computed(() => new Set(selected.value))
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(item => selectedSet.value.has(item.id)))
const someSelected = computed(() => !allSelected.value && rows.value.some(item => selectedSet.value.has(item.id)))
function toggleAll() {
  selected.value = allSelected.value ? [] : rows.value.map(item => item.id)
}
function toggleOne(id: number, checked: boolean) {
  selected.value = checked ? [...new Set([...selected.value, id])] : selected.value.filter(item => item !== id)
}
const exporting = ref(false)
async function exportSelected() {
  if (!selected.value.length || exporting.value)
    return
  exporting.value = true
  try {
    const blob = await adminBonusCodeApi.exportCsv(selected.value)
    downloadBlob(blob, `bonus-codes-${new Date().toISOString().slice(0, 10)}.csv`)
  }
  catch {
    notify(t('bonusCode.exportFail'), 'error')
  }
  finally {
    exporting.value = false
  }
}

// ---- 表单（新建 / 编辑 / 批量）----
type FormMode = 'create' | 'edit' | 'batch'
const formOpen = ref(false)
const formMode = ref<FormMode>('create')
const editing = ref<BonusCodeItem | null>(null)
const saving = ref(false)
const form = reactive({
  code: '',
  prefix: '',
  count: '20',
  kind: 2 as 1 | 2 | 3,
  partnerName: '',
  partnerUserId: '',
  bonusPoints: '',
  bonusValidDays: '30',
  firstRechargeRate: '',
  firstRechargeCapPoints: '',
  rewardValidDays: '30',
  memberDays: '',
  planCode: '',
  maxClaims: '',
  startsAt: '',
  expiresAt: '',
  status: true,
  remark: '',
})
const errors = reactive({ code: '', prefix: '', count: '', rate: '', benefit: '', range: '' })
const batchCodes = ref<string[]>([])

function resetForm() {
  Object.assign(form, {
    code: '', prefix: '', count: '20', kind: 2, partnerName: '', partnerUserId: '',
    bonusPoints: '', bonusValidDays: '30', firstRechargeRate: '', firstRechargeCapPoints: '', rewardValidDays: '30',
    memberDays: '', planCode: '', maxClaims: '', startsAt: '', expiresAt: '', status: true, remark: '',
  })
  Object.assign(errors, { code: '', prefix: '', count: '', rate: '', benefit: '', range: '' })
  batchCodes.value = []
}

function openCreate() {
  resetForm()
  formMode.value = 'create'
  editing.value = null
  formOpen.value = true
}
function openBatch() {
  resetForm()
  formMode.value = 'batch'
  editing.value = null
  formOpen.value = true
}
function openEdit(item: BonusCodeItem) {
  resetForm()
  formMode.value = 'edit'
  editing.value = item
  Object.assign(form, {
    code: item.code,
    kind: item.kind,
    partnerName: item.partner_name,
    partnerUserId: item.partner_user_id ? String(item.partner_user_id) : '',
    bonusPoints: item.bonus_points ? String(item.bonus_points) : '',
    bonusValidDays: String(item.bonus_valid_days || 30),
    firstRechargeRate: item.first_recharge_rate ? String(item.first_recharge_rate) : '',
    firstRechargeCapPoints: item.first_recharge_cap_points ? String(item.first_recharge_cap_points) : '',
    rewardValidDays: String(item.reward_valid_days ?? 30),
    memberDays: item.member_days ? String(item.member_days) : '',
    planCode: item.plan_code,
    maxClaims: item.max_claims ? String(item.max_claims) : '',
    startsAt: tsToLocalInput(item.starts_at),
    expiresAt: tsToLocalInput(item.expires_at),
    status: item.status === 1,
    remark: item.remark,
  })
  formOpen.value = true
}

const int = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

function validate() {
  Object.assign(errors, { code: '', prefix: '', count: '', rate: '', benefit: '', range: '' })
  if (formMode.value === 'create') {
    const code = form.code.trim()
    if (code.length < 3 || code.length > 32)
      errors.code = t('bonusCode.codeInvalid')
  }
  if (formMode.value === 'batch') {
    if (form.prefix.trim().length > 20)
      errors.prefix = t('bonusCode.prefixInvalid')
    const count = int(form.count)
    if (count < 1 || count > 500)
      errors.count = t('bonusCode.countInvalid')
  }
  const rate = Number(form.firstRechargeRate) || 0
  if (rate < 0 || rate > 5)
    errors.rate = t('bonusCode.rateInvalid')
  if (!int(form.bonusPoints) && !rate && !int(form.memberDays))
    errors.benefit = t('bonusCode.benefitRequired')
  const starts = localInputToTs(form.startsAt)
  const ends = localInputToTs(form.expiresAt)
  if (starts > 0 && ends > 0 && ends <= starts)
    errors.range = t('bonusCode.rangeInvalid')
  return Object.values(errors).every(v => !v)
}

function buildPayload(): BonusCodePayload {
  return {
    kind: form.kind,
    partner_name: form.partnerName.trim(),
    partner_user_id: int(form.partnerUserId),
    bonus_points: int(form.bonusPoints),
    bonus_valid_days: int(form.bonusValidDays) || 30,
    first_recharge_rate: Number(form.firstRechargeRate) || 0,
    first_recharge_cap_points: int(form.firstRechargeCapPoints),
    reward_valid_days: int(form.rewardValidDays),
    member_days: int(form.memberDays),
    plan_code: form.planCode.trim(),
    max_claims: int(form.maxClaims),
    starts_at: localInputToTs(form.startsAt),
    expires_at: localInputToTs(form.expiresAt),
    status: form.status ? 1 : 0,
    remark: form.remark.trim(),
  }
}

async function submit() {
  if (saving.value || !validate())
    return
  saving.value = true
  try {
    const payload = buildPayload()
    let raw: any
    if (formMode.value === 'batch')
      raw = await adminBonusCodeApi.batch({ ...payload, prefix: form.prefix.trim().toUpperCase(), count: int(form.count) })
    else if (formMode.value === 'edit' && editing.value)
      raw = await adminBonusCodeApi.update(editing.value.id, payload)
    else
      raw = await adminBonusCodeApi.create({ ...payload, code: form.code.trim().toUpperCase() })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    if (formMode.value === 'batch') {
      batchCodes.value = Array.isArray(raw.data?.codes) ? raw.data.codes : []
      notify(t('bonusCode.batchOk', { count: batchCodes.value.length }))
    }
    else {
      notify(formMode.value === 'edit' ? t('bonusCode.updated') : t('bonusCode.created'))
      formOpen.value = false
    }
    await fetchList(`s-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(batchCodes.value.join('\n'))
    notify(t('bonusCode.copied'))
  }
  catch {
    notify(t('bonusCode.copyFail'), 'error')
  }
}

// ---- 状态切换 / 删除 ----
const confirmOpen = ref(false)
const confirmItem = ref<BonusCodeItem | null>(null)
const confirmAction = ref<'delete' | 'status'>('delete')
const confirming = ref(false)
function requestConfirm(item: BonusCodeItem, action: 'delete' | 'status') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}
function payloadFrom(item: BonusCodeItem, status: number): BonusCodePayload {
  return {
    kind: item.kind, partner_name: item.partner_name, partner_user_id: item.partner_user_id,
    bonus_points: item.bonus_points, bonus_valid_days: item.bonus_valid_days,
    first_recharge_rate: item.first_recharge_rate, first_recharge_cap_points: item.first_recharge_cap_points,
    reward_valid_days: item.reward_valid_days, member_days: item.member_days, plan_code: item.plan_code,
    max_claims: item.max_claims, starts_at: item.starts_at, expires_at: item.expires_at, status, remark: item.remark,
  }
}
async function doConfirm() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = confirmAction.value === 'delete'
      ? await adminBonusCodeApi.remove(item.id)
      : await adminBonusCodeApi.update(item.id, payloadFrom(item, item.status === 1 ? 0 : 1))
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || (confirmAction.value === 'delete' ? t('bonusCode.deleted') : t('bonusCode.updated')))
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

// ---- 统计 ----
const statsOpen = ref(false)
const statsItem = ref<BonusCodeItem | null>(null)
const statsData = ref<BonusCodeStats | null>(null)
const statsLoading = ref(false)
async function openStats(item: BonusCodeItem) {
  statsItem.value = item
  statsData.value = null
  statsOpen.value = true
  statsLoading.value = true
  try {
    const raw = await adminBonusCodeApi.stats(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('bonusCode.loadFail'), 'error')
      return
    }
    statsData.value = raw.data as BonusCodeStats
  }
  finally {
    statsLoading.value = false
  }
}

function benefitSummary(item: BonusCodeItem) {
  const parts: string[] = []
  if (item.bonus_points)
    parts.push(t('bonusCode.benefitPoints', { n: item.bonus_points }))
  if (item.first_recharge_rate)
    parts.push(t('bonusCode.benefitRecharge', { pct: Math.round(item.first_recharge_rate * 100), cap: item.first_recharge_cap_points ? t('bonusCode.benefitCap', { n: item.first_recharge_cap_points }) : '' }))
  if (item.member_days)
    parts.push(t('bonusCode.benefitMember', { n: item.member_days }))
  return parts.join(' · ') || '—'
}

function validity(item: BonusCodeItem) {
  const now = Math.floor(Date.now() / 1000)
  if (item.starts_at > 0 && now < item.starts_at)
    return { text: t('bonusCode.notStarted'), color: 'warning' as const }
  if (item.expires_at > 0 && now >= item.expires_at)
    return { text: t('bonusCode.expired'), color: 'neutral' as const }
  if (item.max_claims > 0 && item.claimed_count >= item.max_claims)
    return { text: t('bonusCode.exhausted'), color: 'neutral' as const }
  return null
}

const money = (v: number) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('bonusCode.title')" :page-description="t('bonusCode.description')">
      <template #actions>
        <UButton type="button" variant="outline" icon="i-lucide-download" :loading="exporting" :disabled="!selected.length" @click="exportSelected">
          {{ t('bonusCode.export') }}{{ selected.length ? ` (${selected.length})` : '' }}
        </UButton>
        <UButton type="button" variant="outline" icon="i-lucide-layers" @click="openBatch">{{ t('bonusCode.batch') }}</UButton>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('bonusCode.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('bonusCode.keywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('common.type')">
          <USelect v-model="draft.kind" :items="kindItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('bonusCode.partner')">
          <UInput v-model="draft.partner" :placeholder="t('bonusCode.partnerFilterPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-ticket" :title="t('bonusCode.empty')" :description="t('bonusCode.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[72rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-10 px-4 py-3">
                  <UCheckbox :model-value="allSelected ? true : someSelected ? 'indeterminate' : false" @update:model-value="toggleAll" />
                </th>
                <th class="px-4 py-3">{{ t('bonusCode.colCode') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="px-4 py-3">{{ t('bonusCode.partner') }}</th>
                <th class="px-4 py-3">{{ t('bonusCode.colBenefit') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('bonusCode.colClaimed') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('bonusCode.colValidity') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="px-4 py-3">
                  <UCheckbox :model-value="selectedSet.has(item.id)" @update:model-value="toggleOne(item.id, $event === true)" />
                </td>
                <td class="px-4 py-3">
                  <div class="font-mono text-sm font-semibold">{{ item.code }}</div>
                  <div v-if="item.remark" class="mt-0.5 max-w-56 truncate text-xs text-zinc-400" :title="item.remark">{{ item.remark }}</div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.kind === 1 ? 'error' : item.kind === 2 ? 'warning' : 'primary'" variant="subtle">{{ kindLabel(item.kind) }}</UBadge>
                </td>
                <td class="max-w-40 truncate px-4 py-3" :title="item.partner_name || undefined">
                  {{ item.partner_name || '—' }}
                  <span v-if="item.partner_user_id" class="ml-1 font-mono text-xs text-zinc-400">#{{ item.partner_user_id }}</span>
                </td>
                <td class="max-w-72 px-4 py-3 text-xs">{{ benefitSummary(item) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {{ item.claimed_count }}<span class="text-zinc-400"> / {{ item.max_claims || '∞' }}</span>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  <div>{{ item.starts_at ? formatUnix(item.starts_at) : t('bonusCode.now') }}</div>
                  <div>→ {{ item.expires_at ? formatUnix(item.expires_at) : t('bonusCode.noExpiry') }}</div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <UBadge v-if="item.status !== 1" color="neutral" variant="subtle">{{ t('common.disabled') }}</UBadge>
                  <UBadge v-else-if="validity(item)" :color="validity(item)!.color" variant="subtle">{{ validity(item)!.text }}</UBadge>
                  <UBadge v-else color="success" variant="subtle">{{ t('common.enabled') }}</UBadge>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openStats(item)">{{ t('bonusCode.stats') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? t('common.disabled') : t('common.enabled') }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
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
      v-model:open="formOpen"
      :title="formMode === 'batch' ? t('bonusCode.batchTitle') : formMode === 'edit' ? t('bonusCode.editTitle') : t('bonusCode.createTitle')"
      :ui="{ content: 'w-[min(96vw,44rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div v-if="formMode === 'batch' && batchCodes.length" class="space-y-3">
          <p class="text-sm">{{ t('bonusCode.batchResult', { count: batchCodes.length }) }}</p>
          <UTextarea :model-value="batchCodes.join('\n')" readonly :rows="10" class="w-full font-mono text-xs" />
          <UButton type="button" variant="outline" icon="i-lucide-copy" @click="copyCodes">{{ t('bonusCode.copyCodes') }}</UButton>
        </div>
        <div v-else class="space-y-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField v-if="formMode === 'batch'" :label="t('bonusCode.prefix')" :help="t('bonusCode.prefixHelp')" :error="errors.prefix || undefined">
              <UInput v-model="form.prefix" maxlength="20" placeholder="BILI" class="w-full font-mono uppercase" />
            </UFormField>
            <UFormField v-else :label="t('bonusCode.colCode')" :required="formMode === 'create'" :help="t('bonusCode.codeHelp')" :error="errors.code || undefined">
              <UInput v-model="form.code" :disabled="formMode === 'edit'" maxlength="32" placeholder="EASYTV2026" class="w-full font-mono uppercase" />
            </UFormField>
            <UFormField v-if="formMode === 'batch'" :label="t('bonusCode.count')" required :error="errors.count || undefined">
              <UInput v-model="form.count" type="number" min="1" max="500" class="w-full" />
            </UFormField>
            <UFormField :label="t('bonusCode.kindLabel')" required :help="t('bonusCode.kindHelp')">
              <USelect v-model="form.kind" :items="formKindItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField :label="t('bonusCode.partner')" :help="t('bonusCode.partnerHelp')">
              <UInput v-model="form.partnerName" maxlength="64" class="w-full" />
            </UFormField>
            <UFormField :label="t('bonusCode.partnerUserId')" :help="t('bonusCode.partnerUserIdHelp')">
              <UInput v-model="form.partnerUserId" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <p v-if="errors.benefit" class="text-sm text-red-600">{{ errors.benefit }}</p>

          <div class="rounded-lg border p-4" :class="form.kind === 2 ? 'border-amber-300 dark:border-amber-700' : 'border-dashed border-zinc-200 dark:border-zinc-800'">
            <p class="mb-3 text-sm font-medium">{{ t('bonusCode.groupPoints') }}</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('bonusCode.bonusPoints')">
                <UInput v-model="form.bonusPoints" type="number" min="0" class="w-full" placeholder="0" />
              </UFormField>
              <UFormField :label="t('bonusCode.bonusValidDays')">
                <UInput v-model="form.bonusValidDays" type="number" min="1" class="w-full" placeholder="30" />
              </UFormField>
            </div>
          </div>

          <div class="rounded-lg border p-4" :class="form.kind === 1 ? 'border-rose-300 dark:border-rose-700' : 'border-dashed border-zinc-200 dark:border-zinc-800'">
            <p class="mb-3 text-sm font-medium">{{ t('bonusCode.groupRecharge') }}</p>
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField :label="t('bonusCode.firstRechargeRate')" :help="t('bonusCode.firstRechargeRateHelp')" :error="errors.rate || undefined">
                <UInput v-model="form.firstRechargeRate" type="number" min="0" max="5" step="0.01" class="w-full" placeholder="0.2" />
              </UFormField>
              <UFormField :label="t('bonusCode.firstRechargeCap')" :help="t('bonusCode.zeroUnlimited')">
                <UInput v-model="form.firstRechargeCapPoints" type="number" min="0" class="w-full" placeholder="2000" />
              </UFormField>
              <UFormField :label="t('bonusCode.rewardValidDays')" :help="t('bonusCode.zeroNoExpiry')">
                <UInput v-model="form.rewardValidDays" type="number" min="0" class="w-full" placeholder="30" />
              </UFormField>
            </div>
          </div>

          <div class="rounded-lg border p-4" :class="form.kind === 3 ? 'border-sky-300 dark:border-sky-700' : 'border-dashed border-zinc-200 dark:border-zinc-800'">
            <p class="mb-3 text-sm font-medium">{{ t('bonusCode.groupMember') }}</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('bonusCode.memberDays')">
                <UInput v-model="form.memberDays" type="number" min="0" class="w-full" placeholder="0" />
              </UFormField>
              <UFormField :label="t('bonusCode.planCode')" :help="t('bonusCode.planCodeHelp')">
                <UInput v-model="form.planCode" maxlength="20" class="w-full font-mono" placeholder="creator" />
              </UFormField>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField :label="t('bonusCode.maxClaims')" :help="t('bonusCode.zeroUnlimited')">
              <UInput v-model="form.maxClaims" type="number" min="0" class="w-full" placeholder="0" />
            </UFormField>
            <UFormField :label="t('bonusCode.startsAt')" :help="t('bonusCode.startsHelp')">
              <UInput v-model="form.startsAt" type="datetime-local" class="w-full" />
            </UFormField>
            <UFormField :label="t('bonusCode.expiresAt')" :help="t('bonusCode.expiresHelp')" :error="errors.range || undefined">
              <UInput v-model="form.expiresAt" type="datetime-local" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
            <UFormField :label="t('bonusCode.remark')">
              <UInput v-model="form.remark" maxlength="255" class="w-full" />
            </UFormField>
            <UFormField :label="t('common.status')">
              <div class="inline-flex min-h-10 cursor-pointer items-center gap-2" @click="form.status = !form.status">
                <USwitch :model-value="form.status" @click.stop @update:model-value="form.status = $event" />
                <span class="text-sm">{{ form.status ? t('common.enabled') : t('common.disabled') }}</span>
              </div>
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">
          {{ formMode === 'batch' && batchCodes.length ? t('bonusCode.close') : t('common.cancel') }}
        </UButton>
        <UButton v-if="!(formMode === 'batch' && batchCodes.length)" type="button" :loading="saving" :disabled="saving" @click="submit">
          {{ saving ? t('common.saving') : formMode === 'batch' ? t('bonusCode.generate') : t('common.save') }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="statsOpen" :title="`${t('bonusCode.statsTitle')} — ${statsItem?.code ?? ''}`" :ui="{ content: 'w-[min(96vw,32rem)]' }">
      <template #body>
        <div v-if="statsLoading" class="flex min-h-32 items-center justify-center text-zinc-500">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
        <div v-else-if="statsData" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div v-for="(row, key) in { claimed: statsData.claimed, registered: statsData.registered, paid: statsData.paid }" :key="key" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t(`bonusCode.stat.${key}`) }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ row }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('bonusCode.stat.amount') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ money(statsData.amount) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('bonusCode.stat.bonus_points') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ statsData.bonus_points }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('bonusCode.stat.reward_points') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ statsData.reward_points }}</p>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('bonusCode.confirmDelete') : t('bonusCode.confirmStatus')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm">{{ t('bonusCode.confirmBody', { code: confirmItem?.code ?? '' }) }}</p>
        <p v-if="confirmAction === 'delete'" class="mt-2 text-xs text-zinc-500">{{ t('bonusCode.deleteHint') }}</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :color="confirmAction === 'delete' ? 'error' : 'primary'" :loading="confirming" :disabled="confirming" @click="doConfirm">{{ t('common.confirm') }}</UButton>
      </template>
    </UModal>
  </div>
</template>
