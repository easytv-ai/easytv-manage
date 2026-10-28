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

const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架 / 可用', value: '1' },
  { label: '已下架', value: '2' },
  { label: '待审核', value: '3' },
  { label: '已收录', value: '4' },
]

const sourceItems = [
  { label: '全部来源', value: '__all__' },
  { label: '官方', value: 'official' },
  { label: '用户投稿', value: 'user' },
]

const STATUS_COLOR: Record<StyleStatus, 'success' | 'neutral' | 'warning' | 'primary'> = { 1: 'success', 2: 'neutral', 3: 'warning', 4: 'primary' }

function statusLabel(item: StyleRow) {
  switch (item.status) {
    case 2: return '已下架'
    case 3: return '待审核'
    case 4: return '已收录'
    default: return item.userId > 0 ? '私有' : '已上架'
  }
}

function isUserStyle(item: StyleRow) {
  return item.userId > 0
}

const kindsItems = [
  { label: '图片 / 视频都可', value: 'all' },
  { label: '仅图片', value: 'image' },
  { label: '仅视频', value: 'video' },
]

function kindsLabel(kinds: StyleKind[]) {
  if (!kinds.length || (kinds.includes('image') && kinds.includes('video')))
    return '都可'
  return kinds.includes('video') ? '视频' : '图片'
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
      notify(raw?.message ?? '风格加载失败', 'error')
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
  errors.name = form.name.trim() ? '' : '请输入风格名'
  errors.prompt = form.prompt.trim() ? '' : '请输入风格提示词'
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
    notify('仅支持 jpg、png、webp、gif 图片', 'error')
    return
  }
  if (file.size > COVER_MAX_BYTES) {
    coverFile.value = null
    notify('封面图片不能超过 8MB', 'error')
    return
  }
  uploading.value = true
  try {
    form.coverUrl = await qiniu.uploadImage(file)
    coverFile.value = null
    notify('封面上传成功')
  }
  catch (error: any) {
    coverFile.value = null
    notify(error?.message || '封面上传失败，请稍后重试', 'error')
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
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editing.value ? '风格已更新' : '风格已创建', 'success')
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
    notify(raw?.message ?? '操作失败', 'error')
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
  return setStatus(item, 1, '已撤回收录')
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
      notify(raw?.message ?? '审核失败', 'error')
      return
    }
    item.status = reviewApprove.value ? 4 : 1
    notify(reviewApprove.value ? '已收录进风格库' : '已驳回', 'success')
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
      notify(raw?.message ?? '删除失败', 'error')
      return
    }
    notify('已删除', 'success')
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

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="关键词">
          <UInput v-model="draft.keyword" placeholder="风格名或提示词" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="分类">
          <UInput v-model="draft.category" placeholder="例如：电影感" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="来源">
          <USelect v-model="draft.source" :items="sourceItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="状态">
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
      <UEmpty v-else-if="!rows.length" icon="i-lucide-palette" :title="t('style.empty')" :description="t('style.emptyDesc')" class="min-h-72" />
      <template v-else>
      <div class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="min-w-0 w-full px-4 py-3 text-left">风格</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">分类</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">标签</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">适用</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">套用</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">排序</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
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
                      作者：{{ item.userNickname || `用户 #${item.userId}` }}
                      <span v-if="item.sourceAssetId > 0"> · 来源图 #{{ item.sourceAssetId }}</span>
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
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                  <template v-if="isUserStyle(item)">
                    <template v-if="item.status === 3">
                      <UButton type="button" size="sm" variant="soft" color="success" @click="openReview(item, true)">通过</UButton>
                      <UButton type="button" size="sm" variant="soft" color="warning" @click="openReview(item, false)">驳回</UButton>
                    </template>
                    <UButton v-else-if="item.status === 4" type="button" size="sm" variant="soft" color="warning" @click="unlistUserStyle(item)">撤回收录</UButton>
                  </template>
                  <UButton v-else type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="toggleStatus(item)">
                    {{ item.status === 1 ? '下架' : '上架' }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestDelete(item)">删除</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :disabled="loading" />
      </template>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? '编辑风格' : '新增风格'" :ui="{ content: 'w-[min(96vw,40rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="风格名" required :error="errors.name || undefined">
            <UInput v-model="form.name" maxlength="50" placeholder="例如：胶片电影感" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <UFormField label="风格提示词" required :error="errors.prompt || undefined" help="生成时自动拼到节点提示词末尾，写画面质感、色调、光影，不要写具体内容。">
            <UTextarea v-model="form.prompt" :rows="5" maxlength="2000" placeholder="例如：35mm 胶片颗粒，柔和的高光过渡，宽银幕构图" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <UFormField label="负向提示词" help="选填，现阶段只保存不使用。">
            <UInput v-model="form.negative" maxlength="500" placeholder="例如：过度锐化、塑料感" class="w-full" :disabled="editingUserStyle" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="标签" help="用顿号或逗号分隔">
              <UInput v-model="form.tags" placeholder="胶片、颗粒" class="w-full" />
            </UFormField>
            <UFormField label="分类" help="创作台按分类出页签">
              <UInput v-model="form.category" maxlength="50" placeholder="电影感 / 动画 / 插画 / 摄影 / 氛围" class="w-full" />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="适用类型">
              <USelect v-model="form.kinds" :items="kindsItems" value-key="value" class="w-full" :disabled="editingUserStyle" />
            </UFormField>
            <UFormField label="排序" help="越大越靠前">
              <UInput v-model.number="form.sortOrder" type="number" class="w-full" />
            </UFormField>
          </div>
          <p v-if="editingUserStyle" class="text-xs text-zinc-500">用户投稿的风格只能改分类、标签和排序，名字 / 提示词 / 封面由作者维护。</p>
          <UFormField v-if="!editingUserStyle" label="封面">
            <div v-if="form.coverUrl" class="relative">
              <img :src="form.coverUrl" alt="" class="aspect-video w-full rounded-lg object-cover">
              <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearCover">
                清除
              </UButton>
            </div>
            <UFileUpload
              v-else
              :model-value="coverFile"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              :label="uploading ? '上传中…' : '点击或拖拽上传封面'"
              description="选填，建议 800×450，jpg / png / webp / gif，不超过 8MB；没有封面时创作台显示纯文字卡片"
              class="w-full min-h-40"
              :disabled="uploading"
              @update:model-value="onCoverFile"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="save">保存</UButton>
      </template>
    </UModal>

    <UModal v-model:open="reviewOpen" :title="reviewApprove ? '通过投稿' : '驳回投稿'" :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            <template v-if="reviewApprove">「{{ reviewItem?.name }}」将收录进官方风格库，所有人可见可用；作者之后再编辑会重新进入审核。</template>
            <template v-else>「{{ reviewItem?.name }}」将退回为作者的私有风格。</template>
          </p>
          <UFormField label="备注" :help="reviewApprove ? '选填，会随站内通知发给作者' : '选填，建议写明原因，会随站内通知发给作者'">
            <UTextarea v-model="reviewReason" :rows="3" maxlength="200" placeholder="例如：封面不清晰 / 提示词含具体主体内容" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="reviewing" @click="() => { reviewOpen = false }">取消</UButton>
        <UButton type="button" :color="reviewApprove ? 'success' : 'warning'" :loading="reviewing" @click="doReview">{{ reviewApprove ? '通过' : '驳回' }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" title="删除风格" :ui="{ content: 'w-[min(96vw,28rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm">确定删除「{{ confirmItem?.name }}」吗？删除后创作台立即不可见，已套用该风格的节点不受影响。</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton type="button" color="error" :loading="confirming" @click="doDelete">删除</UButton>
      </template>
    </UModal>
  </div>
</template>
