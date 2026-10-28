<script setup lang="ts">
import type { AdminUser } from '~/types/easytv-admin'
import userApi from '~/api/user'
import { isApiSuccess } from '~/utils/admin-user'

const { t } = useI18n()
const { notify } = useNotifyToast()
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  user: AdminUser | null
}>()

const emit = defineEmits<{
  saved: [userId: number]
}>()

const mobile = ref('')
const wechatUnbind = ref(false)
const saving = ref(false)

const hasWechat = computed(() => Boolean(props.user?.wechatId))

watch(open, (visible) => {
  if (!visible)
    return
  mobile.value = props.user?.mobile || ''
  wechatUnbind.value = false
})

async function submit() {
  if (!props.user)
    return
  const nextMobile = mobile.value.trim()
  const mobileChanged = nextMobile !== (props.user.mobile || '')
  if (!mobileChanged && !wechatUnbind.value) {
    notify(t('user.rebindNoChange'), 'info')
    return
  }
  saving.value = true
  try {
    const body: { mobile?: string, wechat_unbind?: boolean } = {}
    if (mobileChanged)
      body.mobile = nextMobile
    if (wechatUnbind.value)
      body.wechat_unbind = true
    const res = await userApi.rebind(props.user.id, body)
    if (!isApiSuccess(res)) {
      notify(res?.message ?? t('user.rebindFail'), 'error')
      return
    }
    notify(t('user.rebindOk'))
    emit('saved', props.user.id)
    open.value = false
  }
  catch {
    notify(t('user.rebindFail'), 'error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`${t('user.rebindTitle')}${user ? ` — ${user.nickname}` : ''}`"
    :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-zinc-500">
          {{ t('user.rebindHint') }}
        </p>
        <UFormField :label="t('user.rebindMobile')">
          <UInput
            v-model="mobile"
            inputmode="numeric"
            maxlength="11"
            :placeholder="t('user.rebindMobilePh')"
            class="w-full"
          />
        </UFormField>
        <div v-if="hasWechat" class="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <div class="text-xs text-zinc-500">{{ t('user.wechat') }}</div>
          <p class="mt-1 truncate">{{ user?.wechatNickname || user?.wechatId }}</p>
          <UCheckbox v-model="wechatUnbind" class="mt-3" :label="t('user.rebindWechat')" />
        </div>
        <p v-else class="text-sm text-zinc-400">
          {{ t('user.rebindNoWechat') }}
        </p>
      </div>
    </template>

    <template #footer>
      <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { open = false }">
        {{ t('common.cancel') }}
      </UButton>
      <UButton type="button" :loading="saving" :disabled="saving" @click="submit">
        {{ saving ? t('common.saving') : t('user.rebindSave') }}
      </UButton>
    </template>
  </UModal>
</template>
