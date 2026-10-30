<script setup lang="ts">
import { adminCategoryApi, adminWorkApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import type { AdminShowcase } from '~/types/easytv-admin'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

const { t } = useI18n()
useHead({ title: () => t('showcase.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminShowcase[]>([])
const draft = reactive({ title: '', category: '__all__', status: '__all__' })
const applied = ref({ ...draft })
const formOpen = ref(false)
const editing = ref<AdminShowcase | null>(null)
const form = reactive({ title: '', category: '', cover: '', sortOrder: 0 })
const errors = reactive({ title: '' })
const saving = ref(false)
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminShowcase | null>(null)
const confirming = ref(false)

/** 成片分类（后台「内容分类」维护） */
const categories = ref<string[]>([])
const categoryItems = computed(() => [
  { label: '全部分类', value: '__all__' },
  ...categories.value.map(name => ({ label: name, value: name })),
])
const formCategoryItems = computed(() => {
  const list = categories.value.map(name => ({ label: name, value: name }))
  if (form.category && !categories.value.includes(form.category))
    list.unshift({ label: form.category, value: form.category })
  return list
})
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '已上架', value: '1' },
  { label: '已下架', value: '2' },
]

const filtered = computed(() => rows.value)
const pageRows = computed(() => rows.value)
/** 接口原始字段，编辑回填用 */
const raws = new Map<number, any>()

function toRow(item: any): AdminShowcase {
  raws.set(item.id, item)
  return {
    id: item.id,
    title: item.title,
    authorName: item.author?.nickname || `#${item.user_id}`,
    category: item.category || '',
    cover: resolveMediaUrl(item.cover_url) || DEFAULT_WORK_COVER,
    likes: Number(item.like_count) || 0,
    status: item.status === 1 ? 1 : 2,
    sortOrder: Number(item.sort_order) || 0,
    createdAt: formatUnix(item.published_at || item.created_at),
  }
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
    const raw = await adminWorkApi.list({
      page: page.value,
      page_size: pageSize.value,
      featured: 1,
      keyword: applied.value.title || undefined,
      category: applied.value.category === '__all__' ? undefined : applied.value.category,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? '精选成片加载失败', 'error')
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
  applied.value = { title: draft.title.trim(), category: draft.category, status: draft.status }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { title: '', category: '__all__', status: '__all__' })
  search()
}

// ---- 加入精选：从已发布作品里挑 ----
const PICK_PAGE_SIZE = 18
const pickOpen = ref(false)
const pickLoading = ref(false)
const pickLoadingMore = ref(false)
const pickKeyword = ref('')
const pickCategory = ref('__all__')
const pickRows = ref<AdminShowcase[]>([])
const pickTotal = ref(0)
const pickedIds = ref<number[]>([])
const picking = ref<number | null>(null)
const pickScrollEl = ref<HTMLElement | null>(null)
const pickSentinel = ref<HTMLElement | null>(null)

/** 已加入的作品不再属于 featured=0 结果集，分页偏移要按「列表里还没加入的条数」算 */
const pickUnpickedCount = computed(() => pickRows.value.length - pickedIds.value.length)
const pickHasMore = computed(() => pickUnpickedCount.value < pickTotal.value)

async function fetchPickPage(pageNo: number) {
  const raw = await adminWorkApi.list({
    page: pageNo,
    page_size: PICK_PAGE_SIZE,
    status: 1,
    featured: 0,
    keyword: pickKeyword.value.trim() || undefined,
    category: pickCategory.value === '__all__' ? undefined : pickCategory.value,
  })
  const parsed = parsePaged(raw)
  if (!parsed)
    notify(raw?.message ?? '作品加载失败', 'error')
  return parsed
}

async function loadPick() {
  pickLoading.value = true
  pickedIds.value = []
  try {
    const parsed = await fetchPickPage(1)
    pickRows.value = parsed ? parsed.items.map(toRow) : []
    pickTotal.value = parsed?.total ?? 0
    pickScrollEl.value?.scrollTo({ top: 0 })
  }
  finally {
    pickLoading.value = false
  }
}

async function loadMorePick() {
  if (pickLoading.value || pickLoadingMore.value || !pickHasMore.value)
    return
  pickLoadingMore.value = true
  try {
    const parsed = await fetchPickPage(Math.floor(pickUnpickedCount.value / PICK_PAGE_SIZE) + 1)
    if (!parsed)
      return
    const seen = new Set(pickRows.value.map(row => row.id))
    const fresh = parsed.items.map(toRow).filter(row => !seen.has(row.id))
    pickRows.value.push(...fresh)
    pickTotal.value = fresh.length ? parsed.total : pickUnpickedCount.value
    if (!fresh.length)
      return
  }
  finally {
    pickLoadingMore.value = false
  }
  await nextTick()
  if (isPickSentinelNear())
    void loadMorePick()
}

function isPickSentinelNear() {
  const el = pickSentinel.value
  const root = pickScrollEl.value
  if (!el || !root)
    return false
  return el.getBoundingClientRect().top - root.getBoundingClientRect().bottom < 160
}

let pickObserver: IntersectionObserver | null = null
watch(pickSentinel, (el) => {
  pickObserver?.disconnect()
  if (!el)
    return
  pickObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting)
      void loadMorePick()
  }, { root: pickScrollEl.value, rootMargin: '160px' })
  pickObserver.observe(el)
})
onBeforeUnmount(() => pickObserver?.disconnect())

function clearPickKeyword() {
  pickKeyword.value = ''
  void loadPick()
}

function openPick() {
  pickKeyword.value = ''
  pickCategory.value = '__all__'
  pickOpen.value = true
  void loadPick()
}

function isPicked(item: AdminShowcase) {
  return pickedIds.value.includes(item.id)
}

async function pick(item: AdminShowcase) {
  if (picking.value || isPicked(item))
    return
  picking.value = item.id
  try {
    const raw = await adminWorkApi.update(item.id, { featured: 1, sort_order: total.value + 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(`「${item.title}」已加入精选`, 'success')
    pickedIds.value.push(item.id)
    pickTotal.value = Math.max(0, pickTotal.value - 1)
    await fetchList(`p-${Date.now()}`)
  }
  finally {
    picking.value = null
  }
}

function openEdit(item: AdminShowcase) {
  editing.value = item
  const raw = raws.get(item.id) ?? {}
  Object.assign(form, { title: item.title, category: item.category, cover: raw.cover_url ?? '', sortOrder: item.sortOrder })
  errors.title = ''
  formOpen.value = true
}

function validate() {
  errors.title = form.title.trim() ? '' : '请输入成片标题'
  return !errors.title
}

async function submit() {
  if (!validate() || !editing.value)
    return
  saving.value = true
  try {
    const raw = await adminWorkApi.update(editing.value.id, {
      title: form.title.trim(),
      category: form.category,
      cover_url: form.cover.trim(),
      sort_order: Number(form.sortOrder) || 0,
    })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify('精选成片更新成功')
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}

function requestConfirm(item: AdminShowcase, action: 'status' | 'delete') {
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
      ? await adminWorkApi.update(item.id, { featured: 0 })
      : await adminWorkApi.setStatus(item.id, item.status === 1 ? 2 : 1)
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? '已移出精选' : (item.status === 1 ? '成片已下架' : '成片已上架'))
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
    <ManagePageHeader :page-title="t('showcase.title')" :page-description="t('showcase.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openPick">{{ t('showcase.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField label="成片标题">
          <UInput v-model="draft.title" placeholder="请输入成片标题" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="分类">
          <USelect v-model="draft.category" :items="categoryItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="pageRows.length === 0" icon="i-lucide-film" :title="t('showcase.empty')" :description="t('showcase.emptyDesc')" class="min-h-72" />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">排序</th>
                <th class="min-w-0 w-full px-4 py-3 text-left">成片标题</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">作者名称</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">分类</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">点赞数</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="item in pageRows" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
                <td class="max-w-0 w-full px-4 py-3 text-left">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
                      <img :src="item.cover || DEFAULT_WORK_COVER" alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="min-w-0 truncate font-medium" :title="item.title">{{ item.title }}</div>
                  </div>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.authorName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.category || '—' }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.likes.toLocaleString() }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '已上架' : '已下架' }}</UBadge>
                </td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                    <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                      {{ item.status === 1 ? '下架' : '上架' }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">移出精选</UButton>
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
      v-model:open="pickOpen"
      title="加入精选"
      description="从已发布的作品中挑选，点击卡片即可加入首页精选成片"
      :ui="{ content: 'w-[min(96vw,58rem)]', body: 'flex min-h-0 flex-col p-0 sm:p-0', footer: 'justify-between gap-2' }"
    >
      <template #body>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-5 py-3 sm:px-6">
          <UInput
            v-model="pickKeyword"
            icon="i-lucide-search"
            placeholder="按标题搜索已发布作品，回车搜索"
            class="min-w-0 flex-1"
            :ui="{ trailing: 'pe-1' }"
            @keyup.enter="loadPick"
          >
            <template v-if="pickKeyword" #trailing>
              <UButton type="button" color="neutral" variant="link" size="sm" icon="i-lucide-x" aria-label="清除关键词" @click="clearPickKeyword" />
            </template>
          </UInput>
          <USelect v-model="pickCategory" :items="categoryItems" value-key="value" class="w-36" @update:model-value="loadPick" />
          <UButton type="button" icon="i-lucide-search" :loading="pickLoading" @click="loadPick">搜索</UButton>
        </div>

        <div ref="pickScrollEl" class="h-[min(62vh,38rem)] overflow-y-auto px-5 py-4 sm:px-6">
          <div v-if="pickLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div v-for="n in 6" :key="n" class="overflow-hidden rounded-xl ring-1 ring-default">
              <USkeleton class="aspect-video w-full rounded-none" />
              <div class="space-y-2 p-3">
                <USkeleton class="h-4 w-3/4" />
                <USkeleton class="h-3 w-1/2" />
              </div>
            </div>
          </div>

          <UEmpty
            v-else-if="pickRows.length === 0"
            icon="i-lucide-film"
            :title="pickKeyword || pickCategory !== '__all__' ? '没有符合条件的作品' : '没有可加入的作品'"
            :description="pickKeyword || pickCategory !== '__all__' ? '换个关键词或分类试试。' : '已发布且未精选的作品会显示在这里。'"
            class="h-full"
          />

          <template v-else>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <button
                v-for="item in pickRows"
                :key="item.id"
                type="button"
                class="group overflow-hidden rounded-xl bg-default text-left ring-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
                :class="isPicked(item) ? 'ring-success/60' : 'ring-default hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/60'"
                :disabled="isPicked(item) || !!picking"
                @click="pick(item)"
              >
                <div class="relative aspect-video overflow-hidden bg-elevated">
                  <img :src="item.cover" alt="" loading="lazy" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105">
                  <span v-if="item.category" class="absolute left-2 top-2 rounded-md bg-zinc-950/60 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm">{{ item.category }}</span>
                  <span class="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-zinc-950/60 px-1.5 py-0.5 text-[11px] tabular-nums text-white backdrop-blur-sm">
                    <UIcon name="i-lucide-heart" class="size-3" />{{ item.likes.toLocaleString() }}
                  </span>

                  <div v-if="picking === item.id" class="absolute inset-0 flex items-center justify-center bg-zinc-950/50 text-sm text-white">
                    <UIcon name="i-lucide-loader-circle" class="mr-1.5 size-4 animate-spin" />加入中…
                  </div>
                  <div v-else-if="isPicked(item)" class="absolute inset-0 flex items-center justify-center bg-success/75 text-sm font-medium text-white">
                    <UIcon name="i-lucide-circle-check" class="mr-1.5 size-5" />已加入精选
                  </div>
                  <div v-else class="absolute inset-0 flex items-center justify-center bg-zinc-950/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span class="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-white shadow-lg">
                      <UIcon name="i-lucide-plus" class="size-4" />加入精选
                    </span>
                  </div>
                </div>
                <div class="p-3">
                  <p class="truncate text-sm font-medium text-highlighted" :title="item.title">{{ item.title }}</p>
                  <p class="mt-0.5 truncate text-xs text-muted">{{ item.authorName }} · {{ item.createdAt }}</p>
                </div>
              </button>
            </div>

            <div ref="pickSentinel" class="flex h-12 items-center justify-center text-xs text-muted">
              <template v-if="pickLoadingMore">
                <UIcon name="i-lucide-loader-circle" class="mr-1.5 size-4 animate-spin" />加载中…
              </template>
              <template v-else-if="!pickHasMore">没有更多数据了</template>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <p class="text-sm text-muted">
          <template v-if="pickedIds.length">本次已加入 <span class="font-semibold text-success">{{ pickedIds.length }}</span> 个作品</template>
          <template v-else>还可加入 <span class="font-medium tabular-nums text-highlighted">{{ pickTotal }}</span> 个作品</template>
        </p>
        <UButton type="button" :color="pickedIds.length ? 'primary' : 'neutral'" :variant="pickedIds.length ? 'solid' : 'outline'" @click="() => { pickOpen = false }">
          {{ pickedIds.length ? '完成' : '关闭' }}
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="formOpen" title="编辑成片" :ui="{ content: 'w-[min(96vw,34rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField label="成片标题" required :error="errors.title || undefined">
            <UInput v-model="form.title" maxlength="40" placeholder="例如：星空山巅" class="w-full" />
          </UFormField>
          <UFormField label="作者名称">
            <UInput :model-value="editing?.authorName ?? ''" disabled class="w-full" />
          </UFormField>
          <UFormField label="分类">
            <USelect v-model="form.category" :items="formCategoryItems" value-key="value" placeholder="请选择分类" class="w-full" />
          </UFormField>
          <UFormField label="封面地址" hint="选填，参考尺寸 1280×720；留空时前台使用视频首帧">
            <UInput v-model="form.cover" placeholder="https://… 或 /upload/…" class="w-full" />
            <img :src="resolveMediaUrl(form.cover) || DEFAULT_WORK_COVER" alt="" class="mt-2 h-24 w-40 rounded object-cover">
          </UFormField>
          <UFormField label="排序权重" hint="数值越小越靠前">
            <UInputNumber v-model="form.sortOrder" :min="0" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '保存' }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmAction === 'delete' ? '确认移出精选' : `确认${confirmItem?.status === 1 ? '下架' : '上架'}成片`"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :icon="confirmAction === 'delete' ? 'i-lucide-star-off' : ''"
      :loading="confirming"
      @confirm="confirm"
    >
      <template v-if="confirmAction === 'delete'">确定把“{{ confirmItem?.title }}”移出精选吗？作品本身不会被删除或下架。</template>
      <template v-else>确定要{{ confirmItem?.status === 1 ? '下架' : '上架' }}“{{ confirmItem?.title }}”吗？{{ confirmItem?.status === 1 ? '下架后前台不再展示。' : '' }}</template>
    </ManageConfirmModal>
  </div>
</template>
