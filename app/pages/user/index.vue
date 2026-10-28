<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AdminUser } from '~/types/easytv-admin'
import userApi from '~/api/user'
import {
  isApiSuccess,
  isHttpAvatar,
  parseUserListResponse,
  userRoleLabel,
} from '~/utils/admin-user'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'

const { t } = useI18n()
useHead({
  title: () => t('user.pageTitle'),
})

definePageMeta({
  layout: 'console',
})

const localePath = useLocalePath()
const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)
const pageRows = ref<AdminUser[]>([])
const total = ref(0)
const { isSuperAdmin } = useAdminAccess()
const identityModalOpen = ref(false)
const identityUser = ref<AdminUser | null>(null)
const rebindModalOpen = ref(false)
const rebindUser = ref<AdminUser | null>(null)
const statusConfirmOpen = ref(false)
const statusUser = ref<AdminUser | null>(null)
const statusSaving = ref(false)
const deleteConfirmOpen = ref(false)
const deleteUser = ref<AdminUser | null>(null)
const deleteSaving = ref(false)

const draft = reactive({
  keyword: '',
  status: '__all__',
  deleted: '__all__',
  inviterId: '',
  source: '',
})
const applied = ref({ ...draft })

const inviteDrawerOpen = ref(false)
const inviteUser = ref<AdminUser | null>(null)

function openInvites(user: AdminUser) {
  inviteUser.value = user
  inviteDrawerOpen.value = true
}

/** 点邀请人列：按该邀请人筛选 */
function filterByInviter(inviterId: number) {
  draft.inviterId = String(inviterId)
  search()
}

function onInviteBlockChanged(userId: number, blocked: boolean) {
  const row = pageRows.value.find(item => item.id === userId)
  if (row)
    row.inviteBlocked = blocked
}

const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '正常', value: '1' },
  { label: '禁用', value: '2' },
]
const deletedItems = [
  { label: '未注销', value: '__all__' },
  { label: '已注销', value: '1' },
]
const identityItems = [
  { label: '官方账号', value: 'easytv_official' },
  { label: '企业账号', value: 'enterprise' },
  { label: '学院讲师', value: 'easytv_teacher' },
  { label: '学院助教', value: 'easytv_teaching_assistant' },
]
const identityLabels = Object.fromEntries(identityItems.map(item => [item.value, item.label]))

function identityText(user: AdminUser) {
  const key = user.identity || user.tags[0]
  if (key && identityLabels[key])
    return identityLabels[key]
  return userRoleLabel(user.role) || t('user.identityNone')
}

function avatarLetter(user: AdminUser) {
  return (user.nickname || user.username || '?').slice(0, 1)
}

function buildListQuery() {
  const query: Record<string, unknown> = {
    page: page.value,
    page_size: pageSize.value,
  }
  const keyword = applied.value.keyword.trim()
  if (keyword)
    query.keyword = keyword
  if (applied.value.status !== '__all__')
    query.status = Number(applied.value.status)
  if (applied.value.deleted === '1')
    query.deleted = 1
  const inviterId = Number(applied.value.inviterId)
  if (Number.isInteger(inviterId) && inviterId > 0)
    query.inviter_id = inviterId
  const source = applied.value.source.trim()
  if (source)
    query.source = source
  return query
}

let listFetchSeq = 0

async function refreshList() {
  if (!import.meta.client)
    return
  const seq = ++listFetchSeq
  beginListLoad()
  try {
    const raw = await userApi.list(buildListQuery())
    if (seq !== listFetchSeq)
      return
    const parsed = parseUserListResponse(raw)
    if (!parsed) {
      pageRows.value = []
      total.value = 0
      notify(raw?.message ?? '用户列表加载失败', 'error')
      return
    }
    pageRows.value = parsed.rows
    total.value = parsed.total
    markListReady()
  }
  catch {
    if (seq !== listFetchSeq)
      return
    pageRows.value = []
    total.value = 0
    notify('用户列表加载失败，请稍后重试', 'error')
  }
  finally {
    if (seq === listFetchSeq)
      loading.value = false
  }
}

const runRefreshList = useClientListFetch(refreshList)

watch(
  () => [page.value, pageSize.value, applied.value] as const,
  ([, , query]) => {
    void runRefreshList(`${page.value}:${pageSize.value}:${JSON.stringify(query)}`)
  },
  { immediate: true, deep: true },
)

watch(pageSize, () => {
  page.value = 1
})

function search() {
  applied.value = { ...draft }
  page.value = 1
}

function reset() {
  Object.assign(draft, {
    keyword: '',
    status: '__all__',
    deleted: '__all__',
    inviterId: '',
    source: '',
  })
  search()
}

function editIdentity(user: AdminUser) {
  identityUser.value = user
  identityModalOpen.value = true
}

function saveIdentity() {
  notify(t('user.identityOk'))
  void refreshList()
}

function openRebind(user: AdminUser) {
  rebindUser.value = user
  rebindModalOpen.value = true
}

function saveRebind() {
  void refreshList()
}

function confirmStatus(user: AdminUser) {
  statusUser.value = user
  statusConfirmOpen.value = true
}

async function saveStatus() {
  if (!statusUser.value)
    return
  statusSaving.value = true
  try {
    const action = statusUser.value.status === 1 ? 'disable' : 'enable'
    const res = await userApi.manage(statusUser.value.id, action)
    if (!isApiSuccess(res)) {
      notify(res?.message ?? '操作失败，请稍后重试', 'error')
      return
    }
    notify(action === 'disable' ? '用户已封禁' : '用户已解封')
    statusConfirmOpen.value = false
    await refreshList()
  }
  catch {
    notify('操作失败，请稍后重试', 'error')
  }
  finally {
    statusSaving.value = false
  }
}

function confirmDelete(user: AdminUser) {
  deleteUser.value = user
  deleteConfirmOpen.value = true
}

async function saveDelete() {
  if (!deleteUser.value)
    return
  deleteSaving.value = true
  try {
    const res = await userApi.delete(deleteUser.value.id)
    if (!isApiSuccess(res)) {
      notify(res?.message ?? '注销失败，请稍后重试', 'error')
      return
    }
    notify('用户已注销')
    deleteConfirmOpen.value = false
    await refreshList()
  }
  catch {
    notify('注销失败，请稍后重试', 'error')
  }
  finally {
    deleteSaving.value = false
  }
}

const runtimeConfig = useRuntimeConfig()
const consoleOpeningId = ref<number | null>(null)

/**
 * 控制台：以该用户身份打开创作台（新窗口）。
 * 先同步开一个空白窗口再填地址，避免 await 之后 window.open 被浏览器当弹窗拦掉。
 */
async function openUserConsole(user: AdminUser) {
  if (consoleOpeningId.value != null)
    return
  consoleOpeningId.value = user.id
  const win = window.open('', '_blank')
  try {
    const res = await userApi.consoleAccess(user.id) as { success?: boolean, message?: string, data?: { path?: string } }
    const path = res?.data?.path
    if (!isApiSuccess(res) || !path) {
      win?.close()
      notify(res?.message || '打开控制台失败', 'error')
      return
    }
    const studio = String((runtimeConfig.public as any).studioUrl || 'https://www.easytv.ai').replace(/\/+$/, '')
    const url = `${studio}${path}`
    if (win) {
      win.opener = null
      win.location.href = url
    }
    else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    notify(`已以「${user.nickname || user.username}」身份打开创作台`)
  }
  catch {
    win?.close()
    notify('打开控制台失败，请稍后重试', 'error')
  }
  finally {
    consoleOpeningId.value = null
  }
}

function gotoWallet(user: AdminUser) {
  const keyword = user.username || user.nickname || ''
  return navigateTo(localePath({ path: '/wallet', query: keyword ? { keyword } : undefined }))
}

function gotoNotification(user: AdminUser) {
  return navigateTo(localePath({ path: '/notification', query: { userId: String(user.id) } }))
}

function gotoAudit(user: AdminUser) {
  return navigateTo(localePath({ path: '/audit', query: { userId: String(user.id) } }))
}

function moreItems(user: AdminUser): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [
    { label: '身份管理', onSelect: () => editIdentity(user) },
    { label: '邀请', onSelect: () => openInvites(user) },
    { label: '会员积分', onSelect: () => { void gotoWallet(user) } },
    { label: '通知', onSelect: () => { void gotoNotification(user) } },
    { label: '使用日志', onSelect: () => { void gotoAudit(user) } },
  ]
  if (isSuperAdmin.value) {
    items.push({
      label: t('user.rebindTitle'),
      onSelect: () => openRebind(user),
    })
  }
  items.push({ label: '注销', color: 'error', onSelect: () => confirmDelete(user) })
  return items
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('user.title')" :page-description="t('user.description')" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="账号 / 用户名">
          <UInput v-model="draft.keyword" placeholder="请输入账号或用户名" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="状态">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="账号">
          <USelect v-model="draft.deleted" :items="deletedItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="邀请人 ID">
          <UInput v-model="draft.inviterId" type="number" min="1" placeholder="只看某个用户邀请来的人" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="注册来源">
          <UInput v-model="draft.source" placeholder="utm_source，例如 bilibili" class="w-full" @keyup.enter="search" />
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
      <UEmpty
        v-else-if="pageRows.length === 0"
        icon="i-lucide-users"
        :title="t('user.empty')"
        :description="t('user.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">头像</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">用户名</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">账号</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">ID</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">UUID</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">身份</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">邀请人</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">来源</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="user in pageRows" :key="user.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <img
                    v-if="isHttpAvatar(user.avatar)"
                    :src="user.avatar!"
                    :alt="user.nickname"
                    class="size-8 shrink-0 rounded-full object-cover"
                  >
                  <span
                    v-else
                    class="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    :style="{ backgroundColor: user.avatar || '#94a3b8' }"
                  >
                    {{ avatarLetter(user) }}
                  </span>
                </td>
                <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                  <div class="truncate" :title="user.nickname || undefined">{{ user.nickname || '—' }}</div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                  {{ user.username || user.mobile || '—' }}
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                  {{ user.id }}
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                  {{ user.uuid || '—' }}
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  {{ identityText(user) }}
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <button
                    v-if="user.inviterId > 0"
                    type="button"
                    class="inline-flex items-center gap-1 text-primary hover:underline"
                    :title="`按邀请人 #${user.inviterId} 筛选`"
                    @click="filterByInviter(user.inviterId)"
                  >
                    <span>{{ user.inviterNickname || `#${user.inviterId}` }}</span>
                    <span v-if="user.inviterNickname" class="font-mono text-xs text-zinc-400">#{{ user.inviterId }}</span>
                  </button>
                  <span v-else class="text-zinc-400">—</span>
                  <UBadge v-if="user.inviteBlocked" color="warning" variant="subtle" class="ml-1">奖励已冻结</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <span v-if="user.source" class="text-xs">{{ user.source }}</span>
                  <span v-if="user.bonusCode" class="ml-1 font-mono text-xs text-zinc-400">{{ user.bonusCode }}</span>
                  <span v-if="!user.source && !user.bonusCode" class="text-xs text-zinc-400">—</span>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="user.deleted ? 'neutral' : user.status === 1 ? 'success' : 'error'" variant="subtle">
                    {{ user.deleted ? '已注销' : user.status === 1 ? '正常' : '禁用' }}
                  </UBadge>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div v-if="!user.deleted" class="flex w-max flex-nowrap items-center gap-1">
                    <UButton
                      type="button"
                      size="sm"
                      variant="soft"
                      color="primary"
                      :loading="consoleOpeningId === user.id"
                      :disabled="user.status !== 1 || (consoleOpeningId != null && consoleOpeningId !== user.id)"
                      :title="user.status !== 1 ? '已禁用的用户无法打开控制台' : '以该用户身份打开创作台'"
                      @click="() => { void openUserConsole(user) }"
                    >
                      控制台
                    </UButton>
                    <UButton
                      type="button"
                      size="sm"
                      variant="soft"
                      :color="user.status === 1 ? 'error' : 'success'"
                      @click="confirmStatus(user)"
                    >
                      {{ user.status === 1 ? '封禁' : '解封' }}
                    </UButton>
                    <UDropdownMenu
                      :items="moreItems(user)"
                      :content="{ align: 'end' }"
                      :ui="{
                        content: 'min-w-40 !p-0 gap-0',
                        group: '!p-0',
                        item: 'cursor-pointer rounded-none hover:bg-zinc-100 data-highlighted:bg-zinc-100 dark:hover:bg-zinc-800 dark:data-highlighted:bg-zinc-800',
                      }"
                    >
                      <UButton type="button" size="sm" variant="soft" color="neutral" icon="i-lucide-ellipsis" square aria-label="更多操作" />
                    </UDropdownMenu>
                  </div>
                  <span v-else class="text-zinc-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :disabled="loading"
        />
      </template>
    </div>

    <UserIdentityModal
      v-model:open="identityModalOpen"
      :user="identityUser"
      @saved="saveIdentity"
    />
    <UserRebindModal
      v-model:open="rebindModalOpen"
      :user="rebindUser"
      @saved="saveRebind"
    />

    <UserInviteDrawer
      v-model:open="inviteDrawerOpen"
      :user="inviteUser"
      @block-changed="onInviteBlockChanged"
    />
    <UModal
      v-model:open="statusConfirmOpen"
      :title="statusUser?.status === 1 ? '确认封禁用户' : '确认解封用户'"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          确定要{{ statusUser?.status === 1 ? '封禁' : '解封' }}用户“{{ statusUser?.nickname }}”吗？
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="statusSaving" @click="() => { statusConfirmOpen = false }">
          取消
        </UButton>
        <UButton
          type="button"
          :color="statusUser?.status === 1 ? 'error' : 'success'"
          :loading="statusSaving"
          :disabled="statusSaving"
          @click="saveStatus"
        >
          {{ statusSaving ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>
    <UModal
      v-model:open="deleteConfirmOpen"
      title="确认注销用户"
      :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          确定要注销用户“{{ deleteUser?.nickname }}”吗？该操作不可撤销。
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="deleteSaving" @click="() => { deleteConfirmOpen = false }">
          取消
        </UButton>
        <UButton
          type="button"
          color="error"
          :loading="deleteSaving"
          :disabled="deleteSaving"
          @click="saveDelete"
        >
          {{ deleteSaving ? '处理中…' : '确认注销' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
