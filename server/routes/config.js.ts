/**
 * 运行时公开配置：输出一段给 `window.__EASYTV_CONFIG__` 赋值的脚本。
 *
 * 预渲染页面里的 runtimeConfig.public 是构建期的值；这里在请求时取服务端的
 * runtimeConfig（Nitro 启动时已用 NUXT_PUBLIC_* 环境变量覆盖），页面在应用脚本之前
 * 同步加载本路由（见 nuxt.config.ts 的 app.head.script），再由
 * app/plugins/00.runtime-config.client.ts 写回客户端配置。
 *
 * 约束：
 * - 不能换成 public/ 下的静态文件。Nitro 在构建期把静态资源的体积与 ETag 写进清单，
 *   启动后改写文件会让 Content-Length 对不上；同名静态文件还会盖住本路由。
 * - 不能加进预渲染列表，理由同上。
 * - 只输出下面列出的键，新增 public 配置项时要同步这里与客户端插件。
 */
const RUNTIME_PUBLIC_KEYS = ['siteName', 'apiBaseUrl', 'studioUrl', 'partnerUrl'] as const

export default defineEventHandler((event) => {
  const pub = useRuntimeConfig(event).public as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of RUNTIME_PUBLIC_KEYS) {
    const value = pub[key]
    if (typeof value === 'string' && value)
      out[key] = value
  }
  setResponseHeader(event, 'Content-Type', 'application/javascript; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  // JSON.stringify 的结果本身就是合法的 JS 表达式，环境变量里的引号、换行不会破坏脚本
  return `window.__EASYTV_CONFIG__=${JSON.stringify(out)};\n`
})
