<script setup lang="ts">
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { adminSubjectApi, type AdminSubject } from '~/api/subject'
import { CONSOLE_DEFAULT_PAGE_SIZE, SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

/**
 * 主体库（API.md 10.9）：管理员只读查看，超级管理员可软删违规主体。
 */

const { t } = useI18n()
useHead({ title: () => t('subject.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const KINDS = ['character', 'scene', 'prop'] as const

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<AdminSubject[]>([])
const draft = reactive({ keyword: '', kind: SELECT_ITEM_ALL, shared: SELECT_ITEM_ALL, userId: '', teamId: '' })
const applied = ref({ ...draft })
const errors = reactive({ userId: '', teamId: '' })

const kindItems = computed(() => [
  { label: t('common.allTypes'), value: SELECT_ITEM_ALL },
  ...KINDS.map(k => ({ label: t(`subject.kind.${k}`), value: k })),
])
const sharedItems = computed(() => [
  { label: t('common.allStatus'), value: SELECT_ITEM_ALL },
  { label: t('subject.shared1'), value: '1' },
  { label: t('subject.shared0'), value: '0' },
])

function optionalId(raw: string) {
  const text = raw.trim()
  if (!text)
    return { ok: true as const, value: '' }
  if (!/^\d+$/.test(text) || Number(text) <= 0)
    return { ok: false as const, value: '' }
  return { ok: true as const, value: String(Number(text)) }
}

function coverOf(item: AdminSubject) {
  return resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER
}

function kindLabel(kind: string) {
  return (KINDS as readonly string[]).includes(kind) ? t(`subject.kind.${kind}`) : (kind || '—')
}

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.keyword)
    q.keyword = applied.value.keyword
  if (applied.value.kind !== SELECT_ITEM_ALL)
    q.kind = applied.value.kind
  if (applied.value.shared !== SELECT_ITEM_ALL)
    q.shared = applied.value.shared
  if (applied.value.userId)
    q.user_id = Number(applied.value.userId)
  if (applied.value.teamId)
    q.team_id = Number(applied.value.teamId)
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminSubjectApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<AdminSubject>(raw)
    if (!paged) {
      notify(raw?.message ?? t('subject.loadFail'), 'error')
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
  errors.userId = ''
  errors.teamId = ''
  const user = optionalId(draft.userId)
  const team = optionalId(draft.teamId)
  if (!user.ok)
    errors.userId = t('subject.idInvalid')
  if (!team.ok)
    errors.teamId = t('subject.idInvalid')
  if (!user.ok || !team.ok)
    return
  applied.value = {
    keyword: draft.keyword.trim(),
    kind: draft.kind,
    shared: draft.shared,
    userId: user.value,
    teamId: team.value,
  }
  page.value = 1
}

function reset() {
  Object.assign(draft, { keyword: '', kind: SELECT_ITEM_ALL, shared: SELECT_ITEM_ALL, userId: '', teamId: '' })
  errors.userId = ''
  errors.teamId = ''
  search()
}

const detailOpen = ref(false)
const detailItem = ref<AdminSubject | null>(null)

function openDetail(item: AdminSubject) {
  detailItem.value = item
  detailOpen.value = true
}

const confirmOpen = ref(false)
const confirmItem = ref<AdminSubject | null>(null)
const confirming = ref(false)

function openDelete(item: AdminSubject) {
  confirmItem.value = item
  confirmOpen.value = true
}

async function doDelete() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = await adminSubjectApi.remove(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(t('subject.deleted'))
    confirmOpen.value = false
    if (detailItem.value?.id === item.id)
      detailOpen.value = false
    await fetchList(`d-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

function refsOf(item: AdminSubject) {
  const refs = (item as any).refs
  if (Array.isArray(refs))
    return refs
  if (typeof refs === 'string') {
    try {
      const parsed = JSON.parse(refs)
      return Array.isArray(parsed) ? parsed : []
    }
    catch {
      return []
    }
  }
  return []
}

function refUrl(url: string) {
  return resolveMediaUrl(url) || DEFAULT_WORK_COVER
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('subject.title')" :page-description="t('subject.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('subject.keywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('common.type')">
          <USelect v-model="draft.kind" :items="kindItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('subject.colShared')">
          <USelect v-model="draft.shared" :items="sharedItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.userId')" :error="errors.userId || undefined">
          <UInput v-model="draft.userId" :placeholder="t('subject.userIdPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('subject.teamId')" :error="errors.teamId || undefined">
          <UInput v-model="draft.teamId" :placeholder="t('subject.teamIdPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-person-standing" :title="t('subject.empty')" :description="t('subject.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('subject.colName') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('subject.colOwner') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('subject.colShared') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('subject.colRefs') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('subject.colUses') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="coverOf(item)" alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="min-w-0">
                      <div class="truncate font-medium" :title="item.name || undefined">{{ item.name || '—' }}</div>
                      <div class="truncate text-xs text-zinc-400" :title="item.look || undefined">{{ item.look || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ kindLabel(item.kind) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <div>{{ item.owner_name || '—' }}</div>
                  <div class="font-mono text-xs text-zinc-400">#{{ item.user_id }}{{ item.team_id ? ` · ${t('subject.team')} #${item.team_id}` : '' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.shared ? 'success' : 'neutral'" variant="subtle">{{ item.shared ? t('subject.shared1') : t('subject.shared0') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.refs_count || 0 }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.uses || 0 }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.created_at) }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="xs" variant="soft" @click="openDetail(item)">{{ t('subject.view') }}</UButton>
                    <UButton v-if="isSuperAdmin" type="button" size="xs" color="error" variant="soft" @click="openDelete(item)">{{ t('common.delete') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <USlideover
      v-model:open="detailOpen"
      :title="detailItem?.name || t('subject.detailTitle')"
      :description="detailItem ? kindLabel(detailItem.kind) : undefined"
      :ui="{ content: 'w-[min(96vw,40rem)] max-w-none' }"
    >
      <template #body>
        <div v-if="detailItem" class="space-y-4 text-sm">
          <div class="flex h-72 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <img :src="coverOf(detailItem)" alt="" class="max-h-full max-w-full object-contain">
          </div>
          <div>
            <div class="text-xs text-zinc-500">{{ t('subject.look') }}</div>
            <p class="mt-1 whitespace-pre-wrap">{{ detailItem.look || '—' }}</p>
          </div>
          <div>
            <div class="text-xs text-zinc-500">{{ t('subject.prompt') }}</div>
            <p class="mt-1 whitespace-pre-wrap">{{ detailItem.prompt || '—' }}</p>
          </div>
          <div>
            <div class="mb-2 text-xs text-zinc-500">{{ t('subject.refs') }}</div>
            <div v-if="refsOf(detailItem).length" class="grid grid-cols-3 items-start gap-3">
              <figure
                v-for="(ref, i) in refsOf(detailItem)"
                :key="`${ref.asset_id}-${i}`"
                class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <img :src="refUrl(ref.url)" alt="" class="block h-auto w-full">
                <figcaption class="border-t border-zinc-200 px-2 py-1.5 text-center text-xs text-zinc-500 dark:border-zinc-800">
                  {{ ref.label || `#${ref.asset_id}` }}
                </figcaption>
              </figure>
            </div>
            <p v-else class="text-zinc-400">{{ t('subject.refsEmpty') }}</p>
          </div>
        </div>
      </template>
    </USlideover>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="t('subject.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :loading-text="t('common.processing')"
      :loading="confirming"
      @confirm="doDelete"
    >
      {{ t('subject.confirmDeleteBody', { name: confirmItem?.name ?? '' }) }}
    </ManageConfirmModal>
  </div>
</template>
