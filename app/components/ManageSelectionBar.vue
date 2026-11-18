<script setup lang="ts">
defineProps<{ count: number }>()
defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
    <span class="mr-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">{{ $t('common.selectedCount', { n: count }) }}</span>
    <slot />
    <UButton type="button" size="sm" color="neutral" variant="ghost" class="ml-auto" @click="$emit('clear')">
      {{ $t('common.clearSelection') }}
    </UButton>
  </div>
</template>
