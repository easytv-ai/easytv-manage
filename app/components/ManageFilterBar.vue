<script setup lang="ts">
const emit = defineEmits<{
  search: []
  reset: []
}>()

const { t } = useI18n()
const expanded = ref(false)
// 被折叠的字段里有生效的筛选值时，由字段回调展开（见 ManageFilterField 的 value）。
provide('manageFilterExpand', () => {
  expanded.value = true
})

function onSearch() {
  emit('search')
}

function onReset() {
  emit('reset')
}
</script>

<template>
  <div class="manage-filter-bar mb-4" :class="{ 'is-collapsed': !expanded }">
    <div class="manage-filter-fields">
      <slot />
    </div>
    <div class="manage-filter-actions">
      <slot name="actions">
        <UButton type="button" color="neutral" variant="outline" @click="onReset">
          {{ t('common.reset') }}
        </UButton>
        <UButton type="button" @click="onSearch">
          {{ t('common.query') }}
        </UButton>
      </slot>
      <UButton
        type="button"
        variant="link"
        class="manage-filter-toggle"
        @click="expanded = !expanded"
      >
        {{ expanded ? t('common.collapseFilters') : t('common.expandFilters') }}
      </UButton>
    </div>
  </div>
</template>
