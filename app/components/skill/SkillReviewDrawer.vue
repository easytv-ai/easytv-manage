<script setup lang="ts">
import { adminSkillApi, formatUnix, isOk } from '~/api/creative'
import { DEFAULT_WORK_COVER, resolveMediaUrl } from '~/utils/media'

/**
 * 技能审核详情抽屉（T27）：展示作者 / 描述 / 提示词 / 封面 / 示例视频 / 调用与收益，
 * 可编辑 revenue_share 并随「通过」一起提交（PUT /admin/skill/:id/review）。
 */

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ skill: Record<string, any> | null }>()
const emit = defineEmits<{
  reviewed: []
  reject: [target: { id: number, title: string }]
  unpublish: [target: { id: number, title: string }]
}>()

const { t } = useI18n()
const { notify } = useNotifyToast()

const revenueShare = ref('')
const approving = ref(false)
const shareError = ref('')

const reviewStatus = computed(() => Number(props.skill?.review_status) || 0)
const coverUrl = computed(() => resolveMediaUrl(props.skill?.cover_url) || DEFAULT_WORK_COVER)
const videoUrl = computed(() => resolveMediaUrl(props.skill?.video_url) || '')
const authorLabel = computed(() => {
  const s = props.skill
  if (!s)
    return ''
  const name = s.author?.nickname || s.author_nickname || s.author_name || ''
  return name ? `${name} #${s.user_id}` : `#${s.user_id}`
})
const canApprove = computed(() => reviewStatus.value === 1 || reviewStatus.value === 3)
const canReject = computed(() => reviewStatus.value === 1)
const canUnpublish = computed(() => reviewStatus.value === 2)

watch(() => [open.value, props.skill?.id] as const, ([visible]) => {
  if (!visible)
    return
  const share = Number(props.skill?.revenue_share) || 0
  revenueShare.value = share > 0 ? String(share) : ''
  shareError.value = ''
})

function parseShare(): number | null {
  const text = String(revenueShare.value ?? '').trim()
  if (!text)
    return 0
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || n > 1)
    return null
  return Math.round(n * 100) / 100
}

async function approve() {
  if (!props.skill || approving.value)
    return
  const share = parseShare()
  if (share === null) {
    shareError.value = t('skill.review.shareInvalid')
    return
  }
  shareError.value = ''
  approving.value = true
  try {
    const raw = await adminSkillApi.review(props.skill.id, { action: 'approve', revenue_share: share })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(raw?.message || t('skill.review.approved'))
    open.value = false
    emit('reviewed')
  }
  finally {
    approving.value = false
  }
}

function target() {
  return { id: Number(props.skill?.id) || 0, title: String(props.skill?.title ?? '') }
}

const num = (v: unknown) => (Number(v) || 0).toLocaleString()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('skill.review.drawerTitle')"
    :description="skill ? `${skill.title} · ${authorLabel}` : undefined"
    :ui="{ content: 'w-[min(96vw,40rem)] max-w-none', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div v-if="skill" class="space-y-5">
        <img :src="coverUrl" alt="" class="aspect-video w-full rounded-lg object-cover">

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('skill.review.status') }}</div>
            <p class="mt-1">
              <UBadge :color="reviewStatus === 2 ? 'success' : reviewStatus === 1 ? 'warning' : reviewStatus === 3 ? 'error' : 'neutral'" variant="subtle">
                {{ t(`skill.review.status${reviewStatus}`) }}
              </UBadge>
            </p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('skill.review.callsTotal') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(skill.calls_total) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('skill.review.revenueTotal') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(skill.revenue_total) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('skill.review.uses') }}</div>
            <p class="mt-1 text-xl font-semibold tabular-nums">{{ num(skill.uses) }}</p>
          </div>
        </div>

        <dl class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
          <dt class="text-zinc-500">{{ t('skill.review.author') }}</dt>
          <dd>{{ authorLabel }}</dd>
          <dt class="text-zinc-500">{{ t('skill.review.category') }}</dt>
          <dd>{{ skill.category || '—' }}</dd>
          <dt class="text-zinc-500">{{ t('skill.review.descriptionLabel') }}</dt>
          <dd class="whitespace-pre-wrap break-words">{{ skill.description || '—' }}</dd>
          <dt class="text-zinc-500">{{ t('skill.review.submittedAt') }}</dt>
          <dd>{{ formatUnix(skill.submitted_at) || '—' }}</dd>
          <dt class="text-zinc-500">{{ t('skill.review.publishedAt') }}</dt>
          <dd>{{ formatUnix(skill.published_at) || '—' }}</dd>
          <template v-if="skill.review_remark">
            <dt class="text-zinc-500">{{ t('skill.review.remark') }}</dt>
            <dd class="whitespace-pre-wrap break-words text-rose-600 dark:text-rose-400">{{ skill.review_remark }}</dd>
          </template>
        </dl>

        <div>
          <h3 class="mb-2 text-sm font-semibold">{{ t('skill.review.prompt') }}</h3>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">{{ skill.prompt || '—' }}</pre>
        </div>

        <div v-if="skill.guide || skill.output_format">
          <h3 class="mb-2 text-sm font-semibold">{{ t('skill.review.guide') }}</h3>
          <p class="mb-2 text-xs text-zinc-500">{{ t('skill.review.guideHelp') }}</p>
          <pre v-if="skill.guide" class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">{{ skill.guide }}</pre>
          <template v-if="skill.output_format">
            <h4 class="mb-1 mt-3 text-xs font-semibold text-zinc-500">{{ t('skill.review.outputFormat') }}</h4>
            <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">{{ skill.output_format }}</pre>
          </template>
        </div>

        <div v-if="videoUrl">
          <h3 class="mb-2 text-sm font-semibold">{{ t('skill.review.video') }}</h3>
          <video :src="videoUrl" controls preload="metadata" class="aspect-video w-full rounded-lg bg-black" />
        </div>

        <UFormField :label="t('skill.review.revenueShare')" :help="t('skill.review.revenueShareHelp')" :error="shareError || undefined">
          <UInput
            :model-value="revenueShare"
            type="number"
            min="0"
            max="1"
            step="0.01"
            placeholder="0"
            class="w-full sm:w-48"
            :disabled="!canApprove && !canUnpublish"
            @update:model-value="revenueShare = String($event ?? '')"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton v-if="skill && canUnpublish" type="button" color="warning" variant="soft" :disabled="approving" @click="emit('unpublish', target())">
        {{ t('skill.review.unpublish') }}
      </UButton>
      <UButton v-if="skill && canReject" type="button" color="error" variant="soft" :disabled="approving" @click="emit('reject', target())">
        {{ t('skill.review.reject') }}
      </UButton>
      <UButton v-if="skill && canApprove" type="button" color="success" :loading="approving" :disabled="approving" @click="approve">
        {{ approving ? t('common.processing') : t('skill.review.approve') }}
      </UButton>
    </template>
  </USlideover>
</template>
