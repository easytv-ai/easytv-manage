<script setup lang="ts">
import { adminCommentApi, adminReportApi, adminWorkApi, formatUnix, isOk, parsePaged } from '~/api/creative'
import type { AdminAudit, AuditType } from '~/types/easytv-admin'

const { t } = useI18n()
useHead({ title: () => t('communityAudit.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()
const runtimeConfig = useRuntimeConfig()
const siteUrl = String((runtimeConfig.public as any).studioUrl || 'https://www.easytv.ai').replace(/\/$/, '')

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

const typeItems = [
  { label: '举报（作品 / 评论）', value: 'report' },
  { label: '作品发布审核', value: 'work' },
  { label: '评论', value: 'comment' },
]
const reviewStatusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '待审核', value: '0' },
  { label: '已通过', value: '1' },
  { label: '已驳回', value: '2' },
]
const commentStatusItems = [
  { label: '全部状态', value: '__all__' },
  { label: '正常', value: '1' },
  { label: '已隐藏', value: '2' },
]
const statusItems = computed(() => draft.type === 'comment' ? commentStatusItems : reviewStatusItems)
const typeLabels: Record<AuditType, string> = {
  work: '作品',
  report: '举报',
  comment: '评论',
}

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
    targetTitle: item.work_title || `作品 #${item.work_id}`,
    reason: item.parent_id ? '回复' : '一级评论',
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
    content: item.content || '（无补充说明）',
    authorName: item.reporter_name || `#${item.user_id}`,
    targetTitle: isCommentReport
      ? `评论：${String(item.comment_content || '').slice(0, 40) || `#${item.comment_id}`}`
      : (item.work_title || `作品 #${item.work_id}`),
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
    content: item.description || '（无简介）',
    authorName: item.author?.nickname || `#${item.user_id}`,
    targetTitle: item.title,
    reason: item.category || '未分类',
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
      notify(raw?.message ?? '加载失败', 'error')
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
    return '确认隐藏评论'
  if (confirmAction.value === 'restore')
    return '确认恢复评论'
  if (confirmAction.value === 'delete')
    return '确认删除评论'
  if (confirmAction.value === 'pass')
    return `确认${passLabel(confirmAudit.value)}`
  return '确认驳回'
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
    return '选填，会随站内通知发给评论人'
  if (confirmAction.value === 'restore')
    return '选填'
  return '选填，作者 / 复核时可见'
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
        notify(raw?.message ?? '操作失败', 'error')
        return
      }
      notify(confirmAction.value === 'delete' ? '评论已删除' : confirmAction.value === 'hide' ? '评论已隐藏，已通知评论人' : '评论已恢复')
    }
    else {
      const result = confirmAction.value === 'pass' ? 1 : 2
      const raw = audit.type === 'report'
        ? await adminReportApi.setStatus(audit.id, result, remark)
        : await adminWorkApi.review(audit.id, result, remark)
      if (!isOk(raw)) {
        notify(raw?.message ?? '操作失败', 'error')
        return
      }
      if (audit.type === 'report')
        notify(confirmAction.value === 'pass' ? (audit.targetType === 'comment' ? '举报成立，评论已隐藏' : '举报成立，作品已下架') : '举报已驳回')
      else
        notify(confirmAction.value === 'pass' ? '作品审核已通过' : '作品已驳回并隐藏')
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
    return '通过'
  return audit.targetType === 'comment' ? '成立并隐藏' : '成立并下架'
}

function statusLabel(audit: AdminAudit) {
  if (audit.type === 'comment')
    return audit.status === 2 ? '已隐藏' : '正常'
  if (audit.status === 1)
    return audit.type === 'report' ? '已成立' : '已通过'
  if (audit.status === 2)
    return '已驳回'
  return '待审核'
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

    <UCard variant="outline" class="mb-4 dark:bg-zinc-950">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField label="关键词">
          <UInput v-model="draft.keyword" placeholder="作品标题 / 举报说明 / 评论内容" class="w-full" @keyup.enter="search" />
        </UFormField>
        <UFormField label="类型">
          <USelect v-model="draft.type" :items="typeItems" value-key="value" class="w-full" />
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
                <th class="min-w-0 w-full px-4 py-3 text-left">{{ isReport ? '举报说明' : isComment ? '评论内容' : '作品简介' }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? '举报人' : isComment ? '评论人' : '作者' }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? '举报对象' : isComment ? '所属作品' : '作品' }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">类型</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport ? '原因' : isComment ? '层级' : '分类' }}</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">状态</th>
                <th class="w-[1%] whitespace-nowrap px-4 py-3">{{ isReport || isComment ? '提交时间' : '发布时间' }}</th>
                <th class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-zinc-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] dark:bg-zinc-900">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr v-for="audit in pageRows" :key="`${audit.type}-${audit.id}`" class="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                <td class="max-w-0 w-full px-4 py-3">
                  <p class="truncate" :title="audit.content">{{ audit.content }}</p>
                  <p v-if="audit.remark" class="mt-1 truncate text-xs text-zinc-400" :title="audit.remark">备注：{{ audit.remark }}</p>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.authorName }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <a :href="watchUrl(audit)" target="_blank" rel="noopener" class="text-primary hover:underline">{{ audit.targetTitle }}</a>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.type === 'report' && audit.targetType === 'comment' ? '评论举报' : typeLabels[audit.type] }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">{{ audit.reason }}</td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3">
                  <UBadge :color="statusColor(audit.status)" variant="subtle">
                    {{ statusLabel(audit) }}
                  </UBadge>
                </td>
                <td class="w-[1%] whitespace-nowrap px-4 py-3 text-zinc-500">{{ audit.createdAt }}</td>
                <td class="sticky right-0 z-10 w-[1%] whitespace-nowrap bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.16)] group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/60">
                  <div v-if="audit.type === 'comment'" class="flex w-max flex-nowrap gap-1">
                    <UButton v-if="audit.status !== 2" type="button" size="sm" variant="soft" color="warning" :disabled="confirming" @click="requestConfirm(audit, 'hide')">隐藏</UButton>
                    <UButton v-else type="button" size="sm" variant="soft" color="success" :disabled="confirming" @click="requestConfirm(audit, 'restore')">恢复</UButton>
                    <UButton type="button" size="sm" variant="soft" color="error" :disabled="confirming" @click="requestConfirm(audit, 'delete')">删除</UButton>
                  </div>
                  <div v-else-if="audit.status === 0" class="flex w-max flex-nowrap gap-1">
                    <UButton type="button" size="sm" variant="soft" :color="isReport ? 'error' : 'success'" @click="requestConfirm(audit, 'pass')">
                      {{ passLabel(audit) }}
                    </UButton>
                    <UButton type="button" size="sm" variant="soft" :color="isReport ? 'neutral' : 'error'" @click="requestConfirm(audit, 'reject')">
                      驳回
                    </UButton>
                  </div>
                  <span v-else class="text-zinc-400">已处理</span>
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
                <template v-if="confirmAction === 'hide'">隐藏“{{ confirmAudit?.authorName }}”的评论？评论将不再对其他人展示，并通知评论人。</template>
                <template v-else-if="confirmAction === 'restore'">恢复“{{ confirmAudit?.authorName }}”的评论？评论将重新公开显示。</template>
                <template v-else>删除“{{ confirmAudit?.authorName }}”的评论？此操作不可恢复，一级评论会连带回复一起删除。</template>
              </template>
              <template v-else-if="confirmAudit?.type === 'report'">
                <template v-if="confirmAction === 'pass' && confirmAudit?.targetType === 'comment'">判定“{{ confirmAudit?.authorName }}”对该评论的举报成立？评论会立即隐藏并通知评论人，同一评论的其它待处理举报一并结案。</template>
                <template v-else-if="confirmAction === 'pass'">判定“{{ confirmAudit?.authorName }}”对《{{ confirmAudit?.targetTitle }}》的举报成立？作品会立即下架，同一作品的其它待处理举报一并结案。</template>
                <template v-else>驳回“{{ confirmAudit?.authorName }}”的举报？{{ confirmAudit?.targetType === 'comment' ? '评论保持展示。' : '作品保持展示。' }}</template>
              </template>
              <template v-else>
                <template v-if="confirmAction === 'pass'">通过“{{ confirmAudit?.authorName }}”发布的《{{ confirmAudit?.targetTitle }}》？</template>
                <template v-else>驳回《{{ confirmAudit?.targetTitle }}》？作品会从信息流隐藏，作者在「我的作品」里可以看到驳回备注。</template>
              </template>
            </p>
            <p v-if="isCommentAction && confirmAudit?.content" class="mt-2 line-clamp-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900">{{ confirmAudit.content }}</p>
          </div>
          <UFormField v-if="showRemark" label="处理备注" :hint="remarkHint()">
            <UInput v-model="confirmRemark" maxlength="255" placeholder="例如：含未授权素材" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="confirming" @click="() => { confirmOpen = false }">
          取消
        </UButton>
        <UButton
          type="button"
          :color="confirmColor()"
          :loading="confirming"
          :disabled="confirming"
          @click="confirm"
        >
          {{ confirming ? '处理中…' : '确认' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
