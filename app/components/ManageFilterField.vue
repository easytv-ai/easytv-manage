<script setup lang="ts">
defineProps<{
  label: string
  error?: string
}>()
</script>

<template>
  <div class="manage-filter-field">
    <span class="manage-filter-field__label">{{ label }}</span>
    <div class="manage-filter-field__control">
      <slot />
      <p v-if="error" class="mt-1 text-xs text-rose-600">{{ error }}</p>
    </div>
  </div>
</template>
