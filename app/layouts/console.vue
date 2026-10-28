<script setup lang="ts">
import ConsoleSidebarNav from '~/components/console/ConsoleSidebarNav.vue'
import {
  CONSOLE_ADMIN_NAV_GROUPS,
  filterConsoleNavGroups,
} from '~/utils/consoleAdminNav'
import { resolveOfficialSiteUrl } from '~/utils/officialSite'

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { collapsed: sidebarCollapsed } = useConsoleSidebar()
const { ready: authReady } = useAuthGate()
const { isSuperAdmin } = useAdminAccess()

const officialSiteUrl = computed(() => resolveOfficialSiteUrl())

const mobileNavOpen = ref(false)

watch(() => route.path, () => {
  mobileNavOpen.value = false
})

const navGroups = computed(() => filterConsoleNavGroups(CONSOLE_ADMIN_NAV_GROUPS, isSuperAdmin.value))
</script>

<template>
  <div
    v-if="!authReady"
    class="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400"
  >
    <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" aria-hidden="true" />
    <span class="sr-only">{{ t('nav.login') }}…</span>
  </div>
  <div
    v-else
    class="flex h-screen overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
  >
    <aside
      v-show="!sidebarCollapsed"
      class="hidden h-full w-56 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
      :aria-label="t('console.nav.sidebarAria')"
    >
      <div class="flex h-14 items-center border-b border-zinc-200 px-3 dark:border-zinc-800">
        <UTooltip :text="t('console.nav.backToHome')" :delay-duration="0">
          <NuxtLink
            :to="localePath('/')"
            class="flex min-w-0 items-center gap-2 py-1 text-sm font-semibold text-zinc-900 transition hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200"
          >
            <img
              src="/favicon.svg"
              alt=""
              width="28"
              height="28"
              class="h-7 w-7 shrink-0 object-contain"
            >
            <span class="truncate">{{ t('nav.console') }}</span>
          </NuxtLink>
        </UTooltip>
      </div>

      <nav class="flex flex-1 flex-col overflow-hidden">
        <ConsoleSidebarNav :groups="navGroups" />
      </nav>
    </aside>

    <USlideover
      v-model:open="mobileNavOpen"
      side="left"
      :title="t('nav.console')"
      :ui="{ content: 'max-w-xs w-[min(100vw,16rem)]', body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0' }"
    >
      <template #body>
        <ConsoleSidebarNav :groups="navGroups" @navigate="mobileNavOpen = false" />
      </template>
    </USlideover>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <header class="z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 sm:gap-3 sm:px-6">
        <UButton
          type="button"
          variant="ghost"
          color="neutral"
          icon="i-lucide-menu"
          class="lg:hidden"
          :aria-label="t('console.nav.openMenu')"
          @click="() => { mobileNavOpen = true }"
        />
        <div class="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <UButton
            :to="officialSiteUrl"
            target="_blank"
            rel="noopener"
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-external-link"
            class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-zinc-200 bg-white px-3 text-sm text-zinc-600 ring-0 !shadow-none hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:!shadow-none dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          >
            {{ t('nav.officialSite') }}
          </UButton>
          <ThemeToggle />
          <SiteLocaleSwitcher />
          <div class="ml-1 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
          <SiteManageUserMenu />
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto bg-zinc-50/80 p-4 sm:p-6 lg:p-8 dark:bg-transparent">
        <slot />
      </main>
    </div>
  </div>
</template>
