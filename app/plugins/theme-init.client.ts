/**
 * 在 Vue 注水前同步读取 localStorage 与系统主题，避免首屏主题闪烁。
 */
export default defineNuxtPlugin({
  name: 'easytv-theme-init',
  enforce: 'pre',
  setup() {
    const { explicit, systemDark, STORAGE_KEY } = useTheme()

    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (s === 'light' || s === 'dark')
        explicit.value = s
    }
    catch {
      /* ignore */
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = mq.matches
    mq.addEventListener('change', (e) => {
      systemDark.value = e.matches
    })
  },
})
