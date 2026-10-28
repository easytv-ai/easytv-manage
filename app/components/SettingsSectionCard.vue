<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <UCard variant="outline" class="w-full dark:bg-zinc-950">
    <div class="mb-5">
      <h2 class="text-base font-semibold text-zinc-900 dark:text-white">
        {{ title }}
      </h2>
      <p
        v-if="description"
        class="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400"
      >
        {{ description }}
      </p>
    </div>
    <div class="space-y-5">
      <slot />
    </div>
  </UCard>
</template>
