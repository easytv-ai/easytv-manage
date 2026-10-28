<script setup lang="ts">
const { t } = useI18n()
useHead({
  title: () => t('auth.pageTitle'),
})

definePageMeta({
  layout: 'simple',
  middleware: 'guest',
})
</script>

<template>
  <LoginRegister />
</template>
