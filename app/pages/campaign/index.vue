<script setup lang="ts">
import { adminCampaignApi, type CampaignEntry, type CampaignItem, type CampaignPayload, type CampaignPrize } from '~/api/campaign'
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import qiniu from '~/api/qiniu'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'
import { localInputToTs, tsToLocalInput } from '~/utils/datetime-input'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

/**
 * 活动管理（T33）：活动 CRUD 与结算为 Root；投稿审核（entries）为管理员。
 * 与 easytv-api/API.md 8.6 对齐。
 */

const { t } = useI18n()
useHead({ title: () => t('campaign.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<CampaignItem[]>([])
const draft = reactive({ keyword: '', status: '__all__' })
const applied = ref({ ...draft })

const STATUS_COLOR: Record<number, 'neutral' | 'success' | 'warning' | 'primary'> = { 0: 'neutral', 1: 'success', 2: 'warning', 3: 'primary' }
const statusText = (s: number) => t(`campaign.status${s >= 0 && s <= 3 ? s : 0}`)
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  ...[0, 1, 2, 3].map(s => ({ label: statusText(s), value: String(s) })),
])
const formStatusItems = computed(() => [0, 1, 2].map(s => ({ label: statusText(s), value: s })))

function parsePrizes(raw: CampaignItem['prizes']): CampaignPrize[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = raw.trim() ? JSON.parse(raw) : []
    }
    catch {
      list = []
    }
  }
  if (!Array.isArray(list))
    return []
  return list.map((p: any) => ({
    rank_from: Number(p?.rank_from) || 0,
    rank_to: Number(p?.rank_to) || 0,
    points: Number(p?.points) || 0,
    member_days: Number(p?.member_days) || 0,
  }))
}
function modelPromoText(raw: CampaignItem['model_promo']): string {
  if (raw == null)
    return ''
  if (typeof raw === 'string')
    return raw.trim()
  try {
    return JSON.stringify(raw, null, 2)
  }
  catch {
    return ''
  }
}
const nowTs = () => Math.floor(Date.now() / 1000)
const canSettle = (item: CampaignItem) => item.status === 2 && item.ends_at > 0 && item.ends_at <= nowTs()

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.keyword.trim())
    q.keyword = applied.value.keyword.trim()
  if (applied.value.status !== '__all__')
    q.status = Number(applied.value.status)
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminCampaignApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<CampaignItem>(raw)
    if (!paged) {
      notify(raw?.message ?? t('campaign.loadFail'), 'error')
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
  applied.value = { ...draft, keyword: draft.keyword.trim() }
  page.value = 1
}
function reset() {
  Object.assign(draft, { keyword: '', status: '__all__' })
  search()
}

// ---- 新建 / 编辑 ----
const formOpen = ref(false)
const editing = ref<CampaignItem | null>(null)
const saving = ref(false)
const uploading = ref(false)
const bannerFile = ref<File | null>(null)
const BANNER_MAX_BYTES = 8 * 1024 * 1024
const BANNER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const form = reactive({
  title: '',
  slug: '',
  bannerUrl: '',
  rules: '',
  tag: '',
  startsAt: '',
  endsAt: '',
  status: 0,
  modelPromo: '',
})
const prizes = ref<{ rankFrom: string, rankTo: string, points: string, memberDays: string }[]>([])
const errors = reactive({ title: '', slug: '', range: '', prizes: '', modelPromo: '' })
const bannerPreview = computed(() => form.bannerUrl.trim() ? resolveMediaUrl(form.bannerUrl) : '')

function resetForm() {
  Object.assign(form, { title: '', slug: '', bannerUrl: '', rules: '', tag: '', startsAt: '', endsAt: '', status: 0, modelPromo: '' })
  Object.assign(errors, { title: '', slug: '', range: '', prizes: '', modelPromo: '' })
  prizes.value = []
  bannerFile.value = null
  uploading.value = false
}
function openCreate() {
  resetForm()
  editing.value = null
  addPrize()
  formOpen.value = true
}
function openEdit(item: CampaignItem) {
  resetForm()
  editing.value = item
  Object.assign(form, {
    title: item.title || '',
    slug: item.slug || '',
    bannerUrl: item.banner_url || '',
    rules: item.rules || '',
    tag: item.tag || '',
    startsAt: tsToLocalInput(item.starts_at),
    endsAt: tsToLocalInput(item.ends_at),
    status: Number(item.status) || 0,
    modelPromo: modelPromoText(item.model_promo),
  })
  prizes.value = parsePrizes(item.prizes).map(p => ({
    rankFrom: String(p.rank_from || ''),
    rankTo: String(p.rank_to || ''),
    points: String(p.points || ''),
    memberDays: String(p.member_days || ''),
  }))
  formOpen.value = true
}
function addPrize() {
  const last = prizes.value[prizes.value.length - 1]
  const next = last ? (Math.floor(Number(last.rankTo) || Number(last.rankFrom) || 0) + 1) : 1
  prizes.value.push({ rankFrom: String(next), rankTo: String(next), points: '', memberDays: '' })
}
function removePrize(index: number) {
  prizes.value.splice(index, 1)
}

const int = (v: unknown) => Math.max(0, Math.floor(Number(String(v ?? '').trim()) || 0))

function validate() {
  Object.assign(errors, { title: '', slug: '', range: '', prizes: '', modelPromo: '' })
  if (!form.title.trim())
    errors.title = t('campaign.titleRequired')
  const slug = form.slug.trim()
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(slug))
    errors.slug = t('campaign.slugInvalid')
  const starts = localInputToTs(form.startsAt)
  const ends = localInputToTs(form.endsAt)
  if (!starts || !ends)
    errors.range = t('campaign.rangeRequired')
  else if (ends <= starts)
    errors.range = t('campaign.rangeInvalid')
  for (const p of prizes.value) {
    const from = int(p.rankFrom)
    const to = int(p.rankTo)
    if (from < 1 || to < from) {
      errors.prizes = t('campaign.prizeRankInvalid')
      break
    }
    if (!int(p.points) && !int(p.memberDays)) {
      errors.prizes = t('campaign.prizeEmpty')
      break
    }
  }
  const promo = form.modelPromo.trim()
  if (promo) {
    try {
      const data = JSON.parse(promo) as Record<string, unknown> | Record<string, unknown>[]
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        if (!node || typeof node !== 'object') {
          errors.modelPromo = t('campaign.modelPromoInvalid')
          break
        }
        const model = String(node.model ?? '').trim()
        const models = Array.isArray(node.models) ? node.models.filter(Boolean) : []
        if (!model && !models.length) {
          errors.modelPromo = t('campaign.modelPromoNeedModel')
          break
        }
        const rate = Number(node.rate)
        const points = Number(node.points)
        const hasRate = Number.isFinite(rate) && rate > 0 && rate < 1
        const hasPoints = Number.isFinite(points) && points >= 1
        if (!hasRate && !hasPoints) {
          errors.modelPromo = t('campaign.modelPromoNeedDiscount')
          break
        }
      }
    }
    catch {
      errors.modelPromo = t('campaign.modelPromoInvalid')
    }
  }
  return Object.values(errors).every(v => !v)
}

function buildPayload(): CampaignPayload {
  const promo = form.modelPromo.trim()
  return {
    title: form.title.trim(),
    slug: form.slug.trim().toLowerCase(),
    banner_url: form.bannerUrl.trim(),
    rules: form.rules.trim(),
    tag: form.tag.trim(),
    starts_at: localInputToTs(form.startsAt),
    ends_at: localInputToTs(form.endsAt),
    status: form.status,
    prizes: prizes.value.map(p => ({
      rank_from: int(p.rankFrom),
      rank_to: int(p.rankTo),
      points: int(p.points),
      member_days: int(p.memberDays),
    })),
    model_promo: promo ? JSON.stringify(JSON.parse(promo)) : '',
  }
}

async function submit() {
  if (saving.value || uploading.value || !validate())
    return
  saving.value = true
  try {
    const payload = buildPayload()
    const raw = editing.value
      ? await adminCampaignApi.update(editing.value.id, payload)
      : await adminCampaignApi.create(payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || (editing.value ? t('campaign.updated') : t('campaign.created')))
    formOpen.value = false
    await fetchList(`s-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}

function clearBanner() {
  if (uploading.value)
    return
  bannerFile.value = null
  form.bannerUrl = ''
}
async function onBannerFile(value: File | File[] | null | undefined) {
  const file = Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  bannerFile.value = file
  if (!file)
    return
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
  if (!BANNER_EXTS.includes(ext)) {
    bannerFile.value = null
    notify(t('campaign.bannerTypeInvalid'), 'error')
    return
  }
  if (file.size > BANNER_MAX_BYTES) {
    bannerFile.value = null
    notify(t('campaign.bannerTooLarge'), 'error')
    return
  }
  uploading.value = true
  try {
    form.bannerUrl = await qiniu.uploadImage(file)
    bannerFile.value = null
    notify(t('campaign.bannerUploaded'))
  }
  catch (error: any) {
    bannerFile.value = null
    notify(error?.message || t('campaign.bannerUploadFail'), 'error')
  }
  finally {
    uploading.value = false
  }
}

// ---- 删除 / 结算 ----
const confirmOpen = ref(false)
const confirmAction = ref<'delete' | 'settle'>('delete')
const confirmItem = ref<CampaignItem | null>(null)
const confirming = ref(false)
function requestConfirm(item: CampaignItem, action: 'delete' | 'settle') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}
async function doConfirm() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = confirmAction.value === 'delete'
      ? await adminCampaignApi.remove(item.id)
      : await adminCampaignApi.settle(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || (confirmAction.value === 'delete' ? t('campaign.deleted') : t('campaign.settled')))
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

// ---- 投稿审核抽屉 ----
const entriesOpen = ref(false)
const entriesItem = ref<CampaignItem | null>(null)
const entries = ref<CampaignEntry[]>([])
const entriesTotal = ref(0)
const entriesPage = ref(1)
const entriesPageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const entriesStatus = ref('__all__')
const entriesLoading = ref(false)
const entryActing = ref<number>(0)
const entryStatusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('campaign.entryStatus0'), value: '0' },
  { label: t('campaign.entryStatus1'), value: '1' },
  { label: t('campaign.entryStatus2'), value: '2' },
])
const entryStatusColor = (s: number) => s === 1 ? 'success' : s === 2 ? 'error' : 'warning'
const entryStatusText = (s: number) => t(`campaign.entryStatus${s === 1 || s === 2 ? s : 0}`)
const entryWorkTitle = (e: CampaignEntry) => e.work?.title || e.work_title || ''
const entryWorkCover = (e: CampaignEntry) => resolveMediaUrl(e.work?.cover_url || e.work_cover || '') || DEFAULT_WORK_COVER
const entryNickname = (e: CampaignEntry) => e.user?.nickname || e.nickname || ''

let entriesSeq = 0
async function loadEntries() {
  const item = entriesItem.value
  if (!item)
    return
  const mySeq = ++entriesSeq
  entriesLoading.value = true
  try {
    const raw = await adminCampaignApi.entries(item.id, {
      page: entriesPage.value,
      page_size: entriesPageSize.value,
      status: entriesStatus.value === '__all__' ? undefined : Number(entriesStatus.value),
    })
    if (mySeq !== entriesSeq)
      return
    const paged = parsePaged<CampaignEntry>(raw)
    if (!paged) {
      notify(raw?.message ?? t('campaign.loadFail'), 'error')
      return
    }
    entries.value = paged.items
    entriesTotal.value = paged.total
  }
  finally {
    if (mySeq === entriesSeq)
      entriesLoading.value = false
  }
}
function openEntries(item: CampaignItem) {
  entriesItem.value = item
  entries.value = []
  entriesTotal.value = 0
  entriesPage.value = 1
  entriesStatus.value = '__all__'
  entriesOpen.value = true
  void loadEntries()
}
watch([entriesPage, entriesPageSize, entriesStatus], ([, size, status], [, prevSize, prevStatus]) => {
  if (!entriesOpen.value)
    return
  if (size !== prevSize || status !== prevStatus)
    entriesPage.value = 1
  void loadEntries()
})
async function reviewEntry(entry: CampaignEntry, action: 'approve' | 'reject') {
  if (entryActing.value)
    return
  entryActing.value = entry.id
  try {
    const raw = await adminCampaignApi.reviewEntry(entry.id, { action })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || (action === 'approve' ? t('campaign.entryApproved') : t('campaign.entryRejected')))
    await loadEntries()
    await fetchList(`e-${Date.now()}`)
  }
  finally {
    entryActing.value = 0
  }
}

const num = (v: unknown) => (Number(v) || 0).toLocaleString()
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('campaign.title')" :page-description="t('campaign.description')">
      <template #actions>
        <UButton v-if="isSuperAdmin" type="button" icon="i-lucide-plus" @click="openCreate">{{ t('campaign.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('campaign.keywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-trophy" :title="t('campaign.empty')" :description="t('campaign.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.title') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">Slug</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('campaign.tag') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('campaign.colTime') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('campaign.colEntries') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-14 w-36 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="resolveMediaUrl(item.banner_url) || DEFAULT_WORK_COVER" alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="min-w-0">
                      <div class="truncate font-medium" :title="item.title">{{ item.title }}</div>
                      <div class="mt-0.5 truncate font-mono text-xs text-zinc-400" :title="`#${item.id}`">#{{ item.id }}</div>
                    </div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs">{{ item.slug }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge v-if="item.tag" color="primary" variant="subtle">{{ item.tag }}</UBadge>
                  <span v-else class="text-zinc-400">—</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  <div>{{ formatUnix(item.starts_at) || '—' }}</div>
                  <div>→ {{ formatUnix(item.ends_at) || '—' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="STATUS_COLOR[item.status] ?? 'neutral'" variant="subtle">{{ statusText(item.status) }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ num(item.entries_count) }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton v-if="isSuperAdmin" type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" @click="openEntries(item)">{{ t('campaign.entries') }}</UButton>
                    <UButton v-if="isSuperAdmin" type="button" size="sm" variant="soft" color="warning" :disabled="!canSettle(item)" :title="canSettle(item) ? undefined : t('campaign.settleHint')" @click="requestConfirm(item, 'settle')">
                      {{ t('campaign.settle') }}
                    </UButton>
                    <UButton v-if="isSuperAdmin" type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
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
      :title="editing ? t('campaign.editTitle') : t('campaign.createTitle')"
      :ui="{ content: 'w-[min(96vw,48rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('common.title')" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="100" class="w-full" />
          </UFormField>
          <UFormField label="Slug" required :help="t('campaign.slugHelp')" :error="errors.slug || undefined">
            <UInput v-model="form.slug" maxlength="64" class="w-full font-mono" placeholder="spring-2026" />
          </UFormField>
          <UFormField :label="t('campaign.tag')" :help="t('campaign.tagHelp')">
            <UInput v-model="form.tag" maxlength="30" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.status')">
            <USelect v-if="form.status !== 3" v-model="form.status" :items="formStatusItems" value-key="value" class="w-full" />
            <UInput v-else :model-value="statusText(3)" disabled class="w-full" />
          </UFormField>
          <UFormField :label="t('campaign.startsAt')" required>
            <UInput v-model="form.startsAt" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField :label="t('campaign.endsAt')" required :error="errors.range || undefined">
            <UInput v-model="form.endsAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>

        <UFormField :label="t('campaign.banner')">
          <div v-if="bannerPreview" class="relative">
            <img :src="bannerPreview" alt="" class="aspect-[3/1] w-full rounded-lg object-cover">
            <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearBanner">{{ t('campaign.clear') }}</UButton>
          </div>
          <UFileUpload
            v-else
            :model-value="bannerFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            :label="uploading ? t('campaign.uploading') : t('campaign.bannerUploadLabel')"
            :description="t('campaign.bannerUploadDesc')"
            class="w-full min-h-32"
            :disabled="uploading"
            @update:model-value="onBannerFile"
          />
          <UInput v-model="form.bannerUrl" class="mt-2 w-full font-mono text-xs" :placeholder="t('campaign.bannerUrlPh')" />
        </UFormField>

        <UFormField :label="t('campaign.rules')">
          <UTextarea v-model="form.rules" :rows="5" class="w-full" :placeholder="t('campaign.rulesPh')" />
        </UFormField>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-medium">{{ t('campaign.prizes') }}</p>
            <UButton type="button" size="xs" variant="soft" icon="i-lucide-plus" @click="addPrize">{{ t('campaign.addPrize') }}</UButton>
          </div>
          <p v-if="!prizes.length" class="text-xs text-zinc-400">{{ t('campaign.noPrize') }}</p>
          <div v-else class="space-y-2">
            <div class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-zinc-500">
              <span>{{ t('campaign.rankFrom') }}</span>
              <span>{{ t('campaign.rankTo') }}</span>
              <span>{{ t('campaign.prizePoints') }}</span>
              <span>{{ t('campaign.prizeMemberDays') }}</span>
              <span class="w-8" />
            </div>
            <div v-for="(p, index) in prizes" :key="index" class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2">
              <UInput :model-value="p.rankFrom" type="number" min="1" step="1" class="w-full" @update:model-value="p.rankFrom = String($event ?? '')" />
              <UInput :model-value="p.rankTo" type="number" min="1" step="1" class="w-full" @update:model-value="p.rankTo = String($event ?? '')" />
              <UInput :model-value="p.points" type="number" min="0" step="1" placeholder="0" class="w-full" @update:model-value="p.points = String($event ?? '')" />
              <UInput :model-value="p.memberDays" type="number" min="0" step="1" placeholder="0" class="w-full" @update:model-value="p.memberDays = String($event ?? '')" />
              <UButton type="button" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="t('common.delete')" @click="removePrize(index)" />
            </div>
          </div>
          <p v-if="errors.prizes" class="mt-2 text-sm text-red-600">{{ errors.prizes }}</p>
        </div>

        <UFormField :label="t('campaign.modelPromo')" :help="t('campaign.modelPromoHelp')" :error="errors.modelPromo || undefined">
          <UTextarea v-model="form.modelPromo" :rows="4" class="w-full font-mono text-xs" placeholder='{"model":"veo-3","rate":0.5}' />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="submit">{{ saving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('campaign.confirmDelete') : t('campaign.confirmSettle')"
      :tone="confirmAction === 'delete' ? 'error' : 'primary'"
      :icon="confirmAction === 'delete' ? '' : 'i-lucide-trophy'"
      :confirm-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      :loading-text="t('common.processing')"
      :loading="confirming"
      @confirm="doConfirm"
    >
      {{ t(confirmAction === 'delete' ? 'campaign.confirmDeleteBody' : 'campaign.confirmSettleBody', { title: confirmItem?.title ?? '' }) }}
      <p v-if="confirmAction === 'settle'" class="mt-2 text-xs text-dimmed">{{ t('campaign.settleHint2') }}</p>
    </ManageConfirmModal>

    <USlideover
      v-model:open="entriesOpen"
      :title="t('campaign.entriesTitle')"
      :description="entriesItem ? `${entriesItem.title} · ${t('campaign.entriesCount', { n: num(entriesTotal) })}` : undefined"
      :ui="{ content: 'w-[min(96vw,44rem)] max-w-none' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('common.status')">
            <USelect v-model="entriesStatus" :items="entryStatusItems" value-key="value" class="w-full sm:w-48" />
          </UFormField>
          <div v-if="entriesLoading && !entries.length" class="flex min-h-40 items-center justify-center text-zinc-500">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
          </div>
          <div v-else class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div class="overflow-x-auto">
              <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th class="min-w-0 w-full px-3 py-2 text-left">{{ t('campaign.entryWork') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2">{{ t('campaign.entryUser') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2">{{ t('campaign.entryLikes') }}</th>
                    <th class="w-[1%] whitespace-nowrap px-3 py-2">{{ t('common.status') }}</th>
                    <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-3 py-2 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <tr v-if="!entries.length">
                    <td colspan="5" class="px-3 py-6 text-center text-zinc-400">{{ t('campaign.entriesEmpty') }}</td>
                  </tr>
                  <tr v-for="e in entries" :key="e.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                    <td class="max-w-0 w-full px-3 py-2">
                      <div class="flex min-w-0 items-center gap-3">
                        <div class="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                          <img :src="entryWorkCover(e)" alt="" class="h-full w-full object-cover">
                        </div>
                        <div class="min-w-0">
                          <div class="truncate font-medium" :title="entryWorkTitle(e)">{{ entryWorkTitle(e) || `#${e.work_id}` }}</div>
                          <div class="mt-0.5 truncate font-mono text-xs text-zinc-400" :title="`#${e.work_id}`">#{{ e.work_id }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2">
                      <span>{{ entryNickname(e) || '—' }}</span>
                      <span class="ml-1 font-mono text-xs text-zinc-400">#{{ e.user_id }}</span>
                    </td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2 tabular-nums">
                      {{ num(e.likes_snapshot) }}
                      <div v-if="e.rank" class="text-xs text-zinc-400">{{ t('campaign.entryRank', { n: e.rank, points: num(e.prize_points) }) }}</div>
                    </td>
                    <td class="w-[1%] whitespace-nowrap px-3 py-2">
                      <UBadge :color="entryStatusColor(e.status)" variant="subtle">{{ entryStatusText(e.status) }}</UBadge>
                    </td>
                    <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-3 py-2 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                      <div class="flex w-max flex-nowrap gap-1">
                        <UButton v-if="e.status !== 1" type="button" size="xs" variant="soft" color="success" :loading="entryActing === e.id" :disabled="!!entryActing" @click="reviewEntry(e, 'approve')">{{ t('campaign.approve') }}</UButton>
                        <UButton v-if="e.status !== 2" type="button" size="xs" variant="soft" color="error" :loading="entryActing === e.id" :disabled="!!entryActing" @click="reviewEntry(e, 'reject')">{{ t('campaign.reject') }}</UButton>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ConsoleTablePagination v-model:page="entriesPage" v-model:page-size="entriesPageSize" :total="entriesTotal" :disabled="entriesLoading" />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
