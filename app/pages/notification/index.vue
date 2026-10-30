<script setup lang="ts">
import settingApi from '~/api/setting'
import { adminNotificationApi, NOTIFICATION_SETTING_KEY } from '~/api/notification'
import { formatUnix, isOk, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('notification.pageTitle') })
definePageMeta({ layout: 'console' })

const route = useRoute()
const { notify } = useNotifyToast()

type NoticeType = 'work' | 'comment' | 'like' | 'task' | 'system'
type AdminNotification = {
  id: number
  userId: number
  userName: string
  type: NoticeType
  title: string
  content: string
  link: string
  unread: boolean
  createdAt: string
}

const ALL_TYPES: NoticeType[] = ['work', 'comment', 'like', 'task', 'system']
const TYPE_ITEMS = computed(() => [
  { value: 'work' as const, label: t('notification.typeWork'), desc: t('notification.typeWorkDesc') },
  { value: 'comment' as const, label: t('notification.typeComment'), desc: t('notification.typeCommentDesc') },
  { value: 'like' as const, label: t('notification.typeLike'), desc: t('notification.typeLikeDesc') },
  { value: 'task' as const, label: t('notification.typeTask'), desc: t('notification.typeTaskDesc') },
  { value: 'system' as const, label: t('notification.typeSystem'), desc: t('notification.typeSystemDesc') },
])
const TYPE_LABEL = computed<Record<NoticeType, string>>(() => ({
  work: t('notification.typeWork'),
  comment: t('notification.typeComment'),
  like: t('notification.typeLike'),
  task: t('notification.typeTask'),
  system: t('notification.typeSystem'),
}))

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminNotification[]>([])
const draft = reactive({
  keyword: '',
  userId: '',
  type: '__all__',
  unread: '__all__',
})
const applied = ref({ ...draft })

const filterTypeItems = computed(() => [
  { label: t('common.allTypes'), value: '__all__' },
  ...TYPE_ITEMS.value.map(item => ({ label: item.label, value: item.value })),
])
const unreadItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.unread'), value: '1' },
])
const scopeItems = computed(() => [
  { label: t('notification.scopeOne'), value: 'one' },
  { label: t('notification.scopeAll'), value: 'all' },
])
const sendTypeItems = computed(() => TYPE_ITEMS.value.map(item => ({ label: item.label, value: item.value })))

const typeEnabled = reactive<Record<NoticeType, boolean>>({
  work: true,
  comment: true,
  like: true,
  task: true,
  system: true,
})
const typeSaving = ref(false)

const formOpen = ref(false)
const form = reactive({
  scope: 'one' as 'one' | 'all',
  userId: '',
  type: 'system' as NoticeType,
  title: '',
  content: '',
  link: '',
})
const errors = reactive({ userId: '', title: '' })
const saving = ref(false)

const confirmOpen = ref(false)
const confirmAction = ref<'delete' | 'sendAll'>('delete')
const confirmItem = ref<AdminNotification | null>(null)
const confirming = ref(false)

const pageRows = computed(() => rows.value)

function toRow(item: any): AdminNotification {
  return {
    id: item.id,
    userId: Number(item.user_id) || 0,
    userName: item.user_name || `#${item.user_id}`,
    type: (ALL_TYPES.includes(item.type as NoticeType) ? item.type : 'system') as NoticeType,
    title: item.title || '',
    content: item.content || '',
    link: item.link || '',
    unread: !Number(item.read_at),
    createdAt: formatUnix(item.created_at),
  }
}

function enabledValue() {
  const on = ALL_TYPES.filter(type => typeEnabled[type])
  if (on.length === ALL_TYPES.length)
    return ''
  return on.join(',')
}

async function loadTypes() {
  const raw = await adminNotificationApi.types()
  const types = (raw as any)?.data?.types
  if (!isOk(raw) || !Array.isArray(types)) {
    notify((raw as any)?.message ?? t('notification.typeLoadFail'), 'error')
    return
  }
  for (const type of ALL_TYPES)
    typeEnabled[type] = true
  for (const item of types as any[]) {
    const type = item?.type as NoticeType
    if (!ALL_TYPES.includes(type))
      continue
    typeEnabled[type] = !!item.enabled
  }
}

async function saveTypes() {
  if (typeSaving.value)
    return
  typeSaving.value = true
  try {
    const raw = await settingApi.update(NOTIFICATION_SETTING_KEY, { value: enabledValue() })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('notification.typeSaveFail'), 'error')
      await loadTypes()
      return
    }
    notify(t('notification.typeSaved'))
  }
  finally {
    typeSaving.value = false
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminNotificationApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.keyword || undefined,
      user_id: applied.value.userId ? Number(applied.value.userId) : undefined,
      type: applied.value.type === '__all__' ? undefined : applied.value.type,
      unread: applied.value.unread === '1' ? '1' : undefined,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('notification.loadFail'), 'error')
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
  if (userId) {
    draft.userId = userId
    applied.value = { ...draft }
  }
  void loadTypes()
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = {
    keyword: draft.keyword.trim(),
    userId: draft.userId.trim(),
    type: draft.type,
    unread: draft.unread,
  }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { keyword: '', userId: '', type: '__all__', unread: '__all__' })
  search()
}

function openSend() {
  Object.assign(form, {
    scope: 'one',
    userId: draft.userId.trim(),
    type: 'system',
    title: '',
    content: '',
    link: '',
  })
  Object.assign(errors, { userId: '', title: '' })
  formOpen.value = true
}

function validateSend() {
  errors.title = form.title.trim() ? '' : t('notification.titleRequired')
  if (form.scope === 'one') {
    const id = Number(form.userId.trim())
    errors.userId = id > 0 && Number.isInteger(id) ? '' : t('notification.userIdRequired')
  }
  else {
    errors.userId = ''
  }
  return !errors.title && !errors.userId
}

function requestSend() {
  if (!validateSend() || saving.value)
    return
  if (form.scope === 'all') {
    confirmAction.value = 'sendAll'
    confirmItem.value = null
    confirmOpen.value = true
    return
  }
  void submitSend()
}

async function submitSend() {
  if (!validateSend())
    return
  saving.value = true
  try {
    const userId = form.scope === 'one' ? Number(form.userId.trim()) : 0
    const raw = await adminNotificationApi.send({
      user_id: userId || undefined,
      type: form.type,
      title: form.title.trim(),
      content: form.content.trim(),
      link: form.link.trim(),
    })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('notification.sendFail'), 'error')
      return
    }
    const sent = Number((raw as any)?.data?.sent)
    notify(form.scope === 'all' ? t('notification.sentAll', { count: sent || '—' }) : t('notification.sentOne'))
    formOpen.value = false
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}

function requestDelete(item: AdminNotification) {
  confirmItem.value = item
  confirmAction.value = 'delete'
  confirmOpen.value = true
}

async function confirm() {
  if (confirmAction.value === 'sendAll') {
    await submitSend()
    return
  }
  if (!confirmItem.value)
    return
  confirming.value = true
  try {
    const raw = await adminNotificationApi.remove(confirmItem.value.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('notification.deleteFail'), 'error')
      return
    }
    notify(t('notification.deleted'))
    confirmOpen.value = false
    await fetchList(`d-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('notification.title')" :page-description="t('notification.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-send" @click="openSend">{{ t('notification.send') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold">{{ t('notification.typeSwitch') }}</h2>
          <p class="mt-1 text-xs text-zinc-500">{{ t('notification.typeSwitchHint') }}</p>
        </div>
        <UButton type="button" :loading="typeSaving" :disabled="typeSaving" @click="saveTypes">
          {{ typeSaving ? t('common.saving') : t('notification.saveSwitch') }}
        </UButton>
      </div>
      <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <li v-for="item in TYPE_ITEMS" :key="item.value" class="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <label class="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <strong class="block text-sm">{{ item.label }}</strong>
              <span class="mt-1 block text-xs text-zinc-500">{{ item.desc }}</span>
            </span>
            <USwitch
              :model-value="typeEnabled[item.value]"
              :disabled="typeSaving"
              @click.stop
              @update:model-value="typeEnabled[item.value] = $event"
            />
          </label>
        </li>
      </ul>
    </UCard>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UFormField :label="t('common.keyword')">
          <UInput v-model="draft.keyword" :placeholder="t('notification.keywordPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('common.userId')">
          <UInput v-model="draft.userId" :placeholder="t('notification.userIdPh')" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField :label="t('common.type')">
          <USelect v-model="draft.type" :items="filterTypeItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.status')">
          <USelect v-model="draft.unread" :items="unreadItems" value-key="value" class="w-full" />
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
        icon="i-lucide-bell"
        :title="t('notification.empty')"
        :description="t('notification.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('notification.colUser') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.title') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.content') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('notification.colSentAt') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3" :title="`${item.userName} #${item.userId}`">{{ item.userName }}<span class="ml-1 text-xs text-zinc-400">#{{ item.userId }}</span></td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ TYPE_LABEL[item.type] }}</td>
                <td class="max-w-0 w-full px-4 py-3 font-medium">
                  <p class="truncate" :title="item.title">{{ item.title }}</p>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500" :title="item.content">{{ item.content || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.unread ? 'warning' : 'neutral'" variant="subtle">{{ item.unread ? t('common.unread') : t('common.read') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">{{ t('common.delete') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="t('notification.send')" :ui="{ content: 'w-[min(96vw,36rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('notification.scope')" required>
            <USelect v-model="form.scope" :items="scopeItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField v-if="form.scope === 'one'" :label="t('common.userId')" required :error="errors.userId || undefined">
            <UInput v-model="form.userId" :placeholder="t('notification.userIdRequired')" class="w-full" />
          </UFormField>
          <UFormField :label="t('notification.noticeType')" required>
            <USelect v-model="form.type" :items="sendTypeItems" value-key="value" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.title')" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="100" :placeholder="t('notification.titlePh')" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.content')" :hint="t('notification.contentHint')">
            <UTextarea v-model="form.content" :rows="4" maxlength="500" :placeholder="t('notification.contentPh')" class="w-full" />
          </UFormField>
          <UFormField :label="t('notification.link')" :hint="t('notification.linkHint')">
            <UInput v-model="form.link" maxlength="300" placeholder="/settings?tab=notify" class="w-full" />
          </UFormField>
          <p v-if="!typeEnabled[form.type]" class="text-xs text-amber-600">{{ t('notification.typeOffHint') }}</p>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="requestSend">
          {{ saving ? t('common.sending') : t('common.send') }}
        </UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('notification.confirmDelete') : t('notification.confirmSendAll')"
      :tone="confirmAction === 'delete' ? 'error' : 'primary'"
      :icon="confirmAction === 'delete' ? '' : 'i-lucide-send'"
      :confirm-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      :loading-text="t('common.processing')"
      :loading="confirming || saving"
      @confirm="confirm"
    >
      <template v-if="confirmAction === 'delete'">{{ t('notification.confirmDeleteBody', { title: confirmItem?.title }) }}</template>
      <template v-else>{{ t('notification.confirmSendAllBody', { title: form.title.trim() }) }}</template>
    </ManageConfirmModal>
  </div>
</template>
