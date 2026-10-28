type NotifyType = 'success' | 'error' | 'info' | 'warning'

const NOTIFY_COLORS: Record<NotifyType, 'success' | 'error' | 'neutral' | 'warning'> = {
  success: 'success',
  error: 'error',
  info: 'neutral',
  warning: 'warning',
}

/** 统一用 Nuxt UI Toast 替代页面内 Alert 提示 */
export function useNotifyToast() {
  const toast = useToast()

  function notify(msg: string, type: NotifyType = 'success') {
    toast.add({
      title: msg,
      color: NOTIFY_COLORS[type],
    })
  }

  return { notify, toast }
}
