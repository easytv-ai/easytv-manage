import type { AlipaySettings, InvoiceSettings, LoginSettings, OauthAppSettings, OidcSettings, SiteSettings, SmsSettings, WechatPaySettings } from '~/types/easytv-admin'
import { isApiSuccess } from '~/utils/admin-user'

function pickStr(map: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    const value = map[key]
    if (value != null && String(value) !== '')
      return String(value)
  }
  return ''
}

function pickBool(map: Record<string, any>, ...keys: string[]): boolean {
  return pickBoolDefault(map, false, ...keys)
}

function pickBoolDefault(map: Record<string, any>, fallback: boolean, ...keys: string[]): boolean {
  for (const key of keys) {
    if (map[key] === undefined)
      continue
    const value = map[key]
    return value === true || value === 'true' || value === 1 || value === '1'
  }
  return fallback
}

/** 缺省 / 空值视为开启（与 Director3DEnabled、AlipayIsProduction 后端语义一致） */
function pickBoolDefaultOn(map: Record<string, any>, ...keys: string[]): boolean {
  for (const key of keys) {
    if (map[key] === undefined)
      continue
    const value = map[key]
    if (value === '' || value == null)
      return true
    return value !== false && value !== 'false' && value !== 0 && value !== '0'
  }
  return true
}

function parseMaybeJson(value: unknown): any {
  if (value && typeof value === 'object')
    return value
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
    return null
  try {
    return JSON.parse(trimmed)
  }
  catch {
    return null
  }
}

function isMaskedSecret(value: string) {
  const trimmed = value.trim()
  return !trimmed || /^\*+$/.test(trimmed)
}

export function secretSnapshot(raw: string, enabled = false) {
  const trimmed = raw.trim()
  if (trimmed && !isMaskedSecret(trimmed))
    return trimmed
  if (trimmed || enabled)
    return '__set__'
  return ''
}

export function toSettingValue(value: unknown) {
  if (typeof value === 'boolean')
    return value ? 'true' : 'false'
  if (value == null)
    return ''
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

export function parseSettingMap(raw: any): Record<string, any> | null {
  if (!isApiSuccess(raw))
    return null

  let payload = raw?.data ?? raw?.items ?? raw?.settings ?? raw
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const inner = payload.data ?? payload.items ?? payload.settings
    if (Array.isArray(inner) || (inner && typeof inner === 'object'))
      payload = inner
  }

  if (Array.isArray(payload)) {
    const map: Record<string, any> = {}
    for (const item of payload) {
      if (!item || typeof item !== 'object')
        continue
      const key = item.key ?? item.Key ?? item.name
      if (typeof key === 'string' && key)
        map[key] = item.value ?? item.Value ?? ''
    }
    return map
  }

  if (payload && typeof payload === 'object') {
    const map: Record<string, any> = { ...payload }
    delete map.success
    delete map.message
    delete map.code
    delete map.statusCode
    return map
  }

  return {}
}

function mapOauth(
  map: Record<string, any>,
  objectKey: string,
  enabledKeys: string[],
  idKeys: string[],
  secretKeys: string[],
): OauthAppSettings {
  const obj = parseMaybeJson(map[objectKey]) ?? {}
  return {
    enabled: pickBool(map, ...enabledKeys) || Boolean(obj.enabled),
    clientId: pickStr(map, ...idKeys) || String(obj.clientId ?? obj.client_id ?? obj.appId ?? obj.app_id ?? ''),
    clientSecret: pickStr(map, ...secretKeys) || String(obj.clientSecret ?? obj.client_secret ?? obj.appSecret ?? obj.app_secret ?? ''),
  }
}

function mapWechatOauth(map: Record<string, any>): OauthAppSettings {
  const obj = parseMaybeJson(map.wechat_oauth) ?? parseMaybeJson(map.wechat) ?? {}
  return {
    enabled: pickBool(map, 'WechatOAuthEnabled', 'WeChatAuthEnabled', 'wechat_oauth.enabled', 'wechat.enabled')
      || Boolean(obj.enabled),
    clientId: pickStr(map, 'WechatOAuthAppId', 'wechat_oauth.app_id', 'wechat.clientId', 'wechat.client_id')
      || String(obj.appId ?? obj.app_id ?? obj.clientId ?? ''),
    clientSecret: pickStr(map, 'WechatOAuthAppSecret', 'wechat_oauth.app_secret', 'wechat.clientSecret', 'wechat.client_secret')
      || String(obj.appSecret ?? obj.app_secret ?? obj.clientSecret ?? ''),
    scope: pickStr(map, 'WechatOAuthScope', 'wechat_oauth.scope') || String(obj.scope ?? '') || 'snsapi_login',
    redirectUri: pickStr(map, 'WechatOAuthRedirectUri', 'wechat_oauth.redirect_uri')
      || String(obj.redirectUri ?? obj.redirect_uri ?? ''),
  }
}

export function defaultLoginSettings(): LoginSettings {
  return {
    PasswordLoginEnabled: true,
    PasswordRegisterEnabled: true,
    EmailVerificationEnabled: false,
    RegisterEnabled: true,
    TurnstileCheckEnabled: false,
    GitHubOAuthEnabled: false,
    'discord.enabled': false,
    LinuxDOOAuthEnabled: false,
    WechatOAuthEnabled: false,
    TelegramOAuthEnabled: false,
    'oidc.enabled': false,
  }
}

export function mapToLoginSettings(map: Record<string, any>, settings: SiteSettings): LoginSettings {
  return {
    PasswordLoginEnabled: pickBoolDefault(map, true, 'PasswordLoginEnabled'),
    PasswordRegisterEnabled: pickBoolDefault(map, true, 'PasswordRegisterEnabled'),
    EmailVerificationEnabled: pickBoolDefault(map, false, 'EmailVerificationEnabled'),
    RegisterEnabled: pickBoolDefault(map, true, 'RegisterEnabled'),
    TurnstileCheckEnabled: pickBoolDefault(map, false, 'TurnstileCheckEnabled'),
    GitHubOAuthEnabled: pickBoolDefault(map, settings.github.enabled, 'GitHubOAuthEnabled', 'github.enabled'),
    'discord.enabled': pickBoolDefault(map, settings.discord.enabled, 'discord.enabled'),
    LinuxDOOAuthEnabled: pickBoolDefault(map, false, 'LinuxDOOAuthEnabled'),
    WechatOAuthEnabled: pickBoolDefault(map, settings.wechat.enabled, 'WechatOAuthEnabled', 'WeChatAuthEnabled', 'wechat_oauth.enabled', 'wechat.enabled'),
    TelegramOAuthEnabled: pickBoolDefault(map, false, 'TelegramOAuthEnabled'),
    'oidc.enabled': pickBoolDefault(map, settings.oidc.enabled, 'oidc.enabled'),
  }
}

export function mapToSiteSettings(map: Record<string, any>): SiteSettings {
  const oidcObj = parseMaybeJson(map.oidc) ?? {}
  return {
    siteName: pickStr(map, 'siteName', 'SystemName', 'site_name'),
    siteUrl: pickStr(map, 'siteUrl', 'ServerAddress', 'site_url'),
    logo: pickStr(map, 'logo', 'Logo'),
    notice: pickStr(map, 'notice', 'Notice'),
    footer: pickStr(map, 'footer', 'Footer'),
    about: pickStr(map, 'about', 'About'),
    homePageContent: pickStr(map, 'homePageContent', 'HomePageContent', 'home_page_content'),
    userAgreement: pickStr(map, 'userAgreement', 'UserAgreement', 'user_agreement'),
    privacyPolicy: pickStr(map, 'privacyPolicy', 'PrivacyPolicy', 'privacy_policy'),
    wechat: mapWechatOauth(map),
    oidc: {
      enabled: pickBool(map, 'oidc.enabled') || Boolean(oidcObj.enabled),
      wellKnown: pickStr(map, 'oidc.wellKnown', 'oidc.well_known') || String(oidcObj.wellKnown ?? oidcObj.well_known ?? ''),
      clientId: pickStr(map, 'oidc.clientId', 'oidc.client_id') || String(oidcObj.clientId ?? oidcObj.client_id ?? ''),
      clientSecret: pickStr(map, 'oidc.clientSecret', 'oidc.client_secret') || String(oidcObj.clientSecret ?? oidcObj.client_secret ?? ''),
      authorizationEndpoint: pickStr(map, 'oidc.authorizationEndpoint', 'oidc.authorization_endpoint')
        || String(oidcObj.authorizationEndpoint ?? oidcObj.authorization_endpoint ?? ''),
      tokenEndpoint: pickStr(map, 'oidc.tokenEndpoint', 'oidc.token_endpoint')
        || String(oidcObj.tokenEndpoint ?? oidcObj.token_endpoint ?? ''),
      userinfoEndpoint: pickStr(map, 'oidc.userinfoEndpoint', 'oidc.user_info_endpoint', 'oidc.userinfoEndpoint')
        || String(oidcObj.userinfoEndpoint ?? oidcObj.user_info_endpoint ?? ''),
    },
    github: mapOauth(
      map,
      'github',
      ['github.enabled', 'GitHubOAuthEnabled'],
      ['GitHubOAuthClientId', 'github.clientId', 'github.client_id', 'GitHubClientId'],
      ['GitHubOAuthClientSecret', 'github.clientSecret', 'github.client_secret', 'GitHubClientSecret'],
    ),
    discord: mapOauth(
      map,
      'discord',
      ['discord.enabled'],
      ['discord.clientId', 'discord.client_id'],
      ['discord.clientSecret', 'discord.client_secret'],
    ),
  }
}

export function featureSettingEntries(director3dEnabled: boolean) {
  return [
    { key: 'Director3DEnabled', value: director3dEnabled },
  ]
}

export function basicSettingEntries(payload: SiteSettings) {
  return [
    { key: 'ServerAddress', value: payload.siteUrl },
  ]
}

export function loginSettingEntries(login: LoginSettings) {
  return [
    { key: 'PasswordLoginEnabled', value: login.PasswordLoginEnabled },
    { key: 'PasswordRegisterEnabled', value: login.PasswordRegisterEnabled },
    { key: 'EmailVerificationEnabled', value: login.EmailVerificationEnabled },
    { key: 'RegisterEnabled', value: login.RegisterEnabled },
    { key: 'TurnstileCheckEnabled', value: login.TurnstileCheckEnabled },
    { key: 'GitHubOAuthEnabled', value: login.GitHubOAuthEnabled },
    { key: 'discord.enabled', value: login['discord.enabled'] },
    { key: 'LinuxDOOAuthEnabled', value: login.LinuxDOOAuthEnabled },
    { key: 'WechatOAuthEnabled', value: login.WechatOAuthEnabled },
    { key: 'TelegramOAuthEnabled', value: login.TelegramOAuthEnabled },
    { key: 'oidc.enabled', value: login['oidc.enabled'] },
  ]
}

export function oidcSettingEntries(oidc: OidcSettings, includeSecret: boolean) {
  const entries = [
    { key: 'oidc.well_known', value: oidc.wellKnown },
    { key: 'oidc.client_id', value: oidc.clientId },
    { key: 'oidc.authorization_endpoint', value: oidc.authorizationEndpoint },
    { key: 'oidc.token_endpoint', value: oidc.tokenEndpoint },
    { key: 'oidc.user_info_endpoint', value: oidc.userinfoEndpoint },
  ]
  if (includeSecret)
    entries.push({ key: 'oidc.client_secret', value: oidc.clientSecret })
  return entries
}

export function wechatOauthSettingEntries(app: OauthAppSettings, includeSecret: boolean) {
  const entries = [
    { key: 'WechatOAuthEnabled', value: app.enabled },
    { key: 'WechatOAuthAppId', value: app.clientId },
    { key: 'WechatOAuthScope', value: String(app.scope ?? '').trim() || 'snsapi_login' },
    { key: 'WechatOAuthRedirectUri', value: String(app.redirectUri ?? '').trim() },
  ]
  if (includeSecret)
    entries.push({ key: 'WechatOAuthAppSecret', value: app.clientSecret })
  return entries
}

export function oauthSettingEntries(key: 'github' | 'discord', app: OauthAppSettings, includeSecret: boolean) {
  if (key === 'github') {
    const entries = [
      { key: 'GitHubOAuthClientId', value: app.clientId },
    ]
    const redirectUri = String(app.redirectUri ?? '').trim()
    if (redirectUri)
      entries.push({ key: 'GitHubOAuthRedirectUri', value: redirectUri })
    if (includeSecret)
      entries.push({ key: 'GitHubOAuthClientSecret', value: app.clientSecret })
    return entries
  }
  const entries = [{ key: 'discord.client_id', value: app.clientId }]
  if (includeSecret)
    entries.push({ key: 'discord.client_secret', value: app.clientSecret })
  return entries
}

export function wechatPaySettingEntries(pay: WechatPaySettings, includeMchKey: boolean, includeApiV3: boolean) {
  const entries = [
    { key: 'WechatPayEnabled', value: pay.enabled },
    { key: 'WechatPayAppId', value: pay.appId },
    { key: 'WechatPayMchId', value: pay.mchId },
    { key: 'WechatPayMchSerialNo', value: pay.mchSerialNo },
    { key: 'WechatPayNotifyURL', value: pay.notifyUrl },
    { key: 'MinRecharge', value: pay.minRecharge },
  ]
  if (includeMchKey)
    entries.push({ key: 'WechatPayMchPrivateKey', value: pay.mchPrivateKey })
  if (includeApiV3)
    entries.push({ key: 'WechatPayAPIv3Key', value: pay.apiV3Key })
  return entries
}

export function alipaySettingEntries(
  pay: AlipaySettings,
  includePrivateKey: boolean,
  includePublicKey: boolean,
  includeAppCert = false,
  includeRootCert = false,
) {
  const entries = [
    { key: 'AlipayEnabled', value: pay.enabled },
    { key: 'AlipayIsProduction', value: pay.isProduction },
    { key: 'AlipayF2FEnabled', value: pay.f2fEnabled },
    { key: 'AlipayPCWebEnabled', value: pay.pcWebEnabled },
    { key: 'AlipayAppId', value: pay.appId },
    { key: 'AlipayNotifyUrl', value: pay.notifyUrl },
    { key: 'AlipayReturnUrl', value: pay.returnUrl },
  ]
  if (includePrivateKey)
    entries.push({ key: 'AlipayAppPrivateKey', value: pay.appPrivateKey })
  if (includePublicKey)
    entries.push({ key: 'AlipayPublicKey', value: pay.publicKey })
  if (includeAppCert)
    entries.push({ key: 'AlipayAppCertPublicKey', value: pay.appCertPublicKey })
  if (includeRootCert)
    entries.push({ key: 'AlipayRootCert', value: pay.rootCert })
  return entries
}

export function mapToWechatPaySettings(map: Record<string, any>): WechatPaySettings {
  return {
    enabled: pickBool(map, 'WechatPayEnabled'),
    appId: pickStr(map, 'WechatPayAppId'),
    mchId: pickStr(map, 'WechatPayMchId'),
    mchSerialNo: pickStr(map, 'WechatPayMchSerialNo'),
    mchPrivateKey: pickStr(map, 'WechatPayMchPrivateKey'),
    apiV3Key: pickStr(map, 'WechatPayAPIv3Key'),
    notifyUrl: pickStr(map, 'WechatPayNotifyURL'),
    minRecharge: pickStr(map, 'MinRecharge') || '1',
  }
}

export function mapToAlipaySettings(map: Record<string, any>): AlipaySettings {
  return {
    enabled: pickBool(map, 'AlipayEnabled'),
    isProduction: pickBoolDefaultOn(map, 'AlipayIsProduction'),
    f2fEnabled: pickBoolDefaultOn(map, 'AlipayF2FEnabled'),
    pcWebEnabled: pickBool(map, 'AlipayPCWebEnabled'),
    appId: pickStr(map, 'AlipayAppId'),
    appPrivateKey: pickStr(map, 'AlipayAppPrivateKey'),
    publicKey: pickStr(map, 'AlipayPublicKey', 'AlipayAlipayPublicKey'),
    appCertPublicKey: pickStr(map, 'AlipayAppCertPublicKey'),
    rootCert: pickStr(map, 'AlipayRootCert'),
    notifyUrl: pickStr(map, 'AlipayNotifyUrl'),
    returnUrl: pickStr(map, 'AlipayReturnUrl'),
  }
}

export function mapToDirector3DEnabled(map: Record<string, any>): boolean {
  return pickBoolDefaultOn(map, 'Director3DEnabled')
}

/** 审计日志保留天数缺省值（与后端 setting.GetAuditLogRetentionDays 一致；0 = 永久保留） */
export const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180

/** AuditLogRetentionDays：空 / 负数 / 非数字按缺省 180，与后端回退规则一致 */
export function mapToAuditLogRetentionDays(map: Record<string, any>): number {
  const raw = pickStr(map, 'AuditLogRetentionDays').trim()
  if (!raw)
    return DEFAULT_AUDIT_LOG_RETENTION_DAYS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_AUDIT_LOG_RETENTION_DAYS
}

export function auditSettingEntries(retentionDays: number) {
  return [
    { key: 'AuditLogRetentionDays', value: String(retentionDays) },
  ]
}

const DEFAULT_SUBMAIL_URL = 'https://api-v4.mysubmail.com'

export function defaultSmsSettings(): SmsSettings {
  return {
    enabled: false,
    url: DEFAULT_SUBMAIL_URL,
    appId: '',
    appKey: '',
    signType: 'md5',
    smsProject: '',
  }
}

export function mapToSmsSettings(map: Record<string, any>): SmsSettings {
  const signType = pickStr(map, 'SubMailSignType').toLowerCase()
  return {
    enabled: pickBoolDefault(map, false, 'SmsEnabled'),
    url: pickStr(map, 'SubMailUrl') || DEFAULT_SUBMAIL_URL,
    appId: pickStr(map, 'SubMailAppId'),
    appKey: pickStr(map, 'SubMailAppKey'),
    signType: signType === 'sha1' || signType === 'normal' ? signType : 'md5',
    smsProject: pickStr(map, 'SubMailSmsProject'),
  }
}

export function smsSettingEntries(sms: SmsSettings, includeAppKey: boolean) {
  const entries = [
    { key: 'SmsEnabled', value: sms.enabled },
    { key: 'SubMailUrl', value: sms.url },
    { key: 'SubMailAppId', value: sms.appId },
    { key: 'SubMailSignType', value: sms.signType },
    { key: 'SubMailSmsProject', value: sms.smsProject },
  ]
  if (includeAppKey)
    entries.push({ key: 'SubMailAppKey', value: sms.appKey })
  return entries
}

export const DEFAULT_INVOICE_SERVICE_URL = 'https://fapiao-api.easyapi.com'
export const DEFAULT_INVOICE_TAX_RATE = '0.01'
export const DEFAULT_INVOICE_ITEM_NO = '3040203'
export const DEFAULT_INVOICE_ITEM_NAME = '技术服务费'
export const DEFAULT_INVOICE_CATEGORY = '全电电子普通发票'

export function defaultInvoiceSettings(): InvoiceSettings {
  return {
    enabled: false,
    serviceUrl: DEFAULT_INVOICE_SERVICE_URL,
    appKey: '',
    appSecret: '',
    taxRate: DEFAULT_INVOICE_TAX_RATE,
    itemNo: DEFAULT_INVOICE_ITEM_NO,
    itemName: DEFAULT_INVOICE_ITEM_NAME,
    category: DEFAULT_INVOICE_CATEGORY,
  }
}

export function mapToInvoiceSettings(map: Record<string, any>): InvoiceSettings {
  return {
    enabled: pickBoolDefault(map, false, 'InvoiceEnabled'),
    serviceUrl: pickStr(map, 'InvoiceServiceUrl') || DEFAULT_INVOICE_SERVICE_URL,
    appKey: pickStr(map, 'InvoiceAppKey'),
    appSecret: pickStr(map, 'InvoiceAppSecret'),
    taxRate: pickStr(map, 'InvoiceTaxRate') || DEFAULT_INVOICE_TAX_RATE,
    itemNo: pickStr(map, 'InvoiceItemNo') || DEFAULT_INVOICE_ITEM_NO,
    itemName: pickStr(map, 'InvoiceItemName') || DEFAULT_INVOICE_ITEM_NAME,
    category: pickStr(map, 'InvoiceCategory') || DEFAULT_INVOICE_CATEGORY,
  }
}

/** AppKey / AppSecret 为只写密钥：仅在用户本次填写时才提交，留空保持原值 */
export function invoiceSettingEntries(invoice: InvoiceSettings, includeAppKey: boolean, includeAppSecret: boolean) {
  const entries: { key: string, value: unknown }[] = [
    { key: 'InvoiceEnabled', value: invoice.enabled },
    { key: 'InvoiceServiceUrl', value: invoice.serviceUrl },
    { key: 'InvoiceTaxRate', value: invoice.taxRate },
    { key: 'InvoiceItemNo', value: invoice.itemNo },
    { key: 'InvoiceItemName', value: invoice.itemName },
    { key: 'InvoiceCategory', value: invoice.category },
  ]
  if (includeAppKey)
    entries.push({ key: 'InvoiceAppKey', value: invoice.appKey })
  if (includeAppSecret)
    entries.push({ key: 'InvoiceAppSecret', value: invoice.appSecret })
  return entries
}

export function diffSettingEntries(
  current: { key: string, value: unknown }[],
  snapshot: { key: string, value: unknown }[],
) {
  const prev = new Map(snapshot.map(item => [item.key, toSettingValue(item.value)]))
  return current.filter((item) => {
    const next = toSettingValue(item.value)
    if (!prev.has(item.key))
      return true
    return next !== prev.get(item.key)
  })
}
