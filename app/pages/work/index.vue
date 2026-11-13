<script setup lang="ts">
import { adminCategoryApi, adminWorkApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import qiniu from '~/api/qiniu'
import type { AdminWork } from '~/types/easytv-admin'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'
import { SELECT_ITEM_ALL } from '~/utils/consoleSelectItems'

const { t } = useI18n()
useHead({ title: () => t('work.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminWork[]>([])
const draft = reactive({ title: '', status: '__all__', lang: SELECT_ITEM_ALL })
const applied = ref({ title: '', status: '__all__', lang: SELECT_ITEM_ALL })
const formOpen = ref(false)
const editing = ref<AdminWork | null>(null)
const form = reactive({ title: '', description: '', category: '', cover: '' })
const errors = reactive({ title: '' })
const saving = ref(false)
const uploading = ref(false)
const coverFile = ref<File | null>(null)
const COVER_MAX_BYTES = 8 * 1024 * 1024
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const coverPreviewUrl = computed(() => form.cover.trim() ? resolveMediaUrl(form.cover) : '')
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminWork | null>(null)
const confirming = ref(false)

/** 与旧模板兼容：filtered/pageRows 直接指向服务端当前页 */
const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
const DRAFT_DEFAULT = { title: '', status: '__all__', lang: SELECT_ITEM_ALL }
const API = adminWorkApi
const LANGS = ['zh', 'en', 'ja', 'ko', 'es', 'fr'] as const
const langItems = computed(() => [
  { label: t('work.langAll'), value: SELECT_ITEM_ALL },
  ...LANGS.map(code => ({ label: t(`work.lang.${code}`), value: code })),
])
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.onShelf'), value: '1' },
  { label: t('common.offShelf'), value: '2' },
])
const categories = ref<string[]>([])
const formCategoryItems = computed(() => {
  const list = categories.value.map(name => ({ label: name, value: name }))
  if (form.category && !categories.value.includes(form.category))
    list.unshift({ label: form.category, value: form.category })
  return list
})
const filteredWorks = filtered
const raws = new Map<number, any>()
function langOf(item: AdminWork) {
  const code = String(raws.get(item.id)?.lang || 'zh')
  return (LANGS as readonly string[]).includes(code) ? t(`work.lang.${code}`) : code
}
function formatDuration(sec: number) {
  const total = Math.max(0, Math.round(Number(sec) || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function toRow(item: any): AdminWork {
  raws.set(item.id, item)
  return {
    id: item.id,
    uuid: String(item.id),
    title: item.title,
    cover: resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER,
    authorName: item.author?.nickname || `#${item.user_id}`,
    duration: formatDuration(item.duration),
    playCount: Number(item.view_count) || 0,
    likeCount: Number(item.like_count) || 0,
    status: item.status === 1 ? 1 : 2,
    createdAt: formatUnix(item.created_at),
  }
}
function LIST_FN() {
  return API.list({
    page: page.value,
    page_size: pageSize.value,
    keyword: applied.value.title || undefined,
    status: applied.value.status === '__all__' ? undefined : applied.value.status,
    lang: applied.value.lang === SELECT_ITEM_ALL ? undefined : applied.value.lang,
  })
}

async function loadCategories() {
  const raw = await adminCategoryApi.list({ scope: 'work', status: 1 })
  const parsed = parsePaged(raw)
  if (parsed)
    categories.value = parsed.items.map((item: any) => String(item.name))
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await LIST_FN()
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('work.loadFail'), 'error')
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
  void loadCategories()
  void fetchList()
})
watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

function search() {
  applied.value = { ...draft }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, DRAFT_DEFAULT)
  search()
}
function openEdit(item: AdminWork) {
  editing.value = item
  uploading.value = false
  coverFile.value = null
  const raw = raws.get(item.id) ?? {}
  Object.assign(form, {
    title: item.title,
    description: raw.description ?? '',
    category: raw.category ?? '',
    cover: raw.cover_url ?? '',
  })
  errors.title = ''
  formOpen.value = true
}
function validate() {
  errors.title = form.title.trim() ? '' : t('work.titleRequired')
  return !errors.title
}
function clearCover() {
  if (uploading.value)
    return
  coverFile.value = null
  form.cover = ''
}
async function onCoverFile(value: File | File[] | null | undefined) {
  const file = Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  coverFile.value = file
  if (!file) {
    form.cover = ''
    return
  }
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
  if (!COVER_EXTS.includes(ext)) {
    coverFile.value = null
    notify(t('common.imageTypeOnly'), 'error')
    return
  }
  if (file.size > COVER_MAX_BYTES) {
    coverFile.value = null
    notify(t('common.imageTooLarge', { n: 8 }), 'error')
    return
  }
  uploading.value = true
  try {
    form.cover = await qiniu.uploadImage(file)
    coverFile.value = null
    notify(t('common.coverUploaded'))
  }
  catch (error: any) {
    coverFile.value = null
    notify(error?.message || t('common.uploadFail'), 'error')
  }
  finally {
    uploading.value = false
  }
}
async function submit() {
  if (!validate() || uploading.value || !editing.value)
    return
  saving.value = true
  try {
    const raw = await API.update(editing.value.id, {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      cover_url: form.cover.trim(),
    })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(t('work.updated'))
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminWork, action: 'status' | 'delete') {
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
      ? await API.remove(item.id)
      : await API.setStatus(item.id, item.status === 1 ? 2 : 1)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? t('work.deleted') : (item.status === 1 ? t('work.offShelf') : t('work.onShelf')))
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
    <ManagePageHeader :page-title="t('work.title')" :page-description="t('work.description')" />

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.title')">
          <UInput icon="i-lucide-search" v-model="draft.title" :placeholder="t('work.titlePh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.status')">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </ManageFilterField>
        <ManageFilterField :label="t('work.langLabel')">
          <USelect v-model="draft.lang" :items="langItems" value-key="value" class="w-full" />
        </ManageFilterField>
    </ManageFilterBar>

    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
        <span class="text-sm">{{ t('common.loading') }}</span>
      </div>
      <UEmpty
        v-else-if="pageRows.length === 0"
        icon="i-lucide-clapperboard"
        :title="t('work.empty')"
        :description="t('work.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.title') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('work.colAuthor') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('work.langLabel') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('work.colDuration') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('work.colPlayCount') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('work.colLikes') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.createTime') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="work in pageRows" :key="work.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img
                        :src="work.cover || DEFAULT_WORK_COVER"
                        alt=""
                        class="h-full w-full object-cover"
                      >
                    </div>
                    <div class="min-w-0">
                      <div class="truncate font-medium" :title="work.title">{{ work.title }}</div>
                      <div class="mt-0.5 truncate font-mono text-xs text-zinc-400" :title="work.uuid">#{{ work.uuid }}</div>
                    </div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ work.authorName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ langOf(work) }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ work.duration }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ work.playCount.toLocaleString() }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ work.likeCount.toLocaleString() }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="work.status === 1 ? 'success' : 'neutral'" variant="subtle">
                    {{ work.status === 1 ? t('common.onShelf') : t('common.offShelf') }}
                  </UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ work.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(work)">{{ t('common.edit') }}</UButton>
                    <UButton
                      type="button"
                      size="sm"
                      variant="soft"
                      :color="work.status === 1 ? 'warning' : 'success'"
                      @click="requestConfirm(work, 'status')"
                    >
                      {{ work.status === 1 ? t('common.takeDown') : t('common.putOn') }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(work, 'delete')">
                      {{ t('common.delete') }}
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
        />
      </template>
    </div>

    <UModal
      v-model:open="formOpen"
      :title="t('work.editTitle')"
      :description="t('work.officialHint')"
      :ui="{ content: 'w-[min(96vw,36rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UFormField :label="t('common.title')" required :error="errors.title || undefined">
          <UInput v-model="form.title" maxlength="40" :placeholder="t('work.titlePh')" class="w-full" />
        </UFormField>
        <UFormField :label="t('work.colAuthor')">
          <UInput :model-value="editing?.authorName ?? ''" disabled class="w-full" />
        </UFormField>
        <UFormField :label="t('common.category')">
          <USelect v-model="form.category" :items="formCategoryItems" value-key="value" :placeholder="t('skill.categoryRequired')" class="w-full" />
        </UFormField>
        <UFormField :label="t('skill.review.descriptionLabel')" :hint="t('common.optional')">
          <UTextarea v-model="form.description" :rows="3" maxlength="1000" :placeholder="t('skill.descRequired')" class="w-full" />
        </UFormField>
        <UFormField :label="t('common.cover')">
          <div v-if="coverPreviewUrl" class="relative">
            <img :src="coverPreviewUrl" alt="" class="aspect-video w-full rounded-lg object-cover">
            <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearCover">
              {{ t('common.clear') }}
            </UButton>
          </div>
          <UFileUpload
            v-else
            :model-value="coverFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            :label="uploading ? t('common.uploading') : t('common.uploadCover')"
            :description="t('work.coverHint')"
            class="w-full min-h-40"
            :disabled="uploading"
            @update:model-value="onCoverFile"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="submit">{{ saving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? t('work.confirmDelete') : t('work.confirmStatus', { action: confirmItem?.status === 1 ? t('common.takeDown') : t('common.putOn') })"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      <template v-if="confirmAction === 'delete'">{{ t('work.confirmDeleteBody', { name: confirmItem?.title }) }}</template>
      <template v-else>{{ t('common.confirmNamed', { action: confirmItem?.status === 1 ? t('common.takeDown') : t('common.putOn'), name: confirmItem?.title }) }}</template>
    </ManageConfirmModal>
  </div>
</template>
