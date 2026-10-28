<script setup lang="ts">
/**
 * 管理后台登录卡片：POST /user/login，用户名 + 密码。
 */
import { PASSWORD_MAX, PASSWORD_MIN } from '~/utils/password'

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { notify, toast } = useNotifyToast()
const { tryLogin } = useAuth()

const passwordHint = computed(() =>
  t('auth.passwordLengthHint', { min: PASSWORD_MIN, max: PASSWORD_MAX }),
)

const loginLoading = ref(false)

const loginForm = reactive({
  username: '',
  password: '',
})

const loginErrors = reactive({
  username: '',
  password: '',
})

function validateLogin(): boolean {
  loginErrors.username = ''
  loginErrors.password = ''
  const username = loginForm.username.trim()
  if (!username) {
    loginErrors.username = t('auth.usernameRequired')
    return false
  }
  if (!loginForm.password) {
    loginErrors.password = t('auth.passwordRequired')
    return false
  }
  return true
}

onMounted(() => {
  if (route.query.reason === 'no_access')
    notify(t('auth.noAccess'), 'error')
  else if (route.query.reason === 'session_expired')
    notify(t('auth.sessionExpired'), 'error')
})

async function onLoginSubmit() {
  if (!validateLogin())
    return
  loginLoading.value = true
  try {
    const res = await tryLogin(loginForm.username.trim(), loginForm.password)
    if (res.ok) {
      toast.add({ title: t('auth.loginSuccess'), color: 'success' })
      await navigateTo(localePath('/user'))
    }
    else {
      notify(res.message ?? t('auth.loginFail'), 'error')
    }
  }
  finally {
    loginLoading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <UCard
      variant="outline"
      class="shadow-sm dark:bg-zinc-900/50"
      :ui="{ body: 'p-6 sm:p-8 space-y-6' }"
    >
      <h2 class="text-xl font-semibold text-zinc-900 dark:text-white">
        {{ t('auth.title') }}
      </h2>

      <form class="space-y-4" @submit.prevent="onLoginSubmit">
        <UFormField :label="t('auth.username')" required :error="loginErrors.username || undefined">
          <UInput
            v-model="loginForm.username"
            type="text"
            autocomplete="username"
            :placeholder="t('auth.usernamePh')"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('auth.password')" required :error="loginErrors.password || undefined">
          <UInput
            v-model="loginForm.password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('auth.passwordPh', { hint: passwordHint })"
            :maxlength="PASSWORD_MAX"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          class="mt-2 justify-center"
          :loading="loginLoading"
          :disabled="loginLoading"
        >
          {{ loginLoading ? t('auth.loggingIn') : t('auth.login') }}
        </UButton>
      </form>
    </UCard>
  </div>
</template>
