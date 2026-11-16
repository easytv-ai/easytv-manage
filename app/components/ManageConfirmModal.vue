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
  confirmText: '',
  cancelText: '',
  loadingText: '',
  loading: false,
  disabled: false,
})

const { t } = useI18n()
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })
const confirmLabel = computed(() => props.confirmText || t('common.confirm'))
const cancelLabel = computed(() => props.cancelText || t('common.cancel'))
const loadingLabel = computed(() => props.loadingText || t('common.processing'))

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
    :ui="{ content: 'manage-confirm-modal w-[min(calc(100vw-2rem),26rem)]' }"
  >
    <template #content>
      <div class="manage-confirm">
        <h3>
          <UIcon v-if="icon" :name="icon" class="size-4" />
          {{ title }}
        </h3>
        <div class="manage-confirm__body">
          <slot>{{ description }}</slot>
        </div>
        <div class="manage-confirm__actions">
          <UButton type="button" color="neutral" variant="outline" :disabled="loading" @click="close">{{ cancelLabel }}</UButton>
          <UButton type="button" :color="tone" :loading="loading" :disabled="loading || disabled" @click="emit('confirm')">
            {{ loading ? loadingLabel : confirmLabel }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
