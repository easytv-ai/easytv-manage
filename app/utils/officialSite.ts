/**
 * 创作台（easytv-web）地址，来自运行时配置 `studioUrl`（环境变量 NUXT_PUBLIC_STUDIO_URL）。
 * 顶栏「官网」跳转、审核页跳播放页、创作台静态资源拼接都用它，不再写死任何域名。
 */
export function resolveOfficialSiteUrl(): string {
  return String(useRuntimeConfig().public.studioUrl || '').replace(/\/$/, '')
}
