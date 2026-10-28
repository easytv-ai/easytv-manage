<script setup lang="ts">
import userApi from '~/api/user'
import { formatUnix, isOk } from '~/api/creative'

/**
 * 用户详情弹框：GET /admin/user/:id，展示脱敏后的账号信息。
 */

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  userId: number | null
}>()

const { t } = useI18n()
const { notify } = useNotifyToast()

const loading = ref(false)
const failed = ref(false)
const user = ref<any>(null)
let seq = 0

const num = (v: unknown) => (Number(v) || 0).toLocaleString()

function roleText(role: number) {
  if (role >= 100)
    return t('user.roleRoot')
  if (role >= 10)
    return t('user.roleAdmin')
  return t('user.roleUser')
}

function sourceText(item: any) {
  return [item.source, item.medium, item.campaign].map((v: unknown) => String(v || '').trim()).filter(Boolean).join(' / ')
}

function identityText(item: any) {
  const key = String(item?.identity || item?.tags?.[0] || '').trim()
  const labels: Record<string, string> = {
    easytv_official: t('user.identityOfficial'),
    enterprise: t('user.identityEnterprise'),
    easytv_teacher: t('user.identityTeacher'),
    easytv_teaching_assistant: t('user.identityAssistant'),
  }
  return labels[key] || ''
}

async function load(id: number) {
  const mySeq = ++seq
  loading.value = true
  failed.value = false
  user.value = null
  try {
    const raw = await userApi.getById(id)
    if (mySeq !== seq)
      return
    if (!isOk(raw) || !raw.data) {
      failed.value = true
      notify(raw?.message ?? t('user.detailFail'), 'error')
      return
    }
    user.value = raw.data
  }
  finally {
    if (mySeq === seq)
      loading.value = false
  }
}

watch(() => [open.value, props.userId] as const, ([visible, id]) => {
  if (!visible || !id)
    return
  void load(id)
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="user?.nickname || t('user.detailTitle')"
    :description="user ? `#${user.id}` : (userId ? `#${userId}` : undefined)"
    :ui="{ content: 'w-[min(96vw,32rem)]' }"
  >
    <template #body>
      <div v-if="loading || (!user && !failed)" class="flex min-h-40 items-center justify-center text-sm text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="mr-2 size-5 animate-spin" />
        {{ t('common.loading') }}
      </div>
      <UEmpty v-else-if="failed" icon="i-lucide-user" :title="t('user.detailFail')" class="min-h-40" />
      <div v-else class="space-y-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="Number(user.status) === 1 ? 'success' : 'error'" variant="subtle">
            {{ Number(user.status) === 1 ? t('user.statusNormal') : t('user.statusDisabled') }}
          </UBadge>
          <UBadge color="neutral" variant="subtle">{{ roleText(Number(user.role)) }}</UBadge>
          <UBadge v-if="identityText(user)" color="primary" variant="subtle">{{ identityText(user) }}</UBadge>
          <UBadge v-if="user.invite_blocked" color="warning" variant="subtle">{{ t('user.inviteBlocked') }}</UBadge>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.quota') }}</div>
            <p class="mt-1 font-semibold tabular-nums">{{ num(user.quota) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.usedQuota') }}</div>
            <p class="mt-1 font-semibold tabular-nums">{{ num(user.used_quota) }}</p>
          </div>
          <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="text-xs text-zinc-500">{{ t('user.requests') }}</div>
            <p class="mt-1 font-semibold tabular-nums">{{ num(user.request_count) }}</p>
          </div>
        </div>

        <dl class="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <div class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.account') }}</dt>
            <dd class="truncate">{{ user.username || '—' }}</dd>
          </div>
          <div v-if="user.mobile" class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.mobile') }}</dt>
            <dd class="truncate font-mono text-xs">{{ user.mobile }}</dd>
          </div>
          <div v-if="user.wechat_nickname || user.wechat_id" class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.wechat') }}</dt>
            <dd class="truncate">{{ user.wechat_nickname || user.wechat_id }}</dd>
          </div>
          <div v-if="user.github_id" class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">GitHub</dt>
            <dd class="truncate font-mono text-xs">{{ user.github_id }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.inviter') }}</dt>
            <dd>
              <button
                v-if="Number(user.inviter_id) > 0"
                type="button"
                class="inline-flex min-h-8 items-center rounded-md px-2 font-mono text-xs text-primary hover:bg-primary/10"
                @click="load(Number(user.inviter_id))"
              >
                #{{ user.inviter_id }}
              </button>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.affCode') }}</dt>
            <dd class="font-mono text-xs">{{ user.aff_code || '—' }}</dd>
          </div>
          <div v-if="sourceText(user)" class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="shrink-0 text-zinc-500">{{ t('user.source') }}</dt>
            <dd class="truncate text-right">{{ sourceText(user) }}</dd>
          </div>
          <div v-if="user.bonus_code" class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.bonusCode') }}</dt>
            <dd class="font-mono text-xs">{{ user.bonus_code }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('common.createTime') }}</dt>
            <dd>{{ formatUnix(user.created_at) || '—' }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-3 py-2.5">
            <dt class="text-zinc-500">{{ t('user.lastLogin') }}</dt>
            <dd>{{ formatUnix(user.last_login_at) || '—' }}</dd>
          </div>
        </dl>

        <div v-if="user.remark" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="text-xs text-zinc-500">{{ t('user.remark') }}</div>
          <p class="mt-1 whitespace-pre-wrap">{{ user.remark }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
