<script setup lang="ts">
const localePath = useLocalePath()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <header class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <NuxtLink
          :to="localePath('/login')"
          class="flex items-center gap-2 text-sm font-semibold text-zinc-900 no-underline dark:text-white"
        >
          <img
            src="/favicon.svg"
            alt=""
            width="28"
            height="28"
            class="h-7 w-7 shrink-0 object-contain"
          >
          <span>{{ t('nav.console') }}</span>
        </NuxtLink>
      </div>
    </header>
    <main class="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <slot />
    </main>
    <footer class="border-t border-zinc-200 bg-white py-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p class="text-center text-sm text-zinc-600 dark:text-zinc-400">
        © {{ new Date().getFullYear() }} EasyTV · {{ t('nav.brandSubtitle') }}
      </p>
    </footer>
  </div>
</template>
