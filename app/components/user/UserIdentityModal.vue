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
  saved: [userId: number, identity: string]
}>()

const identity = ref('__none__')
const saving = ref(false)
const identityItems = computed(() => [
  { label: t('user.identityNone'), value: '__none__' },
  { label: t('user.identityOfficial'), value: 'easytv_official' },
  { label: t('user.identityEnterprise'), value: 'enterprise' },
  { label: t('user.identityTeacher'), value: 'easytv_teacher' },
  { label: t('user.identityAssistant'), value: 'easytv_teaching_assistant' },
])

watch(open, (visible) => {
  if (visible)
    identity.value = props.user?.identity || props.user?.tags[0] || '__none__'
})

async function submit() {
  if (!props.user)
    return
  saving.value = true
  try {
    const res = await userApi.setIdentity(props.user.id, identity.value)
    if (!isApiSuccess(res)) {
      notify(res?.message ?? t('user.identityFail'), 'error')
      return
    }
    emit('saved', props.user.id, identity.value)
    open.value = false
  }
  catch {
    notify(t('user.identityFail'), 'error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`${t('user.identityTitle')}${user ? ` — ${user.nickname}` : ''}`"
    :ui="{ content: 'w-[min(96vw,30rem)]', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <UFormField :label="t('user.identityType')" required>
        <URadioGroup
          v-model="identity"
          :items="identityItems"
          value-key="value"
          class="space-y-2"
        />
      </UFormField>
    </template>

    <template #footer>
      <UButton type="button" color="neutral" variant="outline" :disabled="saving" @click="() => { open = false }">
        {{ t('common.cancel') }}
      </UButton>
      <UButton type="button" :loading="saving" :disabled="saving" @click="submit">
        {{ saving ? t('common.saving') : t('common.save') }}
      </UButton>
    </template>
  </UModal>
</template>
