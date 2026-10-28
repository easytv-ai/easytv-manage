<script setup lang="ts">
import { consolePageSizeSelectItems } from '~/utils/consoleSelectItems'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  total: number
  disabled?: boolean
  showPageSize?: boolean
  pageSizeItems?: { label: string, value: number }[]
}>(), {
  disabled: false,
  showPageSize: true,
})

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const sizeItems = computed(() => props.pageSizeItems ?? consolePageSizeSelectItems())
</script>

<template>
  <div
    v-if="total > 0"
    class="console-table-pagination flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
  >
    <span class="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
      {{ t('common.totalItems', { total }) }}
    </span>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="pageSize"
        :disabled="disabled"
        :sibling-count="1"
        show-controls
        size="sm"
        color="neutral"
        variant="outline"
        active-color="primary"
        class="shrink-0"
      />
      <USelect
        v-if="showPageSize"
        v-model="pageSize"
        :items="sizeItems"
        value-key="value"
        :disabled="disabled"
        class="console-table-pagination__size hidden w-28 shrink-0 sm:block"
      />
    </div>
  </div>
</template>
