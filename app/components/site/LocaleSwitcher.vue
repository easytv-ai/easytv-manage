<script setup lang="ts">
/**
 * 语言切换：Nuxt UI 下拉菜单 + 触发按钮。
 */
import type { DropdownMenuItem } from '@nuxt/ui'
import { canonicalI18nLocaleCode } from '~/utils/i18nLocaleCode'

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false },
)

const { locale, locales, setLocale, t } = useI18n()

const LOCALE_ORDER = ['zh', 'zh-tw', 'en'] as const

type LocaleCode = (typeof LOCALE_ORDER)[number]

const localeList = computed(() => {
  const list = locales.value.filter(l => typeof l.code === 'string')
  const byCode = new Map(list.map(l => [String(l.code).toLowerCase(), l]))
  return LOCALE_ORDER.map(code => byCode.get(code)).filter(Boolean) as typeof locales.value
})

const activeLocaleCode = computed(() =>
  canonicalI18nLocaleCode(String(locale.value), locales.value as { code: string, language?: string }[]),
)

function onSelect(code: LocaleCode) {
  if (code === activeLocaleCode.value)
    return
  void setLocale(code)
}

const localeMenuItems = computed<DropdownMenuItem[][]>(() => [
  localeList.value.map((item) => {
    const code = item.code as LocaleCode
    return {
      label: item.name ?? code,
      onSelect: () => onSelect(code),
      ...(activeLocaleCode.value === code ? { icon: 'i-lucide-check' as const } : {}),
    }
  }),
])
</script>

<template>
  <UDropdownMenu
    :items="localeMenuItems"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-[12.5rem]' }"
  >
    <UButton
      type="button"
      color="neutral"
      variant="ghost"
      square
      :class="[
        'inline-flex shrink-0 items-center justify-center border border-zinc-200 bg-white p-0 text-zinc-600 ring-0 !shadow-none hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:!shadow-none dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
        compact ? 'h-8 w-8' : 'h-9 w-9',
      ]"
      :aria-label="t('lang.menuAria')"
    >
      <svg
        class="block shrink-0 text-current"
        :class="compact ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]'"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <text
          x="9"
          y="11"
          text-anchor="middle"
          fill="currentColor"
          font-size="10"
          font-weight="600"
          font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
        >
          文
        </text>
        <text
          x="16"
          y="20"
          text-anchor="middle"
          fill="currentColor"
          font-size="12"
          font-weight="700"
          font-family="ui-sans-serif, system-ui, Georgia, serif"
        >
          A
        </text>
      </svg>
    </UButton>
  </UDropdownMenu>
</template>
