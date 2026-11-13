<script setup lang="ts">
import { adminCommentApi, adminReportApi, adminWorkApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import type { AdminAudit, AuditType } from '~/types/easytv-admin'

const { t } = useI18n()
useHead({ title: () => t('communityAudit.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const runtimeConfig = useRuntimeConfig()
const siteUrl = String((runtimeConfig.public as any).studioUrl || '').replace(/\/$/, '')

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const rows = ref<AdminAudit[]>([])
const draft = reactive({
  keyword: '',
  type: 'report' as AuditType,
  status: '__all__',
})
const applied = ref({ ...draft })
type ConfirmAction = 'pass' | 'reject' | 'hide' | 'restore' | 'delete'
const confirmOpen = ref(false)
const confirmAction = ref<ConfirmAction>('pass')
const confirmAudit = ref<AdminAudit | null>(null)
const confirmRemark = ref('')
const confirming = ref(false)

const typeItems = computed(() => [
  { label: t('communityAudit.tabReport'), value: 'report' },
  { label: t('communityAudit.tabWork'), value: 'work' },
  { label: t('communityAudit.tabComment'), value: 'comment' },
])
const reviewStatusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.pendingReview'), value: '0' },
  { label: t('communityAudit.passed'), value: '1' },
  { label: t('common.reject'), value: '2' },
])
const commentStatusItems = computed(() => [
  { label: t('common.allStatus'), value: '__all__' },
  { label: t('common.normal'), value: '1' },
  { label: t('communityAudit.hidden'), value: '2' },
])
const statusItems = computed(() => draft.type === 'comment' ? commentStatusItems.value : reviewStatusItems.value)
const typeLabels = computed<Record<AuditType, string>>(() => ({
  work: t('communityAudit.work'),
  report: t('communityAudit.report'),
  comment: t('communityAudit.tabComment'),
}))

const pageRows = computed(() => rows.value)
const isReport = computed(() => applied.value.type === 'report')
const isComment = computed(() => applied.value.type === 'comment')

/** 评论行：status 1 正常 → AuditStatus 1；2 已隐藏 → 2 */
function commentToRow(item: any): AdminAudit {
  return {
    id: item.id,
    type: 'comment',
    content: item.content || '',
    authorName: item.author?.nickname || `#${item.user_id}`,
    targetTitle: item.work_title || `${t('communityAudit.work')} #${item.work_id}`,
    reason: item.parent_id ? t('communityAudit.reply') : t('communityAudit.topComment'),
    status: item.status === 2 ? 2 : 1,
    createdAt: formatUnix(item.created_at),
    workId: Number(item.work_id) || 0,
    remark: item.remark || '',
    commentId: item.id,
  }
}

const isCommentAction = computed(() => ['hide', 'restore', 'delete'].includes(confirmAction.value))
const showRemark = computed(() => confirmAction.value !== 'delete')

function reportToRow(item: any): AdminAudit {
  const isCommentReport = item.target_type === 'comment'
  return {
    id: item.id,
    type: 'report',
    content: item.content || t('communityAudit.noReason'),
    authorName: item.reporter_name || `#${item.user_id}`,
    targetTitle: isCommentReport
      ? `${t('communityAudit.tabComment')}：${String(item.comment_content || '').slice(0, 40) || `#${item.comment_id}`}`
      : (item.work_title || `${t('communityAudit.work')} #${item.work_id}`),
    reason: item.reason || '',
    status: item.status === 1 ? 1 : item.status === 2 ? 2 : 0,
    createdAt: formatUnix(item.created_at),
    workId: Number(item.work_id) || 0,
    remark: item.remark || '',
    targetType: isCommentReport ? 'comment' : 'work',
    commentId: Number(item.comment_id) || 0,
  }
}

function workToRow(item: any): AdminAudit {
  return {
    id: item.id,
    type: 'work',
    content: item.description || t('communityAudit.noReason'),
    authorName: item.author?.nickname || `#${item.user_id}`,
    targetTitle: item.title,
    reason: item.category || '—',
    status: item.review_status === 1 ? 1 : item.review_status === 2 ? 2 : 0,
    createdAt: formatUnix(item.published_at || item.created_at),
    workId: item.id,
    remark: item.remark || '',
  }
}

const fetchList = useClientListFetch(async () => {
  beginListLoad()
  try {
    const status = applied.value.status === '__all__' ? undefined : Number(applied.value.status)
    const query = { page: page.value, page_size: pageSize.value, keyword: applied.value.keyword || undefined }
    const raw = applied.value.type === 'report'
      ? await adminReportApi.list({ ...query, status })
      : applied.value.type === 'comment'
        ? await adminCommentApi.list({ ...query, status })
        : await adminWorkApi.list({ ...query, review_status: status })
    const parsed = parsePaged(raw)
    if (!parsed) {
      rows.value = []
      total.value = 0
      notify(raw?.message ?? t('communityAudit.loadFail'), 'error')
      return
    }
    rows.value = parsed.items.map(applied.value.type === 'report' ? reportToRow : applied.value.type === 'comment' ? commentToRow : workToRow)
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

watch(() => draft.type, () => {
  draft.status = '__all__'
})

function search() {
  applied.value = { keyword: draft.keyword.trim(), type: draft.type, status: draft.status }
  page.value = 1
  void fetchList(`s-${Date.now()}`)
}

function reset() {
  Object.assign(draft, { keyword: '', type: 'report', status: '__all__' })
  search()
}

function requestConfirm(audit: AdminAudit, action: ConfirmAction) {
  confirmAudit.value = audit
  confirmAction.value = action
  confirmRemark.value = ''
  confirmOpen.value = true
}

function confirmTitle() {
  if (confirmAction.value === 'hide')
    return t('communityAudit.confirmHide')
  if (confirmAction.value === 'restore')
    return t('communityAudit.confirmRestore')
  if (confirmAction.value === 'delete')
    return t('communityAudit.confirmDelete')
  if (confirmAction.value === 'pass')
    return t('communityAudit.confirmPass')
  return t('communityAudit.confirmReject')
}

function confirmColor() {
  if (confirmAction.value === 'restore')
    return 'success'
  if (confirmAction.value === 'hide')
    return 'warning'
  if (confirmAction.value === 'pass')
    return confirmAudit.value?.type === 'report' ? 'error' : 'success'
  return 'error'
}

function remarkHint() {
  if (confirmAction.value === 'hide')
    return t('communityAudit.remarkPhPass')
  if (confirmAction.value === 'restore')
    return t('communityAudit.remarkPhOptional')
  return t('communityAudit.remarkPhReject')
}

async function confirm() {
  if (!confirmAudit.value)
    return
  confirming.value = true
  try {
    const audit = confirmAudit.value
    const remark = confirmRemark.value.trim()
    if (audit.type === 'comment') {
      const raw = confirmAction.value === 'delete'
        ? await adminCommentApi.remove(audit.id)
        : await adminCommentApi.setStatus(audit.id, confirmAction.value === 'hide' ? 2 : 1, remark)
      if (!isOk(raw)) {
        notify(raw?.message ?? t('common.opFail'), 'error')
        return
      }
      notify(confirmAction.value === 'delete' ? t('communityAudit.commentDeleted') : confirmAction.value === 'hide' ? t('communityAudit.commentHidden') : t('communityAudit.commentRestored'))
    }
    else {
      const result = confirmAction.value === 'pass' ? 1 : 2
      const raw = audit.type === 'report'
        ? await adminReportApi.setStatus(audit.id, result, remark)
        : await adminWorkApi.review(audit.id, result, remark)
      if (!isOk(raw)) {
        notify(raw?.message ?? t('common.opFail'), 'error')
        return
      }
      if (audit.type === 'report')
        notify(confirmAction.value === 'pass' ? (audit.targetType === 'comment' ? t('communityAudit.reportCommentHidden') : t('communityAudit.reportWorkDown')) : t('communityAudit.reportRejected'))
      else
        notify(confirmAction.value === 'pass' ? t('communityAudit.workPassed') : t('communityAudit.workRejected'))
    }
    confirmOpen.value = false
    await fetchList(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}

function passLabel(audit: AdminAudit | null) {
  if (audit?.type !== 'report')
    return t('common.pass')
  return audit.targetType === 'comment' ? t('common.hide') : t('common.takeDown')
}

function statusLabel(audit: AdminAudit) {
  if (audit.type === 'comment')
    return audit.status === 2 ? t('communityAudit.hidden') : t('common.normal')
  if (audit.status === 1)
    return audit.type === 'report' ? t('communityAudit.handled') : t('communityAudit.passed')
  if (audit.status === 2)
    return t('common.reject')
  return t('common.pendingReview')
}

function statusColor(status: AdminAudit['status']) {
  if (status === 1)
    return 'success'
  if (status === 2)
    return 'error'
  return 'warning'
}

function watchUrl(audit: AdminAudit) {
  return `${siteUrl}/watch/${audit.workId}`
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('communityAudit.title')" :page-description="t('communityAudit.description')" />

    <ManageFilterBar @search="search" @reset="reset">
        <ManageFilterField :label="t('common.keyword')">
          <UInput icon="i-lucide-search" v-model="draft.keyword" :placeholder="t('communityAudit.keywordPhWork')" class="w-full" @keyup.enter="search" />
        </ManageFilterField>
        <ManageFilterField :label="t('common.type')">
          <USelect v-model="draft.type" :items="typeItems" value-key="value" class="w-full" />
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
      <UEmpty
        v-else-if="pageRows.length === 0"
        icon="i-lucide-shield-check"
        :title="isReport ? t('communityAudit.emptyReport') : isComment ? t('communityAudit.emptyComment') : t('communityAudit.emptyWork')"
        :description="t('communityAudit.emptyDesc')"
        class="min-h-72"
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead class="bg-zinc-50 text-left text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ isReport ? t('communityAudit.colReason') : isComment ? t('communityAudit.colComment') : t('skill.review.descriptionLabel') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? t('communityAudit.colReporter') : isComment ? t('communityAudit.colAuthor') : t('communityAudit.colOwner') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? t('communityAudit.colTarget') : isComment ? t('communityAudit.colWork') : t('communityAudit.work') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.type') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? t('common.reason') : isComment ? t('communityAudit.colLevel') : t('common.category') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ t('common.status') }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport || isComment ? t('communityAudit.submittedAt') : t('communityAudit.publishedAt') }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="audit in pageRows" :key="`${audit.type}-${audit.id}`" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <p class="truncate" :title="audit.content">{{ audit.content }}</p>
                  <p v-if="audit.remark" class="mt-1 truncate text-xs text-zinc-400" :title="audit.remark">{{ t('common.remark') }}：{{ audit.remark }}</p>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.authorName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <a :href="watchUrl(audit)" target="_blank" rel="noopener" class="text-primary hover:underline">{{ audit.targetTitle }}</a>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.type === 'report' && audit.targetType === 'comment' ? t('communityAudit.tabComment') : typeLabels[audit.type] }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.reason }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(audit.status)" variant="subtle">
                    {{ statusLabel(audit) }}
                  </UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ audit.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div v-if="audit.type === 'comment'" class="flex w-max flex-nowrap gap-1">
                    <UButton v-if="audit.status !== 2" type="button" size="sm" variant="soft" color="warning" :disabled="confirming" @click="requestConfirm(audit, 'hide')">{{ t('common.hide') }}</UButton>
                    <UButton v-else type="button" size="sm" variant="soft" color="success" :disabled="confirming" @click="requestConfirm(audit, 'restore')">{{ t('common.restore') }}</UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" :disabled="confirming" @click="requestConfirm(audit, 'delete')">{{ t('common.delete') }}</UButton>
                  </div>
                  <div v-else-if="audit.status === 0" class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :color="isReport ? 'error' : 'success'" @click="requestConfirm(audit, 'pass')">
                      {{ passLabel(audit) }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" :color="isReport ? 'neutral' : 'error'" @click="requestConfirm(audit, 'reject')">
                      {{ t('common.reject') }}
                    </UButton>
                  </div>
                  <span v-else class="text-zinc-400">{{ t('communityAudit.processed') }}</span>
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
      v-model:open="confirmOpen"
      :title="confirmTitle()"
      :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              <template v-if="isCommentAction">
                <template v-if="confirmAction === 'hide'">{{ t('communityAudit.hideBody', { name: confirmAudit?.authorName }) }}</template>
                <template v-else-if="confirmAction === 'restore'">{{ t('communityAudit.restoreBody', { name: confirmAudit?.authorName }) }}</template>
                <template v-else>{{ t('communityAudit.deleteBody', { name: confirmAudit?.authorName }) }}</template>
              </template>
              <template v-else-if="confirmAudit?.type === 'report'">
                <template v-if="confirmAction === 'pass' && confirmAudit?.targetType === 'comment'">{{ t('communityAudit.passCommentBody', { name: confirmAudit?.authorName }) }}</template>
                <template v-else-if="confirmAction === 'pass'">{{ t('communityAudit.passWorkBody', { name: confirmAudit?.authorName, title: confirmAudit?.targetTitle }) }}</template>
                <template v-else>{{ confirmAudit?.targetType === 'comment' ? t('communityAudit.rejectCommentBody', { name: confirmAudit?.authorName }) : t('communityAudit.rejectWorkBody', { name: confirmAudit?.authorName }) }}</template>
              </template>
              <template v-else>
                <template v-if="confirmAction === 'pass'">{{ t('communityAudit.passReviewBody', { name: confirmAudit?.authorName, title: confirmAudit?.targetTitle }) }}</template>
                <template v-else>{{ t('communityAudit.rejectReviewBody', { title: confirmAudit?.targetTitle }) }}</template>
              </template>
            </p>
            <p v-if="isCommentAction && confirmAudit?.content" class="mt-2 line-clamp-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900">{{ confirmAudit.content }}</p>
          </div>
          <UFormField v-if="showRemark" :label="t('communityAudit.rejectRemark')" :hint="remarkHint()">
            <UInput v-model="confirmRemark" maxlength="255" :placeholder="t('communityAudit.rejectRemarkPh')" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">
          {{ t('common.cancel') }}
        </UButton>
        <UButton
          type="button"
          :color="confirmColor()"
          :loading="confirming"
          :disabled="confirming"
          @click="confirm"
        >
          {{ confirming ? t('common.processing') : t('common.confirm') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
