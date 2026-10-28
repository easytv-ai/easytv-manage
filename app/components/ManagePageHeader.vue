<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  pageTitle?: string
  pageTitleKey?: string
  pageDescription?: string
  pageDescriptionKey?: string
}>()

const { t } = useI18n()

const resolvedTitle = computed(() => {
  if (props.pageTitle)
    return props.pageTitle
  if (props.pageTitleKey)
    return t(props.pageTitleKey)
  return ''
})

const resolvedDescription = computed(() => {
  if (props.pageDescription)
    return props.pageDescription
  if (props.pageDescriptionKey)
    return t(props.pageDescriptionKey)
  return ''
})

const hasDescription = computed(
  () => !!props.pageDescription || !!props.pageDescriptionKey,
)
</script>

<template>
  <div v-bind="$attrs" class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 class="text-xl font-semibold text-zinc-900 dark:text-white sm:text-2xl">
        {{ resolvedTitle }}
      </h1>
      <p
        v-if="hasDescription || $slots.description"
        class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
      >
        <slot name="description">
          {{ resolvedDescription }}
        </slot>
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-6 sm:w-auto sm:shrink-0 sm:justify-end [&_button]:w-auto"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
