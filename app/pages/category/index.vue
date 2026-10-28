<script setup lang="ts">
import { adminCategoryApi, isOk, parsePaged } from '~/api/creative'
import type { AdminCategory, CategoryScope } from '~/types/easytv-admin'

const { t } = useI18n()
useHead({ title: () => t('category.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const rows = ref<AdminCategory[]>([])
const draft = reactive({ name: '', scope: '__all__', status: '__all__' })
const applied = ref({ ...draft })
const formOpen = ref(false)
const editing = ref<AdminCategory | null>(null)
const form = reactive({ name: '', scope: 'work' as CategoryScope, sortOrder: 0 })
const errors = reactive({ name: '' })
const saving = ref(false)
const confirmOpen = ref(false)
const confirmAction = ref<'status' | 'delete'>('status')
const confirmItem = ref<AdminCategory | null>(null)
const confirming = ref(false)

const scopeItems = [
  { label: '全部范围', value: '__all__' },
  { label: '成片分类', value: 'work' },
  { label: 'Skill 分类', value: 'skill' },
]
const statusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '启用', value: '1' },
  { label: '停用', value: '2' },
]
const formScopeItems = [
  { label: '成片分类', value: 'work' },
  { label: 'Skill 分类', value: 'skill' },
]
const filtered = computed(() => rows.value)

function toRow(item: any): AdminCategory {
  return {
    id: item.id,
    name: item.name,
    scope: item.scope === 'skill' ? 'skill' : 'work',
    sortOrder: Number(item.sort_order) || 0,
    status: item.status === 2 ? 2 : 1,
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const raw = await adminCategoryApi.list({
      scope: applied.value.scope === '__all__' ? undefined : applied.value.scope,
      keyword: applied.value.name || undefined,
      status: applied.value.status === '__all__' ? undefined : applied.value.status,
    })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      notify(raw?.message ?? '分类加载失败', 'error')
      return
    }
    rows.value = parsed.items.map(toRow)
    markListReady()
  }
  finally {
    loading.value = false
  }
})

onMounted(() => void fetchList())

function search() {
  applied.value = { name: draft.name.trim(), scope: draft.scope, status: draft.status }
  void fetchList(`s-${Date.now()}`)
}
function reset() {
  Object.assign(draft, { name: '', scope: '__all__', status: '__all__' })
  search()
}
function openCreate() {
  editing.value = null
  const scope: CategoryScope = draft.scope === 'skill' ? 'skill' : 'work'
  Object.assign(form, { name: '', scope, sortOrder: rows.value.filter(item => item.scope === scope).length + 1 })
  errors.name = ''
  formOpen.value = true
}
function openEdit(item: AdminCategory) {
  editing.value = item
  Object.assign(form, { name: item.name, scope: item.scope, sortOrder: item.sortOrder })
  errors.name = ''
  formOpen.value = true
}
function setScope(next: string) {
  if (next === 'skill' || next === 'work')
    form.scope = next
}
function validate() {
  const name = form.name.trim()
  if (!name)
    errors.name = '请输入分类名称'
  else if (rows.value.some(item => item.name === name && item.scope === form.scope && item.id !== editing.value?.id))
    errors.name = '同一范围内分类名称已存在'
  else
    errors.name = ''
  return !errors.name
}
async function submit() {
  if (!validate())
    return
  saving.value = true
  try {
    const payload = { name: form.name.trim(), scope: form.scope, sort_order: Number(form.sortOrder) || 0 }
    const raw = editing.value
      ? await adminCategoryApi.update(editing.value.id, payload)
      : await adminCategoryApi.create({ ...payload, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '保存失败', 'error')
      return
    }
    notify(editing.value ? '分类更新成功' : '分类创建成功')
    formOpen.value = false
    await fetchList(`f-${Date.now()}`)
  }
  finally {
    saving.value = false
  }
}
function requestConfirm(item: AdminCategory, action: 'status' | 'delete') {
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
      ? await adminCategoryApi.remove(item.id)
      : await adminCategoryApi.update(item.id, { status: item.status === 1 ? 2 : 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? '操作失败', 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? '分类已删除' : (item.status === 1 ? '分类已停用' : '分类已启用'))
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
    <ManagePageHeader :page-title="t('category.title')" :page-description="t('category.description')">
      <template #actions>
        <UButton type="button" icon="i-lucide-plus" @click="openCreate">{{ t('category.create') }}</UButton>
      </template>
    </ManagePageHeader>

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField label="分类名称">
          <UInput v-model="draft.name" placeholder="请输入分类名称" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="范围">
          <USelect v-model="draft.scope" :items="scopeItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-layers" :title="t('category.empty')" :description="t('category.emptyDesc')" class="min-h-72" />
      <div v-else class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">排序</th>
              <th class="min-w-0 w-full px-4 py-3 text-left">分类名称</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">范围</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in filtered" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                <div class="truncate" :title="item.name">{{ item.name }}</div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.scope === 'work' ? '成片分类' : 'Skill 分类' }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? '启用' : '停用' }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">编辑</UButton>
                  <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                    {{ item.status === 1 ? '停用' : '启用' }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">删除</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? '编辑分类' : '新增分类'" :ui="{ content: 'w-[min(96vw,32rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField
            label="分类名称"
            required
            :error="errors.name || undefined"
            help="改名不会同步到已有作品或 Skill。"
          >
            <UInput v-model="form.name" maxlength="20" placeholder="例如：电影美学" class="w-full" />
          </UFormField>
          <div class="grid items-start gap-4 sm:grid-cols-[1fr_8.5rem]">
            <UFormField
              label="范围"
              required
              help="成片用于首页与发布，Skill 用于 Agent 页。"
            >
              <UTabs
                :model-value="form.scope"
                :items="formScopeItems"
                variant="pill"
                :content="false"
                class="w-full"
                :ui="{
                  list: 'w-full gap-2',
                  trigger: 'flex-1 justify-center data-[state=inactive]:ring-1 data-[state=inactive]:ring-inset data-[state=inactive]:ring-zinc-300 dark:data-[state=inactive]:ring-zinc-600',
                }"
                @update:model-value="setScope(String($event))"
              />
            </UFormField>
            <UFormField label="排序权重" help="越小越靠前">
              <UInputNumber v-model="form.sortOrder" :min="0" class="w-full" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { formOpen = false }">取消</UButton>
        <UButton type="button" :loading="saving" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '保存' }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="confirmOpen" :title="confirmAction === 'delete' ? '确认删除分类' : `确认${confirmItem?.status === 1 ? '停用' : '启用'}分类`" :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          确定要{{ confirmAction === 'delete' ? '删除' : (confirmItem?.status === 1 ? '停用' : '启用') }}分类“{{ confirmItem?.name }}”吗？
          <template v-if="confirmAction === 'delete'">已使用该分类的内容不受影响，但前台不再显示这个筛选标签。</template>
        </p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">取消</UButton>
        <UButton type="button" :color="confirmAction === 'delete' ? 'error' : 'primary'" :loading="confirming" :disabled="confirming" @click="confirm">
          {{ confirming ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
