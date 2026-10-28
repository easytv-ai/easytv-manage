<script setup lang="ts">
const config = useRuntimeConfig()
const { isDark } = useTheme()
const { t, locale } = useI18n()

const description = computed(() => t('meta.description'))

const htmlLang = computed(() => {
  const map: Record<string, string> = {
    zh: 'zh-CN',
    'zh-tw': 'zh-TW',
    en: 'en',
  }
  return map[locale.value] ?? 'en'
})

useHead({
  titleTemplate: (titleChunk) => {
    const site = config.public.siteName as string
    return titleChunk ? `${titleChunk} · ${site}` : site
  },
  htmlAttrs: {
    lang: computed(() => htmlLang.value),
    class: computed(() => (isDark.value ? 'dark' : '')),
  },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: description },
  ],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
