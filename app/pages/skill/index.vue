<script setup lang="ts">
import { adminSkillApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import qiniu from '~/api/qiniu'
import type { AdminSkill } from '~/types/easytv-admin'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

const { t } = useI18n()
useHead({ title: () => t('skill.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminSkill[]>([])
const draft = reactive({ title: '', category: '__all__', status: '__all__', source: 'official', reviewStatus: '__all__' })
const applied = ref({ ...draft })
/** all 模板管理；pending 待审核队列（固定 source=user + review_status=1） */
const tab = ref<'all' | 'pending'>('all')
const tabItems = computed(() => [
  { label: t('skill.review.tabAll'), value: 'all' },
  { label: t('skill.review.tabPending'), value: 'pending' },
])
const formOpen = ref(false)
const editing = ref<AdminSkill | null>(null)
const form = reactive({ title: '', authorName: '', category: '', cover: '', guide: '', outputFormat: '' })
const errors = reactive({ title: '', authorName: '', category: '' })
const saving = ref(false)
const uploading = ref(false)
const coverFile = ref<File | null>(null)
const COVER_MAX_BYTES = 8 * 1024 * 1024
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const coverPreviewUrl = computed(() => form.cover.trim() ? resolveMediaUrl(form.cover) : '')
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete' | 'unpublish'>('status')
const confirmItem = ref<AdminSkill | null>(null)
const confirming = ref(false)

// ---- 审核（T27）----
const reviewStatusItems = computed(() => [
  { label: t('skill.review.allStatus'), value: '__all__' },
  { label: t('skill.review.status0'), value: '0' },
  { label: t('skill.review.status1'), value: '1' },
  { label: t('skill.review.status2'), value: '2' },
  { label: t('skill.review.status3'), value: '3' },
])
const reviewBadgeColor = (rs: number) => rs === 2 ? 'success' : rs === 1 ? 'warning' : rs === 3 ? 'error' : 'neutral'
/** 原始行保留给审核抽屉（prompt / video_url / author 等） */
const rawItems = new Map<number, Record<string, any>>()
const drawerOpen = ref(false)
const drawerSkill = ref<Record<string, any> | null>(null)
const rejectOpen = ref(false)
const rejectItem = ref<{ id: number, title: string } | null>(null)
const rejectRemark = ref('')
const rejectError = ref('')
const rejecting = ref(false)

/** 分类：与创作台 Agent 页标签一致（后续可迁到分类表） */
const SKILL_CATEGORIES = ['专业影视', '商业广告', '短剧漫剧', '动漫游戏', '音乐MV', '自媒体创作', '通用技能', '发现']
const skillCategories = computed(() => SKILL_CATEGORIES.map(name => ({ name })))
const categoryItems = computed(() => [
  { label: '全部分类', value: '__all__' },
  ...SKILL_CATEGORIES.map(name => ({ label: name, value: name })),
])
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架', value: '1' },
  { label: '已下架', value: '2' },
]
const sourceItems = [
  { label: '官方', value: 'official' },
  { label: '用户私有', value: 'user' },
]

const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)

/** 原始 cover_url 保留，编辑回填用 */
const rawCovers = new Map<number, string>()

function toRow(item: any): AdminSkill {
  rawCovers.set(item.id, item.cover_url || '')
  rawItems.set(item.id, item)
  return {
    id: item.id,
    title: item.title,
    authorName: item.author_name || '',
    category: item.category || '',
    cover: resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER,
    uses: Number(item.uses) || 0,
    graphNodes: Number(item.graph_nodes) || 0,
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.created_at),
    userId: Number(item.user_id) || 0,
    reviewStatus: Number(item.review_status) || 0,
    reviewRemark: item.review_remark || '',
    revenueShare: Number(item.revenue_share) || 0,
    callsTotal: Number(item.calls_total) || 0,
    revenueTotal: Number(item.revenue_total) || 0,
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const pending = tab.value === 'pending'
    const raw = await adminSkillApi.list({
      page: page.value,
      page_size: pageSize.value,
      keyword: applied.value.title || undefined,
      category: applied.value.category === '__all__' ? undefined : applied.value.category,
      status: pending || applied.value.status === '__all__' ? undefined : applied.value.status,
      source: pending ? 'user' : (applied.value.source === 'official' || applied.value.source === 'user' ? applied.value.source : undefined),
      review_status: pending ? 1 : (applied.value.reviewStatus === '__all__' ? undefined : applied.value.reviewStatus),
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? '加载失败', 'error')
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
  applied.value = { title: draft.title.trim(), category: draft.category, status: draft.status, source: draft.source, reviewStatus: draft.reviewStatus }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, { title: '', category: '__all__', status: '__all__', source: 'official', reviewStatus: '__all__' })
  search()
}
watch(tab, () => {
  page.value = 1
  void fetchList(`t-${tab.value}-${Date.now()}`)
})
function openReview(item: AdminSkill) {
  drawerSkill.value = rawItems.get(item.id) ?? null
  drawerOpen.value = !!drawerSkill.value
}
async function quickApprove(item: AdminSkill) {
  const raw = await adminSkillApi.review(item.id, { action: 'approve' })
  if (!isOk(raw)) {
    notify(raw?.message ?? t('common.saveFail'), 'error')
    return
  }
  notify(raw?.message || t('skill.review.approved'))
  await fetchList(`r-${Date.now()}`)
}
function openReject(target: { id: number, title: string }) {
  rejectItem.value = { id: target.id, title: target.title }
  rejectRemark.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}
async function submitReject() {
  if (!rejectItem.value || rejecting.value)
    return
  const remark = rejectRemark.value.trim()
  if (!remark) {
    rejectError.value = t('skill.review.remarkRequired')
    return
  }
  rejectError.value = ''
  rejecting.value = true
  try {
    const raw = await adminSkillApi.review(rejectItem.value.id, { action: 'reject', remark })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || t('skill.review.rejected'))
    rejectOpen.value = false
    drawerOpen.value = false
    await fetchList(`r-${Date.now()}`)
  }
  finally {
    rejecting.value = false
  }
}
function requestUnpublish(target: { id: number, title: string }) {
  const row = rows.value.find(item => item.id === target.id)
  if (!row)
    return
  drawerOpen.value = false
  requestConfirm(row, 'unpublish')
}
function isPrivate(item: AdminSkill) {
  return item.userId > 0
}
function openCreate() {
  editing.value = null
  uploading.value = false
  coverFile.value = null
  Object.assign(form, { title: '', authorName: '', category: SKILL_CATEGORIES[0], cover: '', guide: '', outputFormat: '' })
  Object.assign(errors, { title: '', authorName: '', category: '' })
  formOpen.value = true
}
function openEdit(item: AdminSkill) {
  if (isPrivate(item)) {
    notify('用户私有 Skill 不能编辑内容，只能下架', 'error')
    return
  }
  editing.value = item
  uploading.value = false
  coverFile.value = null
  const raw = rawItems.get(item.id) ?? {}
  Object.assign(form, {
    title: item.title,
    authorName: item.authorName,
    category: item.category,
    cover: rawCovers.get(item.id) ?? '',
    guide: raw.guide ?? '',
    outputFormat: raw.output_format ?? '',
  })
  Object.assign(errors, { title: '', authorName: '', category: '' })
  formOpen.value = true
}
function validate() {
  errors.title = form.title.trim() ? '' : '请输入 Skill 名称'
  errors.authorName = form.authorName.trim() ? '' : '请输入作者名称'
  errors.category = form.category ? '' : '请选择分类'
  return !errors.title && !errors.authorName && !errors.category
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
    form.cover = await qiniu.uploadImage(file)
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
async function submit() {
  if (!validate() || uploading.value)
    return
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      author_name: form.authorName.trim(),
      category: form.category,
      cover_url: form.cover.trim(),
      guide: form.guide.trim(),
      output_format: form.outputFormat.trim(),
    }
    const raw = editing.value
      ? await adminSkillApi.update(editing.value.id, payload)
      : await adminSkillApi.create({ ...payload, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败，请稍后重试', 'error')
      return
    }
    notify(editing.value ? 'Skill 模板更新成功' : 'Skill 模板创建成功')
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminSkill, action: 'status' | 'delete' | 'unpublish') {
  if (isPrivate(item) && action === 'delete') {
    notify('用户私有 Skill 不能删除，只能下架', 'error')
    return
  }
  if (isPrivate(item) && action === 'status' && item.status !== 1) {
    notify('用户私有 Skill 不允许重新上架', 'error')
    return
  }
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
    if (confirmAction.value !== 'delete' && isPrivate(item) && item.status !== 1) {
      notify('用户私有 Skill 不允许重新上架', 'error')
      return
    }
    const raw = confirmAction.value === 'delete'
      ? await adminSkillApi.remove(item.id)
      : confirmAction.value === 'unpublish'
        ? await adminSkillApi.review(item.id, { action: 'unpublish' })
        : await adminSkillApi.update(item.id, { status: item.status === 1 ? 2 : 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败，请稍后重试', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? 'Skill 模板已删除' : confirmAction.value === 'unpublish' ? t('skill.review.unpublished') : (item.status === 1 ? 'Skill 模板已下架' : 'Skill 模板已上架'))
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
    <ManagePageHeader :page-title="t('skill.title')" :page-description="t('skill.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('skill.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UTabs v-model="tab" :items="tabItems" :content="false" class="mb-4 w-full sm:w-80" />

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <UFormField label="Skill 名称">
          <UInput v-model="draft.title" placeholder="请输入 Skill 名称" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField v-if="tab === 'all'" label="来源">
          <USelect v-model="draft.source" :items="sourceItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="分类">
          <USelect v-model="draft.category" :items="categoryItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField v-if="tab === 'all'" label="状态">
          <USelect v-model="draft.status" :items="statusItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField v-if="tab === 'all'" :label="t('skill.review.status')">
          <USelect v-model="draft.reviewStatus" :items="reviewStatusItems" value-key="value" class="w-full" />
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
        icon="i-lucide-sparkles"
        :title="t('skill.empty')"
        :description="t('skill.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">Skill 名称</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">来源</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">作者名称</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">分类</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">使用量</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('skill.nodeCount') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('skill.review.status') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3 text-left">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="item.cover || DEFAULT_WORK_COVER" alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="min-w-0 truncate font-medium" :title="item.title">{{ item.title }}</div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="isPrivate(item) ? 'warning' : 'primary'" variant="subtle">{{ isPrivate(item) ? '用户私有' : '官方' }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ isPrivate(item) ? (item.authorName || `#${item.userId}`) : item.authorName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.category }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.uses.toLocaleString() }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.graphNodes > 0 ? item.graphNodes : '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '已上架' : '已下架' }}</UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <template v-if="isPrivate(item)">
                    <UBadge :color="reviewBadgeColor(item.reviewStatus)" variant="subtle">{{ t(`skill.review.status${item.reviewStatus}`) }}</UBadge>
                    <div v-if="item.reviewStatus === 3 && item.reviewRemark" class="mt-0.5 max-w-40 truncate text-xs text-zinc-400" :title="item.reviewRemark">{{ item.reviewRemark }}</div>
                  </template>
                  <span v-else class="text-zinc-400">—</span>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div v-if="isPrivate(item)" class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openReview(item)">{{ t('common.detail') }}</UButton>
                    <UButton v-if="item.reviewStatus === 1 || item.reviewStatus === 3" type="button" size="sm" variant="soft" color="success" @click="quickApprove(item)">{{ t('skill.review.approve') }}</UButton>
                    <UButton v-if="item.reviewStatus === 1" type="button" size="sm" variant="soft" color="error" @click="openReject(item)">{{ t('skill.review.reject') }}</UButton>
                    <UButton v-if="item.reviewStatus === 2" type="button" size="sm" variant="soft" color="warning" @click="requestConfirm(item, 'unpublish')">{{ t('skill.review.unpublish') }}</UButton>
                  </div>
                  <div v-else class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                    <UButton
                      type="button"
                      size="sm"
                      variant="soft"
                      :color="item.status === 1 ? 'warning' : 'success'"
                      @click="requestConfirm(item, 'status')"
                    >
                      {{ item.status === 1 ? '下架' : '上架' }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">删除</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConsoleTablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editing ? '编辑模板' : '新建模板'"
      description="封面展示在 Agent 市场，未上传时使用默认图。"
      :ui="{ content: 'w-[min(96vw,36rem)]', body: 'space-y-5', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Skill 名称" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="40" placeholder="例如：品牌大片运镜" class="w-full" />
          </UFormField>
          <UFormField label="作者名称" required :error="errors.authorName || undefined">
            <UInput v-model="form.authorName" maxlength="32" placeholder="请输入作者名称" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="分类" required :error="errors.category || undefined">
          <USelect v-model="form.category" :items="skillCategories.map(item => ({ label: item.name, value: item.name }))" value-key="value" class="w-full" />
        </UFormField>
        <UFormField
          label="执行规则"
          help="只对文字对话生效：用户在画布助手里激活这个 Skill 后，这段会拼在提示词最前面。生图生视频不受影响。"
        >
          <UTextarea
            v-model="form.guide"
            :rows="5"
            maxlength="4000"
            placeholder="按什么步骤做、必须先问清什么、有哪些不能做的事"
            class="w-full"
          />
        </UFormField>
        <UFormField label="输出格式" help="产出应该长什么样，比如分镜表要哪几列、每段字数上限。">
          <UTextarea
            v-model="form.outputFormat"
            :rows="4"
            maxlength="4000"
            placeholder="选填"
            class="w-full"
          />
        </UFormField>
        <UFormField label="封面">
          <div v-if="coverPreviewUrl" class="relative">
            <img :src="coverPreviewUrl" alt="" class="aspect-video w-full rounded-lg object-cover">
            <UButton type="button" size="sm" color="neutral" class="absolute right-2 top-2" :disabled="uploading" @click="clearCover">
              清除
            </UButton>
          </div>
          <UFileUpload
            v-else
            :model-value="coverFile"
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            :label="uploading ? '上传中…' : '点击或拖拽上传封面'"
            description="选填，建议 800×450，jpg / png / webp / gif，不超过 8MB"
            class="w-full min-h-40"
            :disabled="uploading"
            @update:model-value="onCoverFile"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving || uploading" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving || uploading" @click="submit">{{ saving ? '保存中…' : '保存' }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="confirmAction === 'delete' ? '确认删除模板' : confirmAction === 'unpublish' ? t('skill.review.confirmUnpublish') : `确认${confirmItem?.status === 1 ? '下架' : '上架'}模板`" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p v-if="confirmAction === 'unpublish'" class="text-sm text-zinc-600 dark:text-zinc-300">{{ t('skill.review.confirmUnpublishBody', { title: confirmItem?.title ?? '' }) }}</p>
        <p v-else class="text-sm text-zinc-600 dark:text-zinc-300">确定要{{ confirmAction === 'delete' ? '删除' : (confirmItem?.status === 1 ? '下架' : '上架') }}“{{ confirmItem?.title }}”吗？</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton type="button" :color="confirmAction === 'delete' ? 'error' : 'primary'" :loading="confirming" :disabled="confirming" @click="confirm">
          {{ confirming ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="rejectOpen" :title="t('skill.review.rejectTitle')" :description="rejectItem?.title" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <UFormField :label="t('skill.review.rejectReason')" required :error="rejectError || undefined">
          <UTextarea v-model="rejectRemark" :rows="4" maxlength="255" :placeholder="t('skill.review.rejectReasonPh')" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="rejecting" @click="() => { rejectOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" color="error" :loading="rejecting" :disabled="rejecting" @click="submitReject">{{ rejecting ? t('common.processing') : t('skill.review.reject') }}</UButton>
      </template>
    </UModal>

    <SkillReviewDrawer
      v-model:open="drawerOpen"
      :skill="drawerSkill"
      @reviewed="() => fetchList(`d-${Date.now()}`)"
      @reject="openReject"
      @unpublish="requestUnpublish"
    />
  </div>
</template>
