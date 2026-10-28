/**
 * 主题：未手动设置时跟随 prefers-color-scheme；手动切换写入 localStorage（easytv-theme）。
 */
export type ThemeExplicit = 'light' | 'dark'

const STORAGE_KEY = 'easytv-theme'

export function useTheme() {
  const explicit = useState<ThemeExplicit | null>('easytv-theme-explicit', () => null)
  const systemDark = useState<boolean>('easytv-theme-system', () => false)

  const isDark = computed(() => {
    if (explicit.value === 'light')
      return false
    if (explicit.value === 'dark')
      return true
    return systemDark.value
  })

  function toggleTheme() {
    const next: ThemeExplicit = isDark.value ? 'light' : 'dark'
    explicit.value = next
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, next)
      }
      catch {
        /* ignore */
      }
    }
  }

  return {
    isDark,
    toggleTheme,
    explicit,
    systemDark,
    STORAGE_KEY,
  }
}
