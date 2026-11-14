/**
 * 用 /config.js（server/routes/config.js.ts）给出的运行时值覆盖 runtimeConfig.public。
 *
 * 页面是预渲染的静态 HTML，内嵌的 public 配置是构建期的值；同一份产物要靠这一步
 * 才能指向部署者自己的接口地址。必须排在所有会发请求的插件之前（文件名 00 + enforce: 'pre'），
 * 业务代码一律在调用时读 useRuntimeConfig()，不要在模块顶层把地址存成常量。
 *
 * /config.js 取不到（纯静态托管）或值不合法时保持构建期的值。
 */
const URL_KEYS = ['apiBaseUrl', 'studioUrl', 'partnerUrl'] as const

declare global {
  interface Window {
    __EASYTV_CONFIG__?: Record<string, unknown>
  }
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const text = value.trim()
  if (!text || text.length > 2048)
    return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null
  }
  catch {
    return null
  }
}

export default defineNuxtPlugin({
  name: 'easytv-runtime-config',
  enforce: 'pre',
  setup() {
    const injected = window.__EASYTV_CONFIG__
    if (!injected || typeof injected !== 'object')
      return
    const pub = useRuntimeConfig().public as Record<string, unknown>
    for (const key of URL_KEYS) {
      const url = httpUrl(injected[key])
      if (url)
        pub[key] = url
    }
    const siteName = injected.siteName
    if (typeof siteName === 'string' && siteName.trim() && siteName.length <= 100)
      pub.siteName = siteName.trim()
  },
})
