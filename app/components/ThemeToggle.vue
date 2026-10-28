<script setup lang="ts">
const { isDark, toggleTheme } = useTheme()
const { t } = useI18n()

const ariaLabel = computed(() =>
  isDark.value ? t('theme.toLight') : t('theme.toDark'),
)
</script>

<template>
  <UButton
    type="button"
    color="neutral"
    variant="ghost"
    square
    class="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-200 bg-white p-0 text-zinc-600 ring-0 !shadow-none hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:!shadow-none dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
    :aria-label="ariaLabel"
    :aria-pressed="isDark"
    @click="toggleTheme"
  >
    <svg
      v-if="isDark"
      class="block h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.75"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
    <svg
      v-else
      class="block h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.75"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  </UButton>
</template>
