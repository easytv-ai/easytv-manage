<script setup lang="ts">
type Tone = 'error' | 'warning' | 'primary' | 'success'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  tone?: Tone
  icon?: string
  confirmText?: string
  cancelText?: string
  loadingText?: string
  loading?: boolean
  disabled?: boolean
}>(), {
  description: '',
  tone: 'error',
  icon: '',
  confirmText: '确认',
  cancelText: '取消',
  loadingText: '处理中…',
  loading: false,
  disabled: false,
})

const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })

const TONE_STYLE: Record<Tone, { icon: string, badge: string }> = {
  error: { icon: 'i-lucide-trash-2', badge: 'bg-error/10 text-error ring-error/5' },
  warning: { icon: 'i-lucide-triangle-alert', badge: 'bg-warning/10 text-warning ring-warning/5' },
  primary: { icon: 'i-lucide-circle-help', badge: 'bg-primary/10 text-primary ring-primary/5' },
  success: { icon: 'i-lucide-circle-check', badge: 'bg-success/10 text-success ring-success/5' },
}

const style = computed(() => TONE_STYLE[props.tone])

function close() {
  if (!props.loading)
    open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description || title"
    :dismissible="!loading"
    :ui="{ content: 'w-[min(calc(100vw-2rem),28rem)] divide-y-0' }"
  >
    <template #content>
      <div class="flex gap-4 p-6">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-full ring-8" :class="style.badge">
          <UIcon :name="icon || style.icon" class="size-5" />
        </span>
        <div class="min-w-0 flex-1 pt-0.5">
          <h3 class="text-base font-semibold tracking-tight text-highlighted">{{ title }}</h3>
          <div class="mt-2 text-sm leading-relaxed text-muted">
            <slot>{{ description }}</slot>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-default bg-elevated/50 px-6 py-4">
        <UButton type="button" color="neutral" variant="outline" :disabled="loading" @click="close">{{ cancelText }}</UButton>
        <UButton type="button" :color="tone" :loading="loading" :disabled="loading || disabled" @click="emit('confirm')">
          {{ loading ? loadingText : confirmText }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
