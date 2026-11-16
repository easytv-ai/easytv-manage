<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const { t } = useI18n()

const searchable = computed(() => {
  const items = attrs.items
  return Array.isArray(items) && items.length > 8
})
</script>

<template>
  <USelectMenu
    v-if="searchable"
    v-bind="attrs"
    :search-input="{ placeholder: t('common.search'), icon: 'i-lucide-search' }"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </USelectMenu>
  <USelect v-else v-bind="attrs">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </USelect>
</template>
