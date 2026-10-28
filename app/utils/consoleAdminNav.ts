export interface ConsoleNavLink {
  to: string
  labelKey: string
  superAdminOnly?: boolean
  disabled?: boolean
}

export interface ConsoleNavGroup {
  titleKey: string
  icon: string
  links: ConsoleNavLink[]
}

/** 管理后台侧栏分组导航，后续新页面按分类追加 links 即可 */
export const CONSOLE_ADMIN_NAV_GROUPS: ConsoleNavGroup[] = [
  {
    titleKey: 'console.nav.groupOverview',
    icon: 'i-lucide-layout-dashboard',
    links: [
      { to: '/dashboard', labelKey: 'console.nav.dashboard' },
      { to: '/creation-metrics', labelKey: 'console.nav.creationMetrics' },
    ],
  },
  {
    titleKey: 'console.nav.groupUser',
    icon: 'i-lucide-users',
    links: [
      { to: '/user', labelKey: 'console.nav.userList' },
      { to: '/partner', labelKey: 'console.nav.partner' },
      { to: '/team', labelKey: 'console.nav.team' },
    ],
  },
  {
    titleKey: 'console.nav.groupContent',
    icon: 'i-lucide-clapperboard',
    links: [
      { to: '/work', labelKey: 'console.nav.work' },
      { to: '/showcase', labelKey: 'console.nav.showcase' },
      { to: '/skill', labelKey: 'console.nav.skill' },
      { to: '/banner', labelKey: 'console.nav.banner' },
      { to: '/community-audit', labelKey: 'console.nav.communityAudit' },
      { to: '/ugc', labelKey: 'console.nav.ugc' },
    ],
  },
  {
    titleKey: 'console.nav.groupStudio',
    icon: 'i-lucide-folder-kanban',
    links: [
      { to: '/project', labelKey: 'console.nav.project' },
      { to: '/asset', labelKey: 'console.nav.asset' },
      { to: '/canvas', labelKey: 'console.nav.canvas' },
      { to: '/subject', labelKey: 'console.nav.subject' },
      { to: '/task', labelKey: 'console.nav.task' },
    ],
  },
  {
    titleKey: 'console.nav.groupBilling',
    icon: 'i-lucide-wallet',
    links: [
      { to: '/plan', labelKey: 'console.nav.plan' },
      { to: '/order', labelKey: 'console.nav.order' },
      { to: '/recharge', labelKey: 'console.nav.recharge' },
      { to: '/withdraw', labelKey: 'console.nav.withdraw' },
      { to: '/bill', labelKey: 'console.nav.bill' },
      { to: '/wallet', labelKey: 'console.nav.wallet' },
      { to: '/bonus-code', labelKey: 'console.nav.bonusCode', superAdminOnly: true },
    ],
  },
  {
    titleKey: 'console.nav.groupModel',
    icon: 'i-lucide-cpu',
    links: [
      { to: '/model-price', labelKey: 'console.nav.modelPrice' },
    ],
  },
  {
    titleKey: 'console.nav.groupOps',
    icon: 'i-lucide-megaphone',
    links: [
      { to: '/category', labelKey: 'console.nav.category' },
      { to: '/prompt', labelKey: 'console.nav.prompt' },
      { to: '/style', labelKey: 'console.nav.style' },
      { to: '/notice', labelKey: 'console.nav.notice' },
      { to: '/notification', labelKey: 'console.nav.notification' },
      { to: '/campaign', labelKey: 'console.nav.campaign', superAdminOnly: true },
    ],
  },
  {
    titleKey: 'console.nav.groupSystem',
    icon: 'i-lucide-settings',
    links: [
      { to: '/audit', labelKey: 'console.nav.audit' },
      { to: '/system', labelKey: 'console.nav.system', superAdminOnly: true },
    ],
  },
]

export function filterConsoleNavGroups(
  groups: ConsoleNavGroup[],
  isSuperAdmin: boolean,
): ConsoleNavGroup[] {
  return groups
    .map(group => ({
      ...group,
      links: group.links.filter(link => !link.superAdminOnly || isSuperAdmin),
    }))
    .filter(group => group.links.length > 0)
}
