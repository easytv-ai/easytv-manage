<script setup lang="ts">
import { formatUnix, isOk, parsePaged } from '~/api/creative'
import { adminTeamApi, type AdminTeam, type AdminTeamMember } from '~/api/team'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'

/**
 * 团队额度（API.md 10.9）：管理员查看团队与成员月度额度，超级管理员可代改成员额度。
 */

const { t } = useI18n()
useHead({ title: () => t('team.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { isSuperAdmin } = useAdminAccess()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const total = ref(0)
const rows = ref<AdminTeam[]>([])
const draft = reactive({ keyword: '', ownerId: '' })
const applied = ref({ keyword: '', ownerId: '' })
const errors = reactive({ ownerId: '' })

const num = (v: unknown) => (Number(v) || 0).toLocaleString()

function optionalId(raw: string) {
  const text = raw.trim()
  if (!text)
    return { ok: true as const, value: undefined }
  if (!/^\d+$/.test(text) || Number(text) <= 0)
    return { ok: false as const, value: undefined }
  return { ok: true as const, value: Number(text) }
}

function buildQuery() {
  const q: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (applied.value.keyword)
    q.keyword = applied.value.keyword
  if (applied.value.ownerId)
    q.owner_id = Number(applied.value.ownerId)
  return q
}

let seq = 0
const fetchList = useClientListFetch(async () => {
  const mySeq = ++seq
  beginListLoad()
  try {
    const raw = await adminTeamApi.list(buildQuery())
    if (mySeq !== seq)
      return
    const paged = parsePaged<AdminTeam>(raw)
    if (!paged) {
      notify(raw?.message ?? t('team.loadFail'), 'error')
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
  errors.ownerId = ''
  const owner = optionalId(draft.ownerId)
  if (!owner.ok) {
    errors.ownerId = t('team.idInvalid')
    return
  }
  applied.value = { keyword: draft.keyword.trim(), ownerId: owner.value ? String(owner.value) : '' }
  page.value = 1
}

function reset() {
  Object.assign(draft, { keyword: '', ownerId: '' })
  errors.ownerId = ''
  search()
}

const detailOpen = ref(false)
const detailItem = ref<AdminTeam | null>(null)
const members = ref<AdminTeamMember[]>([])
const membersLoading = ref(false)

let membersSeq = 0
async function loadMembers() {
  const item = detailItem.value
  if (!item)
    return
  const mySeq = ++membersSeq
  membersLoading.value = true
  try {
    const raw = await adminTeamApi.members(item.id)
    if (mySeq !== membersSeq)
      return
    const paged = parsePaged<AdminTeamMember>(raw)
    if (!paged) {
      notify(raw?.message ?? t('team.membersLoadFail'), 'error')
      return
    }
    members.value = paged.items
  }
  finally {
    if (mySeq === membersSeq)
      membersLoading.value = false
  }
}

function openDetail(item: AdminTeam) {
  detailItem.value = item
  members.value = []
  detailOpen.value = true
  void loadMembers()
}

function memberName(item: AdminTeamMember) {
  return item.nickname || item.username || `#${item.user_id}`
}

function memberInitial(item: AdminTeamMember) {
  const name = (item.nickname || item.username || '').trim()
  return name ? name.slice(0, 1) : '#'
}

function roleLabel(role: string) {
  if (role === 'owner')
    return t('team.roleOwner')
  if (role === 'member')
    return t('team.roleMember')
  return role || '—'
}

function permissionLabel(item: AdminTeamMember) {
  if (item.role === 'owner')
    return t('team.permAdmin')
  const key = item.permission
  if (key === 'admin' || key === 'editor' || key === 'viewer')
    return t(`team.perm.${key}`)
  return key || '—'
}

function limitText(item: AdminTeamMember) {
  if (item.role === 'owner' || !item.points_limit)
    return t('team.unlimited')
  return num(item.points_limit)
}

function leftText(item: AdminTeamMember) {
  if (item.role === 'owner' || !item.points_limit)
    return t('team.unlimited')
  if (item.points_left == null)
    return '—'
  return num(item.points_left)
}

const limitOpen = ref(false)
const limitItem = ref<AdminTeamMember | null>(null)
const limitSaving = ref(false)
const limitForm = reactive({ points: '' })
const limitError = ref('')

function openLimit(item: AdminTeamMember) {
  limitItem.value = item
  limitForm.points = String(item.points_limit || 0)
  limitError.value = ''
  limitOpen.value = true
}

function validateLimit() {
  const n = Number(String(limitForm.points).trim())
  if (!Number.isInteger(n) || n < 0 || n > 10000000) {
    limitError.value = t('team.limitInvalid')
    return false
  }
  limitError.value = ''
  return true
}

async function submitLimit() {
  const item = limitItem.value
  if (!item || limitSaving.value || !validateLimit())
    return
  limitSaving.value = true
  try {
    const raw = await adminTeamApi.setLimit(item.id, Number(limitForm.points))
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(t('team.limitSaved'))
    limitOpen.value = false
    await loadMembers()
    await fetchList(`l-${Date.now()}`)
  }
  finally {
    limitSaving.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('team.title')" :page-description="t('team.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('team.colName')">
          <UInput v-model="draft.keyword" :placeholder="t('team.keywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('team.ownerId')" :error="errors.ownerId || undefined">
          <UInput v-model="draft.ownerId" :placeholder="t('team.ownerIdPh')" class="w-full" @keyup.enter="search" />
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
      <UEmpty v-else-if="rows.length === 0" icon="i-lucide-users" :title="t('team.empty')" :description="t('team.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[64rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="px-4 py-3">{{ t('team.colName') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('team.colOwner') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('team.colSeats') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('team.colMembers') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('team.colLimit') }}</th>
                <th class="whitespace-nowrap px-4 py-3 text-right">{{ t('team.colUsed') }}</th>
                <th class="whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="px-4 py-3">
                  <div class="font-medium">{{ item.name || '—' }}</div>
                  <div class="font-mono text-xs text-zinc-400">#{{ item.id }}</div>
                </td>
                <td class="whitespace-nowrap px-4 py-3">
                  <div>{{ item.owner_name || '—' }}</div>
                  <div class="font-mono text-xs text-zinc-400">#{{ item.owner_id }}</div>
                </td>
                <td class="px-4 py-3 text-right tabular-nums">{{ num(item.seats) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ num(item.member_count) }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ item.points_limit_total ? num(item.points_limit_total) : t('team.unlimited') }}</td>
                <td class="px-4 py-3 text-right tabular-nums">{{ num(item.points_used_month) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ formatUnix(item.created_at) }}</td>
                <td class="sticky right-0 z-10 whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900">
                  <UButton type="button" size="xs" variant="soft" @click="openDetail(item)">{{ t('team.viewMembers') }}</UButton>
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
      :title="detailItem ? (detailItem.name || `#${detailItem.id}`) : t('team.membersTitle')"
      :description="t('team.membersHint')"
      :ui="{ content: 'w-[min(96vw,28rem)] max-w-none' }"
    >
      <template #body>
        <div v-if="membersLoading" class="flex min-h-40 items-center justify-center text-sm text-zinc-500">
          <UIcon name="i-lucide-loader-circle" class="mr-2 size-5 animate-spin" />
          {{ t('common.loading') }}
        </div>
        <UEmpty v-else-if="!members.length" icon="i-lucide-user" :title="t('team.membersEmpty')" class="min-h-40" />
        <ul v-else class="space-y-3">
          <li
            v-for="m in members"
            :key="m.id"
            class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {{ memberInitial(m) }}
                </span>
                <div class="min-w-0">
                  <div class="truncate font-medium">{{ memberName(m) }}</div>
                  <div class="font-mono text-xs text-zinc-400">#{{ m.user_id }}</div>
                </div>
              </div>
              <div class="flex shrink-0 flex-wrap justify-end gap-1">
                <UBadge :color="m.role === 'owner' ? 'primary' : 'neutral'" variant="subtle">{{ roleLabel(m.role) }}</UBadge>
                <UBadge color="neutral" variant="subtle">{{ permissionLabel(m) }}</UBadge>
              </div>
            </div>

            <p v-if="m.role === 'owner'" class="mt-3 text-sm text-zinc-500">{{ t('team.ownerPool') }}</p>
            <div v-else class="mt-3 grid grid-cols-3 gap-2">
              <div class="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <div class="text-xs text-zinc-500">{{ t('team.colLimit') }}</div>
                <div class="mt-0.5 font-medium tabular-nums">{{ limitText(m) }}</div>
              </div>
              <div class="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <div class="text-xs text-zinc-500">{{ t('team.colUsed') }}</div>
                <div class="mt-0.5 font-medium tabular-nums">{{ num(m.points_used) }}</div>
              </div>
              <div class="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <div class="text-xs text-zinc-500">{{ t('team.colLeft') }}</div>
                <div class="mt-0.5 font-medium tabular-nums">{{ leftText(m) }}</div>
              </div>
            </div>

            <div v-if="m.role !== 'owner'" class="mt-3 flex justify-end">
              <UButton
                v-if="isSuperAdmin"
                type="button"
                size="sm"
                variant="soft"
                @click="openLimit(m)"
              >
                {{ t('team.editLimit') }}
              </UButton>
              <span v-else class="text-xs text-zinc-400">{{ t('team.rootOnly') }}</span>
            </div>
          </li>
        </ul>
      </template>
    </USlideover>

    <UModal
      v-model:open="limitOpen"
      :title="t('team.editLimit')"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="mb-3 text-sm text-zinc-500">{{ t('team.limitHelp', { name: limitItem?.nickname || `#${limitItem?.user_id ?? ''}` }) }}</p>
        <UFormField :label="t('team.colLimit')" required :error="limitError || undefined" :help="t('team.limitHint')">
          <UInput v-model="limitForm.points" type="number" min="0" max="10000000" step="1" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="limitSaving" @click="() => { limitOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="limitSaving" :disabled="limitSaving" @click="submitLimit">
          {{ limitSaving ? t('common.saving') : t('common.save') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
