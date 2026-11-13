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

const scopeItems = computed(() => [
  { label: t('common.allScope'), value: '__all__' },
  { label: t('common.workScope'), value: 'work' },
  { label: t('common.skillScope'), value: 'skill' },
])
const statusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.enabled'), value: '1' },
  { label: t('common.disabled'), value: '2' },
])
const formScopeItems = computed(() => [
  { label: t('common.workScope'), value: 'work' },
  { label: t('common.skillScope'), value: 'skill' },
])
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
      notify(raw?.message ?? t('category.loadFail'), 'error')
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
    errors.name = t('category.nameRequired')
  else if (rows.value.some(item => item.name === name && item.scope === form.scope && item.id !== editing.value?.id))
    errors.name = t('category.dup')
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
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editing.value ? t('category.updated') : t('category.created'))
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
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(confirmAction.value === 'delete' ? t('category.deleted') : (item.status === 1 ? t('category.disabled') : t('category.enabled')))
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

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.name')">
          <UInput icon="i-lucide-search" v-model="draft.name" :placeholder="t('category.nameRequired')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('category.scope')">
          <USelect v-model="draft.scope" :items="scopeItems" value-key="value" class="w-full" />
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
      <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-layers" :title="t('category.empty')" :description="t('category.emptyDesc')" class="min-h-72" />
      <div v-else class="overflow-x-auto">
        <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.sort') }}</th>
              <th class="min-w-0 w-full px-4 py-3 text-left">{{ t('common.name') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('category.scope') }}</th>
              <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
              <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr v-for="item in filtered" :key="item.id" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td class="w-[1%] whitespace-nowrap px-4 py-3 tabular-nums">{{ item.sortOrder }}</td>
              <td class="max-w-0 w-full px-4 py-3 text-left font-medium">
                <div class="truncate" :title="item.name">{{ item.name }}</div>
              </td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ item.scope === 'work' ? t('common.workScope') : t('common.skillScope') }}</td>
              <td class="w-[1%] whitespace-nowrap px-4 py-3">
                <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">{{ item.status === 1 ? t('common.enabled') : t('common.disabled') }}</UBadge>
              </td>
              <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                <div class="flex w-max flex-nowrap gap-1">
                  <UButton type="button" size="sm" variant="soft" @click="openEdit(item)">{{ t('common.edit') }}</UButton>
                  <UButton type="button" size="sm" variant="soft" :color="item.status === 1 ? 'warning' : 'success'" @click="requestConfirm(item, 'status')">
                    {{ item.status === 1 ? t('common.disable') : t('common.enable') }}
                  </UButton>
                  <UButton type="button" size="sm" variant="soft" color="error" @click="requestConfirm(item, 'delete')">{{ t('common.delete') }}</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? t('category.editTitle') : t('category.createTitle')" :ui="{ content: 'w-[min(96vw,32rem)]', footer: 'justify-end gap-2' }">
      <template #body>
        <div class="space-y-5">
          <UFormField
            :label="t('common.name')"
            required
            :error="errors.name || undefined"
            :help="t('category.nameHelp')"
          >
            <UInput v-model="form.name" maxlength="20" :placeholder="t('category.namePh')" class="w-full" />
          </UFormField>
          <div class="grid items-start gap-4 sm:grid-cols-[1fr_8.5rem]">
            <UFormField
              :label="t('category.scope')"
              required
              :help="t('category.scopeHelp')"
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
            <UFormField :label="t('common.sortOrder')" :help="t('category.weightHelp')">
              <UInputNumber v-model="form.sortOrder" :min="0" class="w-full" />
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
      :title="confirmAction === 'delete' ? t('category.confirmDelete') : t('common.confirmStatusNamed', { action: confirmItem?.status === 1 ? t('common.disable') : t('common.enable'), kind: t('common.kindCategory') })"
      :tone="confirmAction === 'delete' ? 'error' : confirmItem?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirm"
    >
      {{ t('common.confirmNamed', { action: confirmAction === 'delete' ? t('common.delete') : (confirmItem?.status === 1 ? t('common.disable') : t('common.enable')), name: confirmItem?.name }) }}
      <template v-if="confirmAction === 'delete'">{{ t('category.confirmDeleteHint') }}</template>
    </ManageConfirmModal>
  </div>
</template>
