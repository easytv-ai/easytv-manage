<script setup lang="ts">
const props = defineProps<{
  label: string
  error?: string
  /** 这个字段当前生效的筛选值。传了且不是缺省值（空 / 全部）时，若字段正被折叠，筛选条自动展开。 */
  value?: string | number | null
}>()

const root = ref<HTMLElement | null>(null)
const expandBar = inject<(() => void) | null>('manageFilterExpand', null)
const active = computed(() => {
  const v = props.value
  return v != null && v !== '' && v !== '__all__'
})

// 只在「变成有值」的那一刻检查一次：用户之后手动收起不会被反复撑开。
async function revealIfHidden() {
  if (!active.value || !expandBar)
    return
  await nextTick()
  if (root.value && getComputedStyle(root.value).display === 'none')
    expandBar()
}
onMounted(revealIfHidden)
watch(active, revealIfHidden)
</script>

<template>
  <div ref="root" class="manage-filter-field">
    <span class="manage-filter-field__label" :title="label">{{ label }}</span>
    <div class="manage-filter-field__control">
      <slot />
      <p v-if="error" class="mt-1 text-xs text-rose-600">{{ error }}</p>
    </div>
  </div>
</template>
