export interface AdminUser {
  id: number
  uuid: string
  username: string
  nickname: string
  mobile: string
  wechatId: string
  wechatNickname: string
  identity: string
  avatar: string | null
  status: 1 | 2
  role: number
  tags: string[]
  createTime: string
  deleted?: boolean
  /** 增长域（T14） */
  inviterId: number
  inviterNickname: string
  affCode: string
  source: string
  bonusCode: string
  inviteBlocked: boolean
}

export type WorkStatus = 1 | 2
export type AuditStatus = 0 | 1 | 2
/** work 作品发布审核 / report 举报（作品或评论） / comment 评论 */
export type AuditType = 'work' | 'report' | 'comment'

export interface AdminWork {
  id: number
  uuid: string
  title: string
  cover: string
  authorName: string
  duration: string
  playCount: number
  likeCount: number
  status: WorkStatus
  createdAt: string
}

export interface AdminAudit {
  id: number
  type: AuditType
  /** 作品：简介；举报：补充说明 */
  content: string
  authorName: string
  targetTitle: string
  /** 作品：分类；举报：举报原因 */
  reason: string
  status: AuditStatus
  createdAt: string
  /** 关联作品 ID（跳转播放页用） */
  workId: number
  /** 处理备注 */
  remark: string
  /** 举报对象：作品 / 评论 */
  targetType?: 'work' | 'comment'
  /** 评论 ID（评论行或评论举报） */
  commentId?: number
}

export interface OauthAppSettings {
  enabled: boolean
  clientId: string
  clientSecret: string
  scope?: string
  redirectUri?: string
}

export interface OidcSettings {
  enabled: boolean
  wellKnown: string
  clientId: string
  clientSecret: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
}

export interface LoginSettings {
  PasswordLoginEnabled: boolean
  PasswordRegisterEnabled: boolean
  EmailVerificationEnabled: boolean
  RegisterEnabled: boolean
  TurnstileCheckEnabled: boolean
  GitHubOAuthEnabled: boolean
  'discord.enabled': boolean
  LinuxDOOAuthEnabled: boolean
  WechatOAuthEnabled: boolean
  TelegramOAuthEnabled: boolean
  'oidc.enabled': boolean
}

export interface WechatPaySettings {
  enabled: boolean
  appId: string
  mchId: string
  mchSerialNo: string
  mchPrivateKey: string
  apiV3Key: string
  notifyUrl: string
  minRecharge: string
}

export interface SmsSettings {
  enabled: boolean
  url: string
  appId: string
  appKey: string
  signType: string
  smsProject: string
}

export interface InvoiceSettings {
  enabled: boolean
  serviceUrl: string
  appKey: string
  appSecret: string
  taxRate: string
  itemNo: string
  itemName: string
  category: string
}

export interface AlipaySettings {
  enabled: boolean
  isProduction: boolean
  /** 当面付；未配置时跟随 enabled */
  f2fEnabled: boolean
  /** 电脑网站支付 */
  pcWebEnabled: boolean
  appId: string
  appPrivateKey: string
  /** 支付宝公钥证书（AlipayPublicKey） */
  publicKey: string
  /** 应用公钥证书（AlipayAppCertPublicKey） */
  appCertPublicKey: string
  /** 支付宝根证书（AlipayRootCert） */
  rootCert: string
  notifyUrl: string
  /** 电脑网站支付回跳地址 */
  returnUrl: string
}

export interface SiteSettings {
  siteName: string
  siteUrl: string
  logo: string
  notice: string
  footer: string
  about: string
  homePageContent: string
  userAgreement: string
  privacyPolicy: string
  wechat: OauthAppSettings
  oidc: OidcSettings
  github: OauthAppSettings
  discord: OauthAppSettings
}

export type PublishStatus = 1 | 2
export type CategoryScope = 'work' | 'skill'
export type ProjectType = 'video' | 'canvas'
export type AssetType = 'video' | 'image' | 'audio'

export interface AdminShowcase {
  id: number
  title: string
  authorName: string
  category: string
  cover: string
  likes: number
  status: PublishStatus
  sortOrder: number
  createdAt: string
}

export interface AdminSkill {
  id: number
  title: string
  authorName: string
  category: string
  cover: string
  uses: number
  /** 画布模板节点数，0 表示只有提示词 */
  graphNodes: number
  status: PublishStatus
  createdAt: string
  /** 0 官方；>0 用户私有 */
  userId: number
  /** 审核状态（仅用户私有）：0 私有 / 1 待审 / 2 已上架 / 3 驳回 */
  reviewStatus: number
  reviewRemark: string
  /** 作者分成比例，0 表示用全局 GrowthSkillAuthorShare */
  revenueShare: number
  callsTotal: number
  revenueTotal: number
}

export interface AdminBanner {
  id: number
  title: string
  cover: string
  linkUrl: string
  sortOrder: number
  status: PublishStatus
  createdAt: string
}

export interface AdminProject {
  id: number
  title: string
  ownerName: string
  type: ProjectType
  status: PublishStatus
  createdAt: string
}

export interface AdminAssetItem {
  id: number
  title: string
  ownerName: string
  type: AssetType
  status: PublishStatus
  createdAt: string
}

export interface AdminCanvas {
  id: number
  title: string
  ownerName: string
  nodeCount: number
  publicVisible: boolean
  status: PublishStatus
  createdAt: string
}

export interface AdminNotice {
  id: number
  title: string
  content: string
  status: PublishStatus
  createdAt: string
}

export interface AdminCategory {
  id: number
  name: string
  scope: CategoryScope
  sortOrder: number
  status: PublishStatus
}

export type OrderKind = 'membership' | 'points'
export type OrderStatus = 'pending' | 'paid' | 'closed' | 'refunded'
export type PointAdjustType = 'add' | 'deduct'

export interface AdminMembershipPlan {
  id: number
  name: string
  featured: boolean
  monthlyOrigin: number
  monthlyPrice: number
  monthlyPoints: number
  addOnPoints: number
  addOnPrice: number
  concurrent: number
  storage: string
  sortOrder: number
  status: PublishStatus
}

export interface AdminPointsPack {
  id: number
  points: number
  days: number
  origin: number
  memberPrice: number
  featured: boolean
  sortOrder: number
  status: PublishStatus
}

export interface AdminPromoConfig {
  title: string
  subtitle: string
  endsAt: string
  yearRate: number
  quarterRate: number
  monthRate: number
  yearOffLabel: string
  quarterOffLabel: string
  teamSeatMin: number
  teamSeatMax: number
  teamSeatRate: number
  enabled: boolean
  bannerEnabled: boolean
  bannerLink: string
}

export interface AdminOrder {
  id: number
  no: string
  kind: OrderKind
  userId: number
  userName: string
  title: string
  price: number
  origin: number
  status: OrderStatus
  createdAt: string
}

export interface AdminWallet {
  userId: number
  userName: string
  mobile: string
  planName: string
  expireAt: string
  points: number
}

export interface AdminPointLog {
  id: number
  userId: number
  type: PointAdjustType
  amount: number
  reason: string
  createdAt: string
  operator: string
}
