<script setup lang="ts">
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import settingApi from '~/api/setting'
import { adminUgcApi, type UgcReviewPayload, type UgcSubmission } from '~/api/ugc'
import { parseSettingMap } from '~/utils/admin-setting'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

/**
 * 站外投稿审核：GET /admin/ugc 待审队列，PUT /admin/ugc/:id/review 通过 / 驳回。
 * 积分预估取增长参数 GrowthUgcPoints30/60/120 与 GrowthUgcViralLikes（缺省 100/300/500/1000）。
 */

const { t } = useI18n()
useHead({ title: () => t('ugc.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const PLATFORMS = ['douyin', 'xiaohongshu', 'bilibili', 'other'] as const
const TIERS = [30, 60, 120] as const
type Tier = typeof TIERS[number]

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<UgcSubmission[]>([])
const draft = reactive({ status: '0', platform: '__all__', keyword: '' })
const applied = ref({ ...draft })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('ugc.status0'), value: '0' },
  { label: t('ugc.status1'), value: '1' },
  { label: t('ugc.status2'), value: '2' },
])
const platformItems = computed(() => [
  { label: t('ugc.allPlatforms'), value: '__all__' },
  ...PLATFORMS.map(p => ({ label: t(`ugc.platform.${p}`), value: p })),
])
const platformLabel = (p: string) => PLATFORMS.includes(p as any) ? t(`ugc.platform.${p}`) : (p || '—')
const platformColor = (p: string) => p === 'douyin' ? 'neutral' : p === 'xiaohongshu' ? 'error' : p === 'bilibili' ? 'info' : 'warning'
const statusColor = (s: number) => s === 1 ? 'success' : s === 2 ? 'error' : 'warning'
const statusText = (s: number) => t(`ugc.status${s === 1 || s === 2 ? s : 0}`)

const nickname = (item: UgcSubmission) => item.user?.nickname || item.nickname || ''
const workTitle = (item: UgcSubmission) => item.work?.title || item.work_title || ''
const workCover = (item: UgcSubmission) => resolveMediaUrl(item.work?.cover_url || item.work_cover || '') || DEFAULT_WORK_COVER
const hasWork = (item: UgcSubmission) => Number(item.work_id) > 0
const isViral = (item: UgcSubmission) => item.viral === true || Number(item.viral) === 1

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.status !== '__all__')
    q.status = Number(applied.value.status)
  if (applied.value.platform !== '__all__')
    q.platform = applied.value.platform
  if (applied.value.keyword.trim())
    q.keyword = applied.value.keyword.trim()
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminUgcApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<UgcSubmission>(raw)
    if (!paged) {
      notify(raw?.message ?? t('ugc.loadFail'), 'error')
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

onMounted(() => {
  void fetchList()
  void loadGrowth()
})
watch(() => [page.value, pageSize.value, applied.value] as const, () => void fetchList(`q-${Date.now()}`), { deep: true })

function search() {
  applied.value = { ...draft, keyword: draft.keyword.trim() }
  page.value = 1
}
function reset() {
  Object.assign(draft, { status: '0', platform: '__all__', keyword: '' })
  search()
}

// ---- 增长参数（积分预估）----
const growth = reactive<{ tiers: Record<Tier, number>, viralLikes: number }>({
  tiers: { 30: 100, 60: 300, 120: 500 },
  viralLikes: 1000,
})
async function loadGrowth() {
  try {
    const raw = await settingApi.list()
    const map = parseSettingMap(raw)
    if (!map)
      return
    const pick = (key: string, def: number) => {
      const n = Number(map[key])
      return Number.isFinite(n) && map[key] !== '' && map[key] != null ? n : def
    }
    growth.tiers = { 30: pick('GrowthUgcPoints30', 100), 60: pick('GrowthUgcPoints60', 300), 120: pick('GrowthUgcPoints120', 500) }
    growth.viralLikes = pick('GrowthUgcViralLikes', 1000)
  }
  catch {
    // 读不到参数时按默认值预估
  }
}

// ---- 审核弹窗 ----
const reviewOpen = ref(false)
const reviewItem = ref<UgcSubmission | null>(null)
const reviewing = ref<'' | 'approve' | 'reject'>('')
const form = reactive({ tier: 30 as Tier, likes: '', remark: '', toBanner: false })
const errors = reactive({ likes: '', remark: '' })
const tierItems = computed(() => TIERS.map(tier => ({
  label: t('ugc.tierLabel', { tier, points: growth.tiers[tier] }),
  value: tier,
})))

const likesNum = computed(() => Math.max(0, Math.floor(Number(String(form.likes ?? '').trim()) || 0)))
const viralHit = computed(() => growth.viralLikes > 0 && likesNum.value >= growth.viralLikes)
const previewPoints = computed(() => (growth.tiers[form.tier] || 0) * (viralHit.value ? 2 : 1))

function openReview(item: UgcSubmission) {
  reviewItem.value = item
  const tier = TIERS.includes(Number(item.duration_tier) as Tier) ? Number(item.duration_tier) as Tier : 30
  Object.assign(form, { tier, likes: item.likes ? String(item.likes) : '', remark: item.remark || '', toBanner: false })
  Object.assign(errors, { likes: '', remark: '' })
  reviewOpen.value = true
}

function validate(action: 'approve' | 'reject') {
  Object.assign(errors, { likes: '', remark: '' })
  const likesRaw = String(form.likes ?? '').trim()
  if (likesRaw && (!Number.isFinite(Number(likesRaw)) || Number(likesRaw) < 0))
    errors.likes = t('ugc.likesInvalid')
  if (action === 'reject' && !form.remark.trim())
    errors.remark = t('ugc.remarkRequired')
  return !errors.likes && !errors.remark
}

async function submitReview(action: 'approve' | 'reject') {
  const item = reviewItem.value
  if (!item || reviewing.value || !validate(action))
    return
  reviewing.value = action
  try {
    const payload: UgcReviewPayload = {
      action,
      duration_tier: form.tier,
      likes: likesNum.value,
      remark: form.remark.trim() || undefined,
      to_banner: action === 'approve' && form.toBanner && hasWork(item) ? true : undefined,
    }
    const raw = await adminUgcApi.review(item.id, payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || (action === 'approve' ? t('ugc.approved') : t('ugc.rejected')))
    reviewOpen.value = false
    await fetchList(`r-${Date.now()}`)
  }
  finally {
    reviewing.value = ''
  }
}

const num = (v: unknown) => (Number(v) || 0).toLocaleString()
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('ugc.title')" :page-description="t('ugc.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('ugc.platformLabel')">
          <USelect v-model="draft.platform" :items="platformItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('ugc.keywordPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-share-2" :title="t('ugc.empty')" :description="t('ugc.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.colUser') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.platformLabel') }}</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('ugc.colUrl') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.colWork') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.colSubmitted') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.colPoints') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('ugc.colReview') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <span>{{ nickname(item) || '—' }}</span>
                  <span class="ml-1 font-mono text-xs text-zinc-400">#{{ item.user_id }}</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="platformColor(item.platform)" variant="subtle">{{ platformLabel(item.platform) }}</UBadge>
                </td>
                <td class="max-w-0 w-full px-4 py-3">
                  <a :href="item.url" target="_blank" rel="noopener noreferrer" class="block truncate text-primary hover:underline" :title="item.url">{{ item.url }}</a>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <div v-if="hasWork(item)" class="flex items-center gap-2">
                    <img :src="workCover(item)" alt="" class="h-10 w-16 shrink-0 rounded object-cover">
                    <div class="min-w-0">
                      <div class="truncate" :title="workTitle(item)">{{ workTitle(item) || `#${item.work_id}` }}</div>
                      <div class="font-mono text-xs text-zinc-400">#{{ item.work_id }}</div>
                    </div>
                  </div>
                  <span v-else class="text-zinc-400">{{ t('ugc.noWork') }}</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.created_at) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(item.status)" variant="subtle">{{ statusText(item.status) }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">
                  <span>{{ item.status === 1 ? num(item.points) : '—' }}</span>
                  <UBadge v-if="isViral(item)" color="error" variant="subtle" class="ml-1">{{ t('ugc.viral') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  <template v-if="item.status !== 0">
                    <div>{{ item.reviewed_by ? `#${item.reviewed_by}` : '—' }} · {{ formatUnix(item.reviewed_at) || '—' }}</div>
                    <div v-if="item.duration_tier" class="text-zinc-400">{{ t('ugc.tierShort', { tier: item.duration_tier }) }} · {{ t('ugc.likesShort', { n: num(item.likes) }) }}</div>
                    <div v-if="item.remark" class="truncate" :title="item.remark">{{ item.remark }}</div>
                  </template>
                  <span v-else>—</span>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 0 ? 'primary' : 'neutral'" @click="openReview(item)">
                      {{ item.status === 0 ? t('ugc.review') : t('ugc.reReview') }}
                    </UButton>
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
      v-model:open="reviewOpen"
      :title="t('ugc.reviewTitle')"
      :description="reviewItem ? `${nickname(reviewItem) || `#${reviewItem.user_id}`} · ${platformLabel(reviewItem.platform)}` : undefined"
      :ui="{ content: 'w-[min(96vw,36rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <template v-if="reviewItem">
          <a :href="reviewItem.url" target="_blank" rel="noopener noreferrer" class="block truncate text-sm text-primary hover:underline">{{ reviewItem.url }}</a>
          <div v-if="hasWork(reviewItem)" class="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <img :src="workCover(reviewItem)" alt="" class="h-12 w-20 shrink-0 rounded object-cover">
            <div class="min-w-0 text-sm">
              <div class="truncate font-medium">{{ workTitle(reviewItem) || `#${reviewItem.work_id}` }}</div>
              <div class="font-mono text-xs text-zinc-400">#{{ reviewItem.work_id }}</div>
            </div>
          </div>

          <UFormField :label="t('ugc.tier')" required>
            <URadioGroup v-model="form.tier" :items="tierItems" value-key="value" orientation="horizontal" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('ugc.likes')" :help="t('ugc.likesHelp', { n: num(growth.viralLikes) })" :error="errors.likes || undefined">
              <UInput :model-value="form.likes" type="number" min="0" step="1" placeholder="0" class="w-full" @update:model-value="form.likes = String($event ?? '')" />
            </UFormField>
            <UFormField :label="t('ugc.toBanner')" :help="hasWork(reviewItem) ? t('ugc.toBannerHelp') : t('ugc.toBannerNoWork')">
              <div class="inline-flex min-h-10 items-center">
                <UCheckbox v-model="form.toBanner" :disabled="!hasWork(reviewItem)" :label="t('ugc.toBannerLabel')" />
              </div>
            </UFormField>
          </div>
          <UFormField :label="t('ugc.remark')" :error="errors.remark || undefined" :help="t('ugc.remarkHelp')">
            <UTextarea v-model="form.remark" :rows="3" maxlength="255" class="w-full" />
          </UFormField>

          <div class="rounded-lg border border-dashed border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <span class="font-medium">{{ t('ugc.previewPoints', { n: num(previewPoints) }) }}</span>
            <span class="ml-1 text-zinc-500">{{ t('ugc.previewViral', { n: num(growth.viralLikes) }) }}</span>
            <UBadge v-if="viralHit" color="error" variant="subtle" class="ml-2">{{ t('ugc.viralHit') }}</UBadge>
          </div>
        </template>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="!!reviewing" @click="() => { reviewOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" color="error" variant="soft" :loading="reviewing === 'reject'" :disabled="!!reviewing" @click="submitReview('reject')">{{ t('ugc.reject') }}</UButton>
        <UButton type="button" color="success" :loading="reviewing === 'approve'" :disabled="!!reviewing" @click="submitReview('approve')">{{ t('ugc.approve') }}</UButton>
      </template>
    </UModal>
  </div>
</template>
