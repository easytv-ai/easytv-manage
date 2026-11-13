<script setup lang="ts">
import type { AdminNotice } from '~/types/easytv-admin'
import { adminNoticeApi } from '~/api/content'
import { formatUnix, isOk, parsePaged } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('notice.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminNotice[]>([])
const draft = reactive({ title: '', status: '__all__' })
const applied = ref({ ...draft })
const formOpen = ref(false)
const editing = ref<AdminNotice | null>(null)
const form = reactive({ title: '', content: '', type: 'system' as 'system' | 'activity', pinned: false })
const errors = reactive({ title: '', content: '' })
const saving = ref(false)
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminNotice | null>(null)
const confirming = ref(false)

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.published'), value: '1' },
  { label: t('common.unpublished'), value: '2' },
])
const typeItems = computed(() => [
  { label: t('common.systemNotice'), value: 'system' },
  { label: t('common.activityNotice'), value: 'activity' },
])

const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
/** 原始类型 / 置顶回填编辑表单 */
const extra = new Map<number, { type: 'system' | 'activity', pinned: boolean }>()

function toRow(item: any): AdminNotice {
  extra.set(item.id, { type: item.type === 'activity' ? 'activity' : 'system', pinned: Boolean(item.pinned) })
  return {
    id: item.id,
    title: (item.pinned ? t('notice.pinPrefix') : '') + item.title,
    content: item.content,
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.published_at || item.created_at),
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminNoticeApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.title || undefined,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('notice.loadFail'), 'error')
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

onMounted(() => void fetchList())
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { title: draft.title.trim(), status: draft.status }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, { title: '', status: '__all__' })
  search()
}
function openCreate() {
  editing.value = null
  Object.assign(form, { title: '', content: '', type: 'system', pinned: false })
  Object.assign(errors, { title: '', content: '' })
  formOpen.value = true
}
function stripPinPrefix(title: string) {
  for (const prefix of [t('notice.pinPrefix'), '【置顶】', '【置頂】', '[Pinned] ']) {
    if (prefix && title.startsWith(prefix))
      return title.slice(prefix.length)
  }
  return title
}
function openEdit(item: AdminNotice) {
  editing.value = item
  const meta = extra.get(item.id)
  Object.assign(form, { title: stripPinPrefix(item.title), content: item.content, type: meta?.type ?? 'system', pinned: meta?.pinned ?? false })
  Object.assign(errors, { title: '', content: '' })
  formOpen.value = true
}
function validate() {
  errors.title = form.title.trim() ? '' : t('notice.titleRequired')
  errors.content = form.content.trim() ? '' : t('notice.contentRequired')
  return !errors.title && !errors.content
}
async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload = { title: form.title.trim(), content: form.content.trim(), type: form.type, pinned: form.pinned }
    const raw = editing.value
      ? await adminNoticeApi.update(editing.value.id, payload)
      : await adminNoticeApi.create({ ...payload, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editing.value ? t('notice.updated') : t('notice.created'))
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminNotice, action: 'status' | 'delete') {
  confirmItem.value = item
  confirmAction.value = action
  confirmOpen.value = true
}
async function confirm() {
  if (!confirmItem.value)
    return
  confirming.value = true
  try {
    const item = confirmItem.value
    const raw = confirmAction.value === 'delete'
      ? await adminNoticeApi.remove(item.id)
      : await adminNoticeApi.update(item.id, { status: item.status === 1 ? 2 : 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? t('notice.deleted') : (item.status === 1 ? t('notice.unpublished') : t('notice.published')))
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('notice.title')" :page-description="t('notice.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('notice.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('notice.titleField')">
          <UInput icon="i-lucide-search" v-model="draft.title" :placeholder="t('notice.titleField')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </ManageFilterField>
    </ManageFilterBar>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-megaphone" :title="t('notice.empty')" :description="t('notice.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('notice.titleField') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.content') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                  <p class="truncate" :title="item.title">{{ item.title }}</p>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">
                  <p class="max-w-xs truncate" :title="item.content">{{ item.content }}</p>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('common.published') : t('notice.offline') }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ item.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? t('common.unpublish') : t('common.publish') }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? t('notice.editTitle') : t('notice.createTitle')" :ui="{ content: 'w-[min(96vw,36rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('notice.titleField')" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="40" :placeholder="t('notice.titlePh')" class="w-full" />
          </UFormField>
          <UFormField :label="t('notice.contentLabel')" required :hint="t('notice.contentHint')" :error="errors.content || undefined">
            <UTextarea v-model="form.content" :rows="5" maxlength="500" :placeholder="t('notice.contentRequired')" class="w-full" />
          </UFormField>
          <div class="grid items-stretch gap-4 sm:grid-cols-2">
            <UFormField :label="t('common.type')">
              <USelect v-model="form.type" :items="typeItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('common.pin')"
              :ui="{
                root: 'flex h-full flex-col',
                container: 'mt-1 flex min-h-9 flex-1 items-center',
              }"
            >
              <USwitch
                v-model="form.pinned"
                :label="t('notice.pin')"
                :ui="{
                  root: 'relative inline-flex items-center',
                  base: 'leading-none',
                  wrapper: 'ms-2 flex items-center',
                  label: 'text-sm font-normal leading-5',
                }"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="submit">{{ saving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('notice.confirmDelete') : t('common.confirmStatusNamed', { action: confirmItem?.status === 1 ? t('common.unpublish') : t('common.publish'), kind: t('common.kindNotice') })"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :icon="confirmAction !== 'delete' && confirmItem?.status !== 1 ? 'i-lucide-megaphone' : ''"
      :loading="confirming"
      @confirm="confirm"
    >
      {{ t('common.confirmNamed', { action: confirmAction === 'delete' ? t('common.delete') : (confirmItem?.status === 1 ? t('common.unpublish') : t('common.publish')), name: confirmItem?.title }) }}
    </ManageConfirmModal>
  </div>
</template>
