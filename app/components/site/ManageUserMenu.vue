<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { logout, hydrate, isLoggedIn } = useAuth()
const { user, isAdmin, roleLabel, isSuperAdmin } = useAdminAccess()

const loggingOut = ref(false)
const menuOpen = ref(false)

onMounted(() => {
  hydrate()
})

const showMenu = computed(() => isLoggedIn.value && !!user.value)

const displayName = computed(() => {
  const nickname = String(user.value?.nickname ?? '').trim()
  if (nickname)
    return nickname
  return String(user.value?.username ?? '').trim() || '—'
})

const username = computed(() => String(user.value?.username ?? '').trim())

const email = computed(() => String(user.value?.email ?? '').trim())

const userId = computed(() => {
  const id = user.value?.id
  if (id == null || id === '')
    return ''
  return String(id)
})

const userInitial = computed(() => {
  const n = displayName.value
  return n !== '—' ? n.slice(0, 1).toUpperCase() : '?'
})

const subtitleLine = computed(() => {
  if (email.value)
    return email.value
  if (username.value && username.value !== displayName.value)
    return username.value
  if (userId.value)
    return `ID ${userId.value}`
  return ''
})

const badgeLabel = computed(() => roleLabel.value || (isAdmin.value ? t('common.admin') : ''))

async function onLogout() {
  menuOpen.value = false
  loggingOut.value = true
  try {
    const res = await logout()
    if (res.ok) {
      await navigateTo(localePath('/login'))
      return
    }
    toast.add({
      title: res.message ?? t('auth.logoutFail'),
      color: 'error',
    })
  }
  finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <ClientOnly>
    <UPopover
      v-if="showMenu"
      v-model:open="menuOpen"
      :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
    >
      <button
        type="button"
        class="flex max-w-[min(100%,14rem)] items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 py-1.5 pl-1.5 pr-2.5 text-left transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:bg-zinc-800"
        :aria-label="t('nav.userMenu')"
        :disabled="loggingOut"
      >
        <span
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          :class="isSuperAdmin ? 'bg-amber-600 dark:bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'"
        >
          {{ userInitial }}
        </span>
        <span class="min-w-0 flex-1 text-left">
          <span class="flex items-center gap-1.5">
            <span class="max-w-[5rem] truncate text-sm font-medium text-zinc-900 sm:max-w-[9rem] dark:text-zinc-50">
              {{ displayName }}
            </span>
            <UBadge
              v-if="badgeLabel"
              :color="isSuperAdmin ? 'warning' : 'primary'"
              variant="subtle"
              size="xs"
              class="shrink-0"
            >
              {{ badgeLabel }}
            </UBadge>
          </span>
          <span
            v-if="subtitleLine"
            class="hidden max-w-[9rem] truncate text-xs text-zinc-500 sm:block dark:text-zinc-400"
          >
            {{ subtitleLine }}
          </span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 shrink-0 text-zinc-400"
          :class="menuOpen ? 'rotate-180' : ''"
        />
      </button>

      <template #content>
        <div class="w-64 p-3">
          <div class="mb-3 flex items-start gap-3">
            <span
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              :class="isSuperAdmin ? 'bg-amber-600 dark:bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'"
            >
              {{ userInitial }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {{ displayName }}
              </p>
              <p
                v-if="email"
                class="truncate text-xs text-zinc-500 dark:text-zinc-400"
              >
                {{ email }}
              </p>
            </div>
          </div>

          <dl class="mb-3 space-y-1.5 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/80">
            <div v-if="username" class="flex justify-between gap-2">
              <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">
                {{ t('common.username') }}
              </dt>
              <dd class="truncate font-medium text-zinc-800 dark:text-zinc-200">
                {{ username }}
              </dd>
            </div>
            <div v-if="userId" class="flex justify-between gap-2">
              <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">
                {{ t('common.userId') }}
              </dt>
              <dd class="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                {{ userId }}
              </dd>
            </div>
            <div v-if="badgeLabel" class="flex justify-between gap-2">
              <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">
                {{ t('common.role') }}
              </dt>
              <dd
                class="font-medium"
                :class="isSuperAdmin ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'"
              >
                {{ badgeLabel }}
              </dd>
            </div>
          </dl>

          <UButton
            type="button"
            variant="soft"
            color="error"
            block
            icon="i-lucide-log-out"
            :loading="loggingOut"
            :disabled="loggingOut"
            @click="onLogout"
          >
            {{ loggingOut ? t('auth.loggingOut') : t('nav.logout') }}
          </UButton>
        </div>
      </template>
    </UPopover>

    <template #fallback>
      <div class="h-10 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    </template>
  </ClientOnly>
</template>
