<script setup lang="ts">
import { adminStyleApi, isOk, parsePaged, type AdminStylePayload } from '~/api/creative'
import qiniu from '~/api/qiniu'
import { CONSOLE_DEFAULT_PAGE_SIZE } from '~/utils/consoleSelectItems'

const { t } = useI18n()
useHead({ title: () => t('style.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const { loading, listReady, beginListLoad, markListReady } = useListReadyState()

type StyleKind = 'image' | 'video'

type StyleRow = {
  id: number
  name: string
  coverUrl: string
  prompt: string
  negative: string
  tags: string[]
  category: string
  kinds: StyleKind[]
  uses: number
  sortOrder: number
  status: StyleStatus
  userId: number
  userNickname: string
  sourceAssetId: number
}

/** 1 可用（官方=已上架 / 用户=私有）、2 下架、3 待审核、4 已收录 */
type StyleStatus = 1 | 2 | 3 | 4

const rows = ref<StyleRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(CONSOLE_DEFAULT_PAGE_SIZE)

const draft = reactive({ keyword: '', category: '', status: '__all__', source: '__all__' })
const applied = ref({ ...draft })

const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('style.statusAvailable'), value: '1' },
  { label: t('common.offShelf'), value: '2' },
  { label: t('common.pendingReview'), value: '3' },
  { label: t('common.featured'), value: '4' },
])

const sourceItems = computed(() => [
  { label: t('common.allSources'), value: '__all__' },
  { label: t('common.official'), value: 'official' },
  { label: t('common.userSubmit'), value: 'user' },
])

const STATUS_COLOR: Record<StyleStatus, 'success' | 'neutral' | 'warning' | 'primary'> = { 1: 'success', 2: 'neutral', 3: 'warning', 4: 'primary' }

function statusLabel(item: StyleRow) {
  switch (item.status) {
    case 2: return t('common.offShelf')
    case 3: return t('common.pendingReview')
    case 4: return t('common.featured')
    default: return item.userId > 0 ? t('common.private') : t('style.onShelfPrivate')
  }
}

function isUserStyle(item: StyleRow) {
  return item.userId > 0
}

const kindsItems = computed(() => [
  { label: t('common.imageAndVideo'), value: 'all' },
  { label: t('common.imageOnly'), value: 'image' },
  { label: t('common.videoOnly'), value: 'video' },
])

function kindsLabel(kinds: StyleKind[]) {
  if (!kinds.length || (kinds.includes('image') && kinds.includes('video')))
    return t('common.both')
  return kinds.includes('video') ? t('common.video') : t('common.image')
}

function toRow(item: any): StyleRow {
  return {
    id: item.id,
    name: item.name ?? '',
    coverUrl: item.cover_url ?? '',
    prompt: item.prompt ?? '',
    negative: item.negative ?? '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    category: item.category ?? '',
    kinds: Array.isArray(item.kinds) ? item.kinds.filter((k: string) => k === 'image' || k === 'video') : [],
    uses: Number(item.uses) || 0,
    sortOrder: Number(item.sort_order) || 0,
    status: ([2, 3, 4].includes(Number(item.status)) ? Number(item.status) : 1) as StyleStatus,
    userId: Number(item.user_id) || 0,
    userNickname: item.user_nickname ?? '',
    sourceAssetId: Number(item.source_asset_id) || 0,
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminStyleApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.keyword || undefined,
      category: applied.value.category || undefined,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
      source: applied.value.source === '__all__' ? undefined : (applied.value.source as 'official' | 'user'),
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('style.loadFail'), 'error')
      return
    }
    const maxPage = Math.max(1, Math.ceil(parsed.total / pageSize.value) || 1)
    if (page.value > maxPage) {
      page.value = maxPage
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

function search() {
  applied.value = { ...draft }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { keyword: '', category: '', status: '__all__', source: '__all__' })
  search()
}

onMounted(() => {
  void fetchList()
})

watch([page, pageSize], ([, size], [, prevSize]) => {
  if (size !== prevSize)
    page.value = 1
  void fetchList(`${page.value}-${pageSize.value}`)
})

// ===== 风格表单 =====
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const COVER_MAX_BYTES = 8 * 1024 * 1024

const formOpen = ref(false)
const editing = ref<StyleRow | null>(null)
/** 编辑用户投稿时只放开分类 / 标签 / 排序，其余字段锁定 */
const editingUserStyle = computed(() => !!editing.value && isUserStyle(editing.value))
const form = reactive({ name: '', prompt: '', negative: '', coverUrl: '', tags: '', category: '', kinds: 'all', sortOrder: 0 })
const errors = reactive({ name: '', prompt: '' })
const saving = ref(false)
const uploading = ref(false)
const coverFile = ref<File | null>(null)

function resetForm() {
  Object.assign(form, { name: '', prompt: '', negative: '', coverUrl: '', tags: '', category: '', kinds: 'all', sortOrder: 0 })
  Object.assign(errors, { name: '', prompt: '' })
  uploading.value = false
  coverFile.value = null
}

function openCreate() {
  editing.value = null
  resetForm()
  formOpen.value = true
}

function openEdit(item: StyleRow) {
  editing.value = item
  resetForm()
  Object.assign(form, {
    name: item.name,
    prompt: item.prompt,
    negative: item.negative,
    coverUrl: item.coverUrl,
    tags: item.tags.join('、'),
    category: item.category,
    kinds: item.kinds.length === 1 ? item.kinds[0] : 'all',
    sortOrder: item.sortOrder,
  })
  formOpen.value = true
}

function validate() {
  errors.name = form.name.trim() ? '' : t('style.nameRequired')
  errors.prompt = form.prompt.trim() ? '' : t('style.promptRequired')
  return !errors.name && !errors.prompt
}

function clearCover() {
  if (uploading.value)
    return
  coverFile.value = null
  form.coverUrl = ''
}

async function onCoverFile(value: File | File[] | null | undefined) {
  const file = Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  coverFile.value = file
  if (!file)
    return
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`
  if (!COVER_EXTS.includes(ext)) {
    coverFile.value = null
    notify(t('common.imageTypeOnly'), 'error')
    return
  }
  if (file.size > COVER_MAX_BYTES) {
    coverFile.value = null
    notify(t('style.coverTooLarge'), 'error')
    return
  }
  uploading.value = true
  try {
    form.coverUrl = await qiniu.uploadImage(file)
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

async function save() {
  if (saving.value || uploading.value || !validate())
    return
  saving.value = true
  try {
    // 用户投稿的行：后端只允许改分类 / 标签 / 排序 / 状态
    const payload: AdminStylePayload = editing.value && isUserStyle(editing.value)
      ? {
          tags: form.tags.split(/[、,，]/).map(v => v.trim()).filter(Boolean),
          category: form.category.trim(),
          sort_order: Number(form.sortOrder) || 0,
        }
      : {
          name: form.name.trim(),
          prompt: form.prompt.trim(),
          negative: form.negative.trim(),
          cover_url: form.coverUrl.trim(),
          // 顿号和逗号都收，运营怎么顺手怎么填
          tags: form.tags.split(/[、,，]/).map(v => v.trim()).filter(Boolean),
          category: form.category.trim(),
          kinds: form.kinds === 'all' ? [] : [form.kinds],
          sort_order: Number(form.sortOrder) || 0,
        }
    const raw = editing.value
      ? await adminStyleApi.update(editing.value.id, payload)
      : await adminStyleApi.create(payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editing.value ? t('style.updated') : t('style.created'), 'success')
    formOpen.value = false
    void fetchList()
  }
  finally {
    saving.value = false
  }
}

async function setStatus(item: StyleRow, next: StyleStatus, okText = '') {
  const raw = await adminStyleApi.update(item.id, { status: next })
  if (!isOk(raw)) {
    notify(raw?.message ?? t('common.opFail'), 'error')
    return
  }
  item.status = next
  if (okText)
    notify(okText, 'success')
}

/** 官方行：上架 / 下架互切 */
function toggleStatus(item: StyleRow) {
  return setStatus(item, item.status === 1 ? 2 : 1)
}

/** 用户已收录的行：撤回收录，回到作者私有（status=1），公开列表不再显示 */
function unlistUserStyle(item: StyleRow) {
  return setStatus(item, 1, t('common.takeDown'))
}

// ===== 投稿审核 =====
const reviewOpen = ref(false)
const reviewItem = ref<StyleRow | null>(null)
const reviewApprove = ref(true)
const reviewReason = ref('')
const reviewing = ref(false)

function openReview(item: StyleRow, approve: boolean) {
  reviewItem.value = item
  reviewApprove.value = approve
  reviewReason.value = ''
  reviewOpen.value = true
}

async function doReview() {
  const item = reviewItem.value
  if (!item || reviewing.value)
    return
  reviewing.value = true
  try {
    const raw = await adminStyleApi.review(item.id, { approve: reviewApprove.value, reason: reviewReason.value.trim() || undefined })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('style.reviewFail'), 'error')
      return
    }
    item.status = reviewApprove.value ? 4 : 1
    notify(reviewApprove.value ? t('style.reviewedIn') : t('style.rejected'), 'success')
    reviewOpen.value = false
  }
  finally {
    reviewing.value = false
  }
}

const confirmOpen = ref(false)
const confirmItem = ref<StyleRow | null>(null)
const confirming = ref(false)

function requestDelete(item: StyleRow) {
  confirmItem.value = item
  confirmOpen.value = true
}

async function doDelete() {
  const item = confirmItem.value
  if (!item || confirming.value)
    return
  confirming.value = true
  try {
    const raw = await adminStyleApi.remove(item.id)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.deleteFail'), 'error')
      return
    }
    notify(t('common.deletedOk'), 'success')
    confirmOpen.value = false
    void fetchList()
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('style.title')" :page-description="t('style.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('style.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.keyword')">
          <UInput icon="i-lucide-search" v-model="draft.keyword" :placeholder="t('style.keywordPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.category')">
          <UInput v-model="draft.category" :placeholder="t('style.categoryPh')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.source')">
          <USelect v-model="draft.source" :items="sourceItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="!rows.length" icon="i-lucide-palette" :title="t('style.empty')" :description="t('style.emptyDesc')" class="min-h-72" />
      <template v-else>
      <div class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.name') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.category') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('style.colTags') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('style.colKinds') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('style.colUses') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.sort') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in rows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="max-w-0 w-full px-4 py-3 text-left">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                    <img v-if="item.coverUrl" :src="item.coverUrl" alt="" class="h-full w-full object-cover">
                    <UIcon v-else name="i-lucide-image-off" class="size-5 text-zinc-400" />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium" :title="item.name">{{ item.name }}</p>
                    <p class="truncate text-xs text-zinc-400" :title="item.prompt">{{ item.prompt }}</p>
                    <p v-if="isUserStyle(item)" class="mt-0.5 truncate text-xs text-zinc-400">
                      {{ t('common.author') }}：{{ item.userNickname || `${t('common.user')} #${item.userId}` }}
                      <span v-if="item.sourceAssetId > 0"> · {{ t('style.sourceAsset') }} #{{ item.sourceAssetId }}</span>
                    </p>
                  </div>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{{ item.category || '—' }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <div class="flex flex-nowrap gap-1">
                  <UBadge v-for="tag in item.tags" :key="tag" color="neutral" variant="subtle">{{ tag }}</UBadge>
                </div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 text-xs">{{ kindsLabel(item.kinds) }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.uses }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="STATUS_COLOR[item.status]" variant="subtle">{{ statusLabel(item) }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                  <template v-if="isUserStyle(item)">
                    <template v-if="item.status === 3">
                      <UButton type="button" size="sm" variant="soft" color="success" @click="openReview(item, true)">{{ t('common.pass') }}</UButton>
                      <UButton type="button" size="sm" variant="soft" color="warning" @click="openReview(item, false)">{{ t('common.reject') }}</UButton>
                    </template>
                    <UButton v-else-if="item.status === 4" type="button" size="sm" variant="soft" color="warning" @click="unlistUserStyle(item)">{{ t('common.takeDown') }}</UButton>
                  </template>
                  <UButton v-else type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="toggleStatus(item)">
                    {{ item.status === 1 ? t('common.takeDown') : t('common.putOn') }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">{{ t('common.delete') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? t('style.editTitle') : t('style.createTitle')" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField :label="t('common.name')" required :error="errors.name || undefined">
            <UInput v-model="form.name" maxlength="50" :placeholder="t('style.namePh')" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <UFormField :label="t('style.promptLabel')" required :error="errors.prompt || undefined" :help="t('style.promptHelp')">
            <UTextarea v-model="form.prompt" :rows="5" maxlength="2000" :placeholder="t('style.promptPh')" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <UFormField :label="t('style.negative')" :help="t('style.negativeHelp')">
            <UInput v-model="form.negative" maxlength="500" :placeholder="t('style.negativePh')" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('common.tag')" :help="t('style.tagsHelp')">
              <UInput v-model="form.tags" class="w-full" />
            </UFormField>
            <UFormField :label="t('common.category')" :help="t('style.categoryHelp')">
              <UInput v-model="form.category" maxlength="50" :placeholder="t('style.categoryHint')" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('style.kindsLabel')">
              <USelect v-model="form.kinds" :items="kindsItems" value-key="value" class="w-full" :disabled="editingUserStyle" />
            </UFormField>
            <UFormField :label="t('common.sort')" :help="t('common.sortHintDesc')">
              <UInput v-model.number="form.sortOrder" type="number" class="w-full" />
            </UFormField>
          </div>
          <p v-if="editingUserStyle" class="text-xs text-zinc-500">{{ t('style.userHint') }}</p>
          <UFormField v-if="!editingUserStyle" :label="t('common.cover')">
            <div v-if="form.coverUrl" class="relative">
              <img :src="form.coverUrl" alt="" class="aspect-video w-full rounded-lg object-cover">
              <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearCover">
                {{ t('common.clear') }}
              </UButton>
            </div>
            <UFileUpload
              v-else
              :model-value="coverFile"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              :label="uploading ? t('common.uploading') : t('common.uploadCover')"
              :description="t('skill.coverUploadHint')"
              class="w-full min-h-40"
              :disabled="uploading"
              @update:model-value="onCoverFile"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="save">{{ t('common.save') }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="reviewOpen" :title="reviewApprove ? t('style.reviewApprove') : t('style.reviewReject')" :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            {{ reviewApprove ? t('style.reviewApproveHint') : t('style.reviewRejectHint') }}
          </p>
          <UFormField :label="t('common.remark')" :help="reviewApprove ? t('style.remarkHelpApprove') : t('style.remarkHelpReject')">
            <UTextarea v-model="reviewReason" :rows="3" maxlength="200" :placeholder="t('style.remarkPh')" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="reviewing" @click="() => { reviewOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :color="reviewApprove ? 'success' : 'warning'" :loading="reviewing" @click="doReview">{{ reviewApprove ? t('common.pass') : t('common.reject') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal v-model:open="confirmOpen" :title="t('style.confirmDelete')" :confirm-text="t('common.delete')" :loading="confirming" @confirm="doDelete">
      {{ t('common.confirmNamed', { action: t('common.delete'), name: confirmItem?.name }) }}
      {{ t('style.confirmDeleteBody') }}
    </ManageConfirmModal>
  </div>
</template>
