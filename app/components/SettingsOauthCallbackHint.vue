<script setup lang="ts">
const props = defineProps<{
  lines: string[]
  base: string
}>()

const resolvedLines = computed(() => {
  const siteBase = props.base.trim().replace(/\/+$/, '') || 'https://yourdomain.com'
  return props.lines.map(line => line.replace(/\{base\}/g, siteBase))
})
</script>

<template>
  <UAlert
    color="info"
    variant="subtle"
    icon="i-lucide-info"
    :ui="{ root: 'items-start' }"
  >
    <template #description>
      <ul class="space-y-1 text-sm leading-relaxed">
        <li v-for="(line, index) in resolvedLines" :key="index">
          {{ line }}
        </li>
      </ul>
    </template>
  </UAlert>
</template>
