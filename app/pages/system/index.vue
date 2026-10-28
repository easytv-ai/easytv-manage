<script setup lang="ts">
import type { AlipaySettings, InvoiceSettings, LoginSettings, OauthAppSettings, OidcSettings, SiteSettings, SmsSettings, WechatPaySettings } from '~/types/easytv-admin'
import settingApi from '~/api/setting'
import { isApiSuccess } from '~/utils/admin-user'
import {
  alipaySettingEntries,
  auditSettingEntries,
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_INVOICE_CATEGORY,
  DEFAULT_INVOICE_ITEM_NAME,
  DEFAULT_INVOICE_ITEM_NO,
  DEFAULT_INVOICE_SERVICE_URL,
  DEFAULT_INVOICE_TAX_RATE,
  basicSettingEntries,
  defaultInvoiceSettings,
  defaultLoginSettings,
  defaultSmsSettings,
  diffSettingEntries,
  featureSettingEntries,
  invoiceSettingEntries,
  loginSettingEntries,
  mapToAlipaySettings,
  mapToAuditLogRetentionDays,
  mapToDirector3DEnabled,
  mapToInvoiceSettings,
  mapToLoginSettings,
  mapToSiteSettings,
  mapToSmsSettings,
  mapToWechatPaySettings,
  oauthSettingEntries,
  oidcSettingEntries,
  smsSettingEntries,
  wechatOauthSettingEntries,
  wechatPaySettingEntries,
  parseSettingMap,
  secretSnapshot,
  toSettingValue,
} from '~/utils/admin-setting'
import { OFFICIAL_SITE_URL } from '~/utils/officialSite'

const DEFAULT_LOGO = '/favicon.svg'

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { notify } = useNotifyToast()

useHead({
  title: () => t('system.pageTitle'),
})

definePageMeta({
  layout: 'console',
  middleware: 'super-admin',
})

type SystemTab = 'system' | 'sms' | 'invoice' | 'payment' | 'gateway' | 'growth' | 'media' | 'chat'
type PaymentTab = 'alipay' | 'wechat'
type OauthKey = 'github' | 'discord'
type SaveSection = 'basic' | 'feature' | 'audit' | 'login' | 'sms' | 'invoice' | 'oidc' | 'wechat' | 'github' | 'discord' | 'alipay' | 'wechatPay'

function emptyOauth(): OauthAppSettings {
  return {
    enabled: false,
    clientId: '',
    clientSecret: '',
  }
}

function emptyWechat(): OauthAppSettings {
  return {
    enabled: false,
    clientId: '',
    clientSecret: '',
    scope: 'snsapi_login',
    redirectUri: '',
  }
}

function emptyWechatPay(): WechatPaySettings {
  return {
    enabled: false,
    appId: '',
    mchId: '',
    mchSerialNo: '',
    mchPrivateKey: '',
    apiV3Key: '',
    notifyUrl: '',
    minRecharge: '1',
  }
}

function emptyAlipay(): AlipaySettings {
  return {
    enabled: false,
    isProduction: true,
    f2fEnabled: true,
    pcWebEnabled: false,
    appId: '',
    appPrivateKey: '',
    publicKey: '',
    appCertPublicKey: '',
    rootCert: '',
    notifyUrl: '',
    returnUrl: '',
  }
}

function emptyOidc(): OidcSettings {
  return {
    enabled: false,
    wellKnown: '',
    clientId: '',
    clientSecret: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userinfoEndpoint: '',
  }
}

const form = reactive({
  siteName: '',
  siteUrl: '',
  logo: '',
  notice: '',
  footer: '',
  about: '',
  homePageContent: '',
  userAgreement: '',
  privacyPolicy: '',
  wechat: emptyWechat(),
  oidc: emptyOidc(),
  github: emptyOauth(),
  discord: emptyOauth(),
})

const wechatPayForm = reactive<WechatPaySettings>(emptyWechatPay())
const alipayForm = reactive<AlipaySettings>(emptyAlipay())
const featureForm = reactive({
  director3dEnabled: true,
})
const auditForm = reactive({
  retentionDays: String(DEFAULT_AUDIT_LOG_RETENTION_DAYS),
})

const loginForm = reactive<LoginSettings>(defaultLoginSettings())
const smsForm = reactive<SmsSettings>(defaultSmsSettings())
const invoiceForm = reactive<InvoiceSettings>(defaultInvoiceSettings())

const errors = reactive({
  siteUrl: '',
  wechatClientId: '',
  wechatClientSecret: '',
  wechatRedirectUri: '',
  smsUrl: '',
  smsAppId: '',
  smsAppKey: '',
  smsProject: '',
  invoiceServiceUrl: '',
  invoiceAppKey: '',
  invoiceAppSecret: '',
  invoiceTaxRate: '',
  auditRetentionDays: '',
})

let oidcSecretSnapshot = ''
let smsAppKeySnapshot = ''
/** 发票密钥为只写：后端已配置时回 '********'，这里只记「已配置」状态，留空提交保持原值 */
const invoiceSecretSnapshots = reactive({
  appKey: '',
  appSecret: '',
})
const oauthSecretSnapshots = reactive({
  wechat: '',
  github: '',
  discord: '',
})

let basicSnapshot: { key: string, value: unknown }[] = []
let featureSnapshot: { key: string, value: unknown }[] = []
let auditSnapshot: { key: string, value: unknown }[] = []
let loginSnapshot: { key: string, value: unknown }[] = []
let smsSnapshot: { key: string, value: unknown }[] = []
let invoiceSnapshot: { key: string, value: unknown }[] = []
let oidcSnapshot: { key: string, value: unknown }[] = []
let wechatSnapshot: { key: string, value: unknown }[] = []
let githubSnapshot: { key: string, value: unknown }[] = []
let discordSnapshot: { key: string, value: unknown }[] = []
let alipaySnapshot: { key: string, value: unknown }[] = []
let wechatPaySnapshot: { key: string, value: unknown }[] = []

const paySecretSnapshots = reactive({
  wechatMchKey: '',
  wechatApiV3: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipayAppCert: '',
  alipayRootCert: '',
})

const loading = ref(true)
const saveLoading = reactive({
  basic: false,
  feature: false,
  audit: false,
  login: false,
  sms: false,
  invoice: false,
  oidc: false,
  wechat: false,
  github: false,
  discord: false,
  alipay: false,
  wechatPay: false,
})

const smsSignTypeItems = [
  { label: 'md5', value: 'md5' },
  { label: 'sha1', value: 'sha1' },
  { label: 'normal', value: 'normal' },
]

const loginToggles = computed(() => [
  { key: 'PasswordLoginEnabled' as const, labelKey: 'system.passwordLogin' },
  { key: 'GitHubOAuthEnabled' as const, labelKey: 'system.githubLogin' },
  { key: 'PasswordRegisterEnabled' as const, labelKey: 'system.passwordRegister' },
  { key: 'discord.enabled' as const, labelKey: 'system.discordLogin' },
  { key: 'EmailVerificationEnabled' as const, labelKey: 'system.emailVerify' },
  { key: 'LinuxDOOAuthEnabled' as const, labelKey: 'system.linuxdoLogin' },
  { key: 'RegisterEnabled' as const, labelKey: 'system.registerEnabled' },
  { key: 'WechatOAuthEnabled' as const, labelKey: 'system.wechatLogin' },
  { key: 'TurnstileCheckEnabled' as const, labelKey: 'system.turnstile' },
  { key: 'TelegramOAuthEnabled' as const, labelKey: 'system.telegramLogin' },
  { key: 'oidc.enabled' as const, labelKey: 'system.oidcLogin' },
])

const tab = computed<SystemTab>(() => {
  const raw = String(route.query.tab ?? '')
  if (raw === 'sms' || raw === 'invoice' || raw === 'payment' || raw === 'gateway' || raw === 'growth' || raw === 'media' || raw === 'chat')
    return raw
  return 'system'
})

const paymentTab = ref<PaymentTab>('alipay')

const tabItems = computed(() => [
  { label: t('system.tabSystem'), value: 'system' },
  { label: t('system.tabSms'), value: 'sms' },
  { label: t('system.tabInvoice'), value: 'invoice' },
  { label: t('system.tabPayment'), value: 'payment' },
  { label: t('system.tabGateway'), value: 'gateway' },
  { label: t('system.tabGrowth'), value: 'growth' },
  { label: t('system.tabMedia'), value: 'media' },
  { label: t('system.tabChat'), value: 'chat' },
])

const paymentTabItems = computed(() => [
  { label: t('system.payAlipayTab'), value: 'alipay' },
  { label: t('system.payWechatTab'), value: 'wechat' },
])

function applySettings(map: Record<string, any>) {
  const settings = mapToSiteSettings(map)
  form.siteName = settings.siteName ?? ''
  form.siteUrl = settings.siteUrl ?? ''
  form.logo = settings.logo ?? DEFAULT_LOGO
  form.notice = settings.notice ?? ''
  form.footer = settings.footer ?? ''
  form.about = settings.about ?? ''
  form.homePageContent = settings.homePageContent ?? ''
  form.userAgreement = settings.userAgreement ?? ''
  form.privacyPolicy = settings.privacyPolicy ?? ''
  form.wechat = { ...emptyWechat(), ...settings.wechat, clientSecret: '' }
  form.oidc = { ...emptyOidc(), ...settings.oidc, clientSecret: '' }
  form.github = { ...emptyOauth(), ...settings.github, clientSecret: '' }
  form.discord = { ...emptyOauth(), ...settings.discord, clientSecret: '' }
  Object.assign(loginForm, mapToLoginSettings(map, settings))
  const sms = mapToSmsSettings(map)
  Object.assign(smsForm, { ...sms, appKey: '' })
  smsAppKeySnapshot = secretSnapshot(sms.appKey, sms.enabled) || smsAppKeySnapshot
  const invoice = mapToInvoiceSettings(map)
  Object.assign(invoiceForm, { ...invoice, appKey: '', appSecret: '' })
  invoiceSecretSnapshots.appKey = secretSnapshot(invoice.appKey) || invoiceSecretSnapshots.appKey
  invoiceSecretSnapshots.appSecret = secretSnapshot(invoice.appSecret) || invoiceSecretSnapshots.appSecret
  oidcSecretSnapshot = secretSnapshot(String(settings.oidc?.clientSecret ?? ''), Boolean(settings.oidc?.enabled || settings.oidc?.clientId)) || oidcSecretSnapshot
  oauthSecretSnapshots.wechat = secretSnapshot(String(settings.wechat?.clientSecret ?? ''), Boolean(settings.wechat?.enabled)) || oauthSecretSnapshots.wechat
  oauthSecretSnapshots.github = secretSnapshot(String(settings.github?.clientSecret ?? ''), Boolean(settings.github?.enabled)) || oauthSecretSnapshots.github
  oauthSecretSnapshots.discord = secretSnapshot(String(settings.discord?.clientSecret ?? ''), Boolean(settings.discord?.enabled)) || oauthSecretSnapshots.discord
  const wechatPay = mapToWechatPaySettings(map)
  const alipay = mapToAlipaySettings(map)
  Object.assign(wechatPayForm, { ...wechatPay, mchPrivateKey: '', apiV3Key: '' })
  Object.assign(alipayForm, { ...alipay, appPrivateKey: '', publicKey: '', appCertPublicKey: '', rootCert: '' })
  featureForm.director3dEnabled = mapToDirector3DEnabled(map)
  auditForm.retentionDays = String(mapToAuditLogRetentionDays(map))
  paySecretSnapshots.wechatMchKey = secretSnapshot(wechatPay.mchPrivateKey, wechatPay.enabled) || paySecretSnapshots.wechatMchKey
  paySecretSnapshots.wechatApiV3 = secretSnapshot(wechatPay.apiV3Key, wechatPay.enabled) || paySecretSnapshots.wechatApiV3
  paySecretSnapshots.alipayPrivateKey = secretSnapshot(alipay.appPrivateKey, alipay.enabled) || paySecretSnapshots.alipayPrivateKey
  paySecretSnapshots.alipayPublicKey = secretSnapshot(alipay.publicKey, alipay.enabled) || paySecretSnapshots.alipayPublicKey
  paySecretSnapshots.alipayAppCert = secretSnapshot(alipay.appCertPublicKey, alipay.enabled) || paySecretSnapshots.alipayAppCert
  paySecretSnapshots.alipayRootCert = secretSnapshot(alipay.rootCert, alipay.enabled) || paySecretSnapshots.alipayRootCert
  rememberEntrySnapshots()
}

function rememberEntrySnapshots() {
  basicSnapshot = basicSettingEntries(currentPayload())
  featureSnapshot = featureSettingEntries(featureForm.director3dEnabled)
  auditSnapshot = auditSettingEntries(Number(auditForm.retentionDays))
  loginSnapshot = loginSettingEntries({ ...loginForm })
  smsSnapshot = smsSettingEntries({ ...smsForm, appKey: '' }, false)
  invoiceSnapshot = invoiceSettingEntries({ ...invoiceForm, appKey: '', appSecret: '' }, false, false)
  oidcSnapshot = oidcSettingEntries(form.oidc, false)
  wechatSnapshot = wechatOauthSettingEntries(form.wechat, false)
  githubSnapshot = oauthSettingEntries('github', form.github, false)
  discordSnapshot = oauthSettingEntries('discord', form.discord, false)
  alipaySnapshot = alipaySettingEntries(alipayForm, false, false)
  wechatPaySnapshot = wechatPaySettingEntries(wechatPayForm, false, false)
}

async function refreshSettings(opts?: { silent?: boolean }) {
  if (!import.meta.client)
    return
  if (!opts?.silent)
    loading.value = true
  try {
    const raw = await settingApi.list()
    const map = parseSettingMap(raw)
    if (!map) {
      notify(raw?.message ?? t('system.loadFail'), 'error')
      return
    }
    applySettings(map)
  }
  catch {
    notify(t('system.loadFail'), 'error')
  }
  finally {
    if (!opts?.silent)
      loading.value = false
  }
}

onMounted(() => {
  void refreshSettings()
})

const siteBaseUrl = computed(() => form.siteUrl.trim().replace(/\/$/, '') || OFFICIAL_SITE_URL)

function gotoTab(next: SystemTab) {
  void navigateTo(localePath({
    path: '/system',
    query: { tab: next },
  }))
}

function validateSiteUrl() {
  errors.siteUrl = ''
  const siteUrl = form.siteUrl.trim()
  if (!siteUrl)
    errors.siteUrl = t('system.siteUrlRequired')
  else if (!/^https?:\/\/.+/i.test(siteUrl))
    errors.siteUrl = t('system.siteUrlInvalid')
  return !errors.siteUrl
}

function validateWechat() {
  errors.wechatClientId = ''
  errors.wechatClientSecret = ''
  errors.wechatRedirectUri = ''
  if (!form.wechat.enabled)
    return true
  let ok = true
  if (!form.wechat.clientId.trim()) {
    errors.wechatClientId = t('system.fieldRequired', { field: 'AppId' })
    ok = false
  }
  if (!form.wechat.clientSecret.trim() && !oauthSecretSnapshots.wechat) {
    errors.wechatClientSecret = t('system.fieldRequired', { field: 'AppSecret' })
    ok = false
  }
  const redirectUri = String(form.wechat.redirectUri ?? '').trim()
  if (!redirectUri) {
    errors.wechatRedirectUri = t('system.wechatRedirectRequired')
    ok = false
  }
  else if (!/^https?:\/\/.+/i.test(redirectUri)) {
    errors.wechatRedirectUri = t('system.wechatRedirectInvalid')
    ok = false
  }
  return ok
}

function currentPayload(): SiteSettings {
  return {
    siteName: form.siteName.trim(),
    siteUrl: form.siteUrl.trim().replace(/\/$/, ''),
    logo: form.logo.trim() || DEFAULT_LOGO,
    notice: form.notice.trim(),
    footer: form.footer.trim(),
    about: form.about.trim(),
    homePageContent: form.homePageContent.trim(),
    userAgreement: form.userAgreement.trim(),
    privacyPolicy: form.privacyPolicy.trim(),
    wechat: {
      ...form.wechat,
      clientId: form.wechat.clientId.trim(),
      clientSecret: form.wechat.clientSecret.trim() || oauthSecretSnapshots.wechat,
      scope: String(form.wechat.scope ?? '').trim() || 'snsapi_login',
      redirectUri: String(form.wechat.redirectUri ?? '').trim(),
    },
    oidc: {
      ...form.oidc,
      wellKnown: form.oidc.wellKnown.trim(),
      clientId: form.oidc.clientId.trim(),
      clientSecret: form.oidc.clientSecret.trim() || oidcSecretSnapshot,
      authorizationEndpoint: form.oidc.authorizationEndpoint.trim(),
      tokenEndpoint: form.oidc.tokenEndpoint.trim(),
      userinfoEndpoint: form.oidc.userinfoEndpoint.trim(),
      enabled: loginForm['oidc.enabled'],
    },
    github: {
      ...form.github,
      enabled: loginForm.GitHubOAuthEnabled,
      clientId: form.github.clientId.trim(),
      clientSecret: form.github.clientSecret.trim() || oauthSecretSnapshots.github,
      redirectUri: form.siteUrl.trim()
        ? `${form.siteUrl.trim().replace(/\/$/, '')}/oauth/github`
        : '',
    },
    discord: {
      ...form.discord,
      enabled: loginForm['discord.enabled'],
      clientId: form.discord.clientId.trim(),
      clientSecret: form.discord.clientSecret.trim() || oauthSecretSnapshots.discord,
    },
  }
}

function rememberSecrets(payload: SiteSettings) {
  oidcSecretSnapshot = payload.oidc.clientSecret || oidcSecretSnapshot
  form.oidc.clientSecret = ''
  oauthSecretSnapshots.wechat = payload.wechat.clientSecret || oauthSecretSnapshots.wechat
  oauthSecretSnapshots.github = payload.github.clientSecret || oauthSecretSnapshots.github
  oauthSecretSnapshots.discord = payload.discord.clientSecret || oauthSecretSnapshots.discord
  form.wechat.clientSecret = ''
  form.github.clientSecret = ''
  form.discord.clientSecret = ''
}

async function persist(section: SaveSection, entries: { key: string, value: unknown }[], successMsg?: string) {
  const snapshot = {
    basic: basicSnapshot,
    feature: featureSnapshot,
    audit: auditSnapshot,
    login: loginSnapshot,
    sms: smsSnapshot,
    invoice: invoiceSnapshot,
    oidc: oidcSnapshot,
    wechat: wechatSnapshot,
    github: githubSnapshot,
    discord: discordSnapshot,
    alipay: alipaySnapshot,
    wechatPay: wechatPaySnapshot,
  }[section]
  const changed = diffSettingEntries(entries, snapshot)
  if (!changed.length) {
    notify(t('system.noChange'), 'warning')
    return false
  }

  saveLoading[section] = true
  try {
    for (const item of changed) {
      const res = await settingApi.update(item.key, { value: toSettingValue(item.value) })
      if (!isApiSuccess(res)) {
        notify(res?.message ?? t('system.saveFail'), 'error')
        return false
      }
    }
    notify(successMsg ?? t('system.saveSuccess'))
    return true
  }
  catch {
    notify(t('system.saveFail'), 'error')
    return false
  }
  finally {
    saveLoading[section] = false
  }
}

async function submitSiteUrl() {
  if (!validateSiteUrl())
    return
  const payload = currentPayload()
  const ok = await persist('basic', basicSettingEntries(payload))
  if (ok)
    void refreshSettings({ silent: true })
}

async function submitFeature() {
  const ok = await persist('feature', featureSettingEntries(featureForm.director3dEnabled), t('system.featureSaveOk'))
  if (ok)
    void refreshSettings({ silent: true })
}

/** 保留天数：0（永久保留）到 3650 的整数 */
function validateAudit() {
  const raw = auditForm.retentionDays.trim()
  const n = Number(raw)
  errors.auditRetentionDays = raw !== '' && Number.isInteger(n) && n >= 0 && n <= 3650
    ? ''
    : t('system.auditRetentionInvalid')
  return !errors.auditRetentionDays
}

async function submitAudit() {
  if (!validateAudit())
    return
  const ok = await persist('audit', auditSettingEntries(Number(auditForm.retentionDays.trim())), t('system.auditSaveOk'))
  if (ok)
    void refreshSettings({ silent: true })
}

async function submitLogin() {
  const ok = await persist('login', loginSettingEntries(loginForm), t('system.loginSaveOk'))
  if (ok)
    void refreshSettings({ silent: true })
}

function currentSms(): SmsSettings {
  return {
    enabled: smsForm.enabled,
    url: smsForm.url.trim() || 'https://api-v4.mysubmail.com',
    appId: smsForm.appId.trim(),
    appKey: smsForm.appKey.trim() || smsAppKeySnapshot,
    signType: smsForm.signType || 'md5',
    smsProject: smsForm.smsProject.trim(),
  }
}

function validateSms() {
  errors.smsUrl = ''
  errors.smsAppId = ''
  errors.smsAppKey = ''
  errors.smsProject = ''
  const url = smsForm.url.trim()
  if (url && !/^https?:\/\/.+/i.test(url))
    errors.smsUrl = t('system.smsUrlInvalid')
  if (!smsForm.enabled)
    return !errors.smsUrl
  if (!smsForm.appId.trim())
    errors.smsAppId = t('system.fieldRequired', { field: t('system.smsAppId') })
  if (!smsForm.appKey.trim() && !smsAppKeySnapshot)
    errors.smsAppKey = t('system.fieldRequired', { field: t('system.smsAppKey') })
  if (!smsForm.smsProject.trim())
    errors.smsProject = t('system.fieldRequired', { field: t('system.smsProject') })
  return !errors.smsUrl && !errors.smsAppId && !errors.smsAppKey && !errors.smsProject
}

async function submitSms() {
  if (!validateSms())
    return
  const payload = currentSms()
  const ok = await persist(
    'sms',
    smsSettingEntries(payload, Boolean(smsForm.appKey.trim())),
    t('system.smsSaveOk'),
  )
  if (ok) {
    smsAppKeySnapshot = payload.appKey || smsAppKeySnapshot
    smsForm.appKey = ''
    void refreshSettings({ silent: true })
  }
}

function currentInvoice(): InvoiceSettings {
  return {
    enabled: invoiceForm.enabled,
    serviceUrl: invoiceForm.serviceUrl.trim().replace(/\/$/, '') || DEFAULT_INVOICE_SERVICE_URL,
    appKey: invoiceForm.appKey.trim(),
    appSecret: invoiceForm.appSecret.trim(),
    taxRate: invoiceForm.taxRate.trim() || DEFAULT_INVOICE_TAX_RATE,
    itemNo: invoiceForm.itemNo.trim() || DEFAULT_INVOICE_ITEM_NO,
    itemName: invoiceForm.itemName.trim() || DEFAULT_INVOICE_ITEM_NAME,
    category: invoiceForm.category.trim() || DEFAULT_INVOICE_CATEGORY,
  }
}

function validateInvoice() {
  errors.invoiceServiceUrl = ''
  errors.invoiceAppKey = ''
  errors.invoiceAppSecret = ''
  errors.invoiceTaxRate = ''
  const url = invoiceForm.serviceUrl.trim()
  if (url && !/^https?:\/\/.+/i.test(url))
    errors.invoiceServiceUrl = t('system.invoiceServiceUrlInvalid')
  const taxRate = invoiceForm.taxRate.trim()
  if (taxRate) {
    const rate = Number(taxRate)
    if (!/^\d+(?:\.\d+)?$/.test(taxRate) || !Number.isFinite(rate) || rate < 0 || rate > 1)
      errors.invoiceTaxRate = t('system.invoiceTaxRateInvalid')
  }
  if (invoiceForm.enabled) {
    if (!invoiceForm.appKey.trim() && !invoiceSecretSnapshots.appKey)
      errors.invoiceAppKey = t('system.fieldRequired', { field: 'App Key' })
    if (!invoiceForm.appSecret.trim() && !invoiceSecretSnapshots.appSecret)
      errors.invoiceAppSecret = t('system.fieldRequired', { field: 'App Secret' })
  }
  return !errors.invoiceServiceUrl && !errors.invoiceTaxRate && !errors.invoiceAppKey && !errors.invoiceAppSecret
}

async function submitInvoice() {
  if (!validateInvoice())
    return
  const payload = currentInvoice()
  const ok = await persist(
    'invoice',
    invoiceSettingEntries(payload, Boolean(payload.appKey), Boolean(payload.appSecret)),
    t('system.invoiceSaveOk'),
  )
  if (ok) {
    if (payload.appKey)
      invoiceSecretSnapshots.appKey = '__set__'
    if (payload.appSecret)
      invoiceSecretSnapshots.appSecret = '__set__'
    invoiceForm.appKey = ''
    invoiceForm.appSecret = ''
    void refreshSettings({ silent: true })
  }
}

async function submitOidc() {
  const payload = currentPayload()
  const ok = await persist('oidc', oidcSettingEntries(payload.oidc, Boolean(form.oidc.clientSecret.trim())))
  if (ok) {
    rememberSecrets(payload)
    void refreshSettings({ silent: true })
  }
}

async function submitWechat() {
  if (!validateWechat())
    return
  const payload = currentPayload()
  const ok = await persist('wechat', wechatOauthSettingEntries(payload.wechat, Boolean(form.wechat.clientSecret.trim())))
  if (ok) {
    rememberSecrets(payload)
    void refreshSettings({ silent: true })
  }
}

async function submitProvider(key: OauthKey) {
  const payload = currentPayload()
  const ok = await persist(key, oauthSettingEntries(key, payload[key], Boolean(form[key].clientSecret.trim())))
  if (ok) {
    rememberSecrets(payload)
    void refreshSettings({ silent: true })
  }
}

function currentWechatPay(): WechatPaySettings {
  return {
    ...wechatPayForm,
    appId: wechatPayForm.appId.trim(),
    mchId: wechatPayForm.mchId.trim(),
    mchSerialNo: wechatPayForm.mchSerialNo.trim(),
    mchPrivateKey: wechatPayForm.mchPrivateKey.trim() || paySecretSnapshots.wechatMchKey,
    apiV3Key: wechatPayForm.apiV3Key.trim() || paySecretSnapshots.wechatApiV3,
    notifyUrl: wechatPayForm.notifyUrl.trim(),
    minRecharge: wechatPayForm.minRecharge.trim() || '1',
  }
}

function currentAlipay(): AlipaySettings {
  return {
    ...alipayForm,
    appId: alipayForm.appId.trim(),
    appPrivateKey: alipayForm.appPrivateKey.trim() || paySecretSnapshots.alipayPrivateKey,
    publicKey: alipayForm.publicKey.trim() || paySecretSnapshots.alipayPublicKey,
    appCertPublicKey: alipayForm.appCertPublicKey.trim() || paySecretSnapshots.alipayAppCert,
    rootCert: alipayForm.rootCert.trim() || paySecretSnapshots.alipayRootCert,
    notifyUrl: alipayForm.notifyUrl.trim(),
    returnUrl: alipayForm.returnUrl.trim(),
  }
}

async function submitWechatPay() {
  const payload = currentWechatPay()
  const ok = await persist(
    'wechatPay',
    wechatPaySettingEntries(payload, Boolean(wechatPayForm.mchPrivateKey.trim()), Boolean(wechatPayForm.apiV3Key.trim())),
    t('system.payWechatSaveOk'),
  )
  if (ok) {
    paySecretSnapshots.wechatMchKey = payload.mchPrivateKey || paySecretSnapshots.wechatMchKey
    paySecretSnapshots.wechatApiV3 = payload.apiV3Key || paySecretSnapshots.wechatApiV3
    wechatPayForm.mchPrivateKey = ''
    wechatPayForm.apiV3Key = ''
    void refreshSettings({ silent: true })
  }
}

async function submitAlipay() {
  const payload = currentAlipay()
  const ok = await persist(
    'alipay',
    alipaySettingEntries(
      payload,
      Boolean(alipayForm.appPrivateKey.trim()),
      Boolean(alipayForm.publicKey.trim()),
      Boolean(alipayForm.appCertPublicKey.trim()),
      Boolean(alipayForm.rootCert.trim()),
    ),
    t('system.payAlipaySaveOk'),
  )
  if (ok) {
    paySecretSnapshots.alipayPrivateKey = payload.appPrivateKey || paySecretSnapshots.alipayPrivateKey
    paySecretSnapshots.alipayPublicKey = payload.publicKey || paySecretSnapshots.alipayPublicKey
    paySecretSnapshots.alipayAppCert = payload.appCertPublicKey || paySecretSnapshots.alipayAppCert
    paySecretSnapshots.alipayRootCert = payload.rootCert || paySecretSnapshots.alipayRootCert
    alipayForm.appPrivateKey = ''
    alipayForm.publicKey = ''
    alipayForm.appCertPublicKey = ''
    alipayForm.rootCert = ''
    void refreshSettings({ silent: true })
  }
}

function toggleLogin(key: keyof LoginSettings) {
  loginForm[key] = !loginForm[key]
}
</script>

<template>
  <div class="w-full">
    <ManagePageHeader
      :page-title="t('system.title')"
      :page-description="t('system.description')"
    />

    <UTabs
      :model-value="tab"
      :items="tabItems"
      variant="link"
      :content="false"
      class="mb-5 w-full"
      :ui="{
        list: 'border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-x-1 gap-y-0 pb-px',
        trigger: 'px-3 py-2 text-sm whitespace-nowrap',
      }"
      @update:model-value="gotoTab($event as SystemTab)"
    />

    <div v-if="tab !== 'gateway' && tab !== 'growth' && tab !== 'media' && tab !== 'chat' && loading" class="flex min-h-72 flex-col items-center justify-center gap-3 text-zinc-500">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
      <span class="text-sm">{{ t('common.loading') }}</span>
    </div>

    <template v-else-if="tab === 'system'">
    <div class="space-y-6">
    <SettingsSectionCard
      :title="t('system.siteAddressTitle')"
      :description="t('system.siteAddressDesc')"
    >
      <UFormField
        :label="t('system.siteUrl')"
        required
        :hint="t('system.siteUrlHelp')"
        :error="errors.siteUrl || undefined"
      >
        <UInput
          v-model="form.siteUrl"
          class="w-full"
          :placeholder="t('system.siteUrlPh')"
        />
      </UFormField>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.basic"
        :disabled="saveLoading.basic"
        @click="submitSiteUrl"
      >
        {{ saveLoading.basic ? t('common.saving') : t('system.saveSiteAddress') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.featureTitle')"
      :description="t('system.featureDesc')"
    >
      <UFormField :help="t('system.director3dHelp')">
        <template #label>
          <span class="cursor-pointer" @click="featureForm.director3dEnabled = !featureForm.director3dEnabled">
            {{ t('system.director3d') }}
          </span>
        </template>
        <div class="inline-flex min-h-10 cursor-pointer items-center" @click="featureForm.director3dEnabled = !featureForm.director3dEnabled">
          <USwitch :model-value="featureForm.director3dEnabled" @click.stop @update:model-value="featureForm.director3dEnabled = $event" />
        </div>
      </UFormField>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.feature"
        :disabled="saveLoading.feature"
        @click="submitFeature"
      >
        {{ saveLoading.feature ? t('common.saving') : t('system.featureSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.auditTitle')"
      :description="t('system.auditDesc')"
    >
      <UFormField
        :label="t('system.auditRetentionDays')"
        :help="t('system.auditRetentionHelp')"
        :error="errors.auditRetentionDays || undefined"
      >
        <UInput
          v-model="auditForm.retentionDays"
          type="number"
          min="0"
          max="3650"
          step="1"
          class="w-full sm:w-60"
          :placeholder="String(DEFAULT_AUDIT_LOG_RETENTION_DAYS)"
        />
      </UFormField>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.audit"
        :disabled="saveLoading.audit"
        @click="submitAudit"
      >
        {{ saveLoading.audit ? t('common.saving') : t('system.auditSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.loginTitle')"
      :description="t('system.loginDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField v-for="item in loginToggles" :key="item.key">
          <template #label>
            <span class="cursor-pointer" @click="toggleLogin(item.key)">
              {{ t(item.labelKey) }}
            </span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="toggleLogin(item.key)">
            <USwitch :model-value="loginForm[item.key]" @click.stop @update:model-value="loginForm[item.key] = $event" />
          </div>
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.login"
        :disabled="saveLoading.login"
        @click="submitLogin"
      >
        {{ saveLoading.login ? t('common.saving') : t('system.loginSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.oidcTitle')"
      :description="t('system.oidcDesc')"
    >
      <SettingsOauthCallbackHint
        :base="siteBaseUrl"
        :lines="[t('system.oidcHint', { base: '{base}' })]"
      />
      <p class="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        {{ t('system.oidcDiscoveryHint') }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('system.oidcWellKnown')">
          <UInput
            v-model="form.oidc.wellKnown"
            class="w-full"
            :placeholder="t('system.oidcWellKnownPh')"
          />
        </UFormField>
        <UFormField :label="t('system.oidcClientId')">
          <UInput
            v-model="form.oidc.clientId"
            class="w-full"
            :placeholder="t('system.oidcClientIdPh')"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          :label="t('system.oidcClientSecret')"
          class="sm:col-span-2"
        >
          <UInput
            v-model="form.oidc.clientSecret"
            type="password"
            class="w-full"
            :placeholder="t('system.oidcClientSecretPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField :label="t('system.oidcAuthEndpoint')">
          <UInput
            v-model="form.oidc.authorizationEndpoint"
            class="w-full"
            :placeholder="t('system.oidcAuthEndpointPh')"
          />
        </UFormField>
        <UFormField :label="t('system.oidcTokenEndpoint')">
          <UInput
            v-model="form.oidc.tokenEndpoint"
            class="w-full"
            :placeholder="t('system.oidcTokenEndpointPh')"
          />
        </UFormField>
        <UFormField :label="t('system.oidcUserinfoEndpoint')">
          <UInput
            v-model="form.oidc.userinfoEndpoint"
            class="w-full"
            :placeholder="t('system.oidcUserinfoEndpointPh')"
          />
        </UFormField>
      </div>
      <UButton type="button" :loading="saveLoading.oidc" :disabled="saveLoading.oidc" @click="submitOidc">
        {{ saveLoading.oidc ? t('common.saving') : t('system.saveOidc') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.githubTitle')"
      :description="t('system.githubDesc')"
    >
      <SettingsOauthCallbackHint
        :base="siteBaseUrl"
        :lines="[t('system.githubHint', { base: '{base}' })]"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('system.githubClientId')">
          <UInput
            v-model="form.github.clientId"
            class="w-full"
            :placeholder="t('system.githubClientIdPh')"
            autocomplete="off"
          />
        </UFormField>
        <UFormField :label="t('system.githubClientSecret')" class="sm:col-span-2">
          <UInput
            v-model="form.github.clientSecret"
            type="password"
            class="w-full"
            :placeholder="t('system.githubClientSecretPh')"
            autocomplete="new-password"
          />
        </UFormField>
      </div>
      <UButton type="button" :loading="saveLoading.github" :disabled="saveLoading.github" @click="submitProvider('github')">
        {{ saveLoading.github ? t('common.saving') : t('system.githubSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.discordTitle')"
      :description="t('system.discordDesc')"
    >
      <SettingsOauthCallbackHint
        :base="siteBaseUrl"
        :lines="[t('system.discordHint', { base: '{base}' })]"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('system.discordClientId')">
          <UInput
            v-model="form.discord.clientId"
            class="w-full"
            :placeholder="t('system.discordClientIdPh')"
            autocomplete="off"
          />
        </UFormField>
        <UFormField :label="t('system.discordClientSecret')" class="sm:col-span-2">
          <UInput
            v-model="form.discord.clientSecret"
            type="password"
            class="w-full"
            :placeholder="t('system.discordClientSecretPh')"
            autocomplete="new-password"
          />
        </UFormField>
      </div>
      <UButton type="button" :loading="saveLoading.discord" :disabled="saveLoading.discord" @click="submitProvider('discord')">
        {{ saveLoading.discord ? t('common.saving') : t('system.discordSave') }}
      </UButton>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('system.wechatOauthTitle')"
      :description="t('system.wechatOauthDesc')"
    >
      <SettingsOauthCallbackHint
        :base="siteBaseUrl"
        :lines="[t('system.wechatOauthHint', { base: '{base}' })]"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :help="t('system.wechatOauthEnabledHelp')">
          <template #label>
            <span
              class="cursor-pointer"
              @click="form.wechat.enabled = !form.wechat.enabled"
            >
              {{ t('system.wechatOauthEnabled') }}
            </span>
          </template>
          <USwitch v-model="form.wechat.enabled" />
        </UFormField>
        <UFormField
          label="AppId"
          :help="t('system.wechatAppIdHelp')"
          :required="form.wechat.enabled"
          :error="errors.wechatClientId || undefined"
        >
          <UInput
            v-model="form.wechat.clientId"
            class="w-full"
            placeholder="wxxxxxxxxxxxxxxx"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          label="AppSecret"
          class="sm:col-span-2"
          :help="t('system.wechatAppSecretHelp')"
          :required="form.wechat.enabled"
          :error="errors.wechatClientSecret || undefined"
        >
          <UInput
            v-model="form.wechat.clientSecret"
            type="password"
            class="w-full"
            :placeholder="t('system.wechatAppSecretPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField
          :label="t('system.wechatScope')"
          :help="t('system.wechatScopeHelp')"
        >
          <UInput
            v-model="form.wechat.scope"
            class="w-full"
            placeholder="snsapi_login"
          />
        </UFormField>
        <UFormField
          :label="t('system.wechatRedirect')"
          :help="t('system.wechatRedirectHelp')"
          :required="form.wechat.enabled"
          :error="errors.wechatRedirectUri || undefined"
        >
          <UInput
            v-model="form.wechat.redirectUri"
            class="w-full"
            placeholder="https://yourdomain.com/wechat/oauth/callback"
          />
        </UFormField>
      </div>
      <UButton type="button" :loading="saveLoading.wechat" :disabled="saveLoading.wechat" @click="submitWechat">
        {{ saveLoading.wechat ? t('common.saving') : t('system.wechatOauthSave') }}
      </UButton>
    </SettingsSectionCard>
    </div>
    </template>

    <template v-else-if="tab === 'sms'">
    <div class="space-y-6">
    <SettingsSectionCard
      :title="t('system.smsTitle')"
      :description="t('system.smsDesc')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :help="t('system.smsEnabledHelp')">
          <template #label>
            <span class="cursor-pointer" @click="smsForm.enabled = !smsForm.enabled">
              {{ t('system.smsEnabled') }}
            </span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="smsForm.enabled = !smsForm.enabled">
            <USwitch :model-value="smsForm.enabled" @click.stop @update:model-value="smsForm.enabled = $event" />
          </div>
        </UFormField>
        <UFormField
          :label="t('system.smsUrl')"
          :help="t('system.smsUrlHelp')"
          :error="errors.smsUrl || undefined"
        >
          <UInput
            v-model="smsForm.url"
            class="w-full"
            :placeholder="t('system.smsUrlPh')"
          />
        </UFormField>
        <UFormField
          :label="t('system.smsAppId')"
          :help="t('system.smsAppIdHelp')"
          :required="smsForm.enabled"
          :error="errors.smsAppId || undefined"
        >
          <UInput
            v-model="smsForm.appId"
            class="w-full"
            :placeholder="t('system.smsAppIdPh')"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          :label="t('system.smsAppKey')"
          :help="t('system.smsAppKeyHelp')"
          :required="smsForm.enabled"
          :error="errors.smsAppKey || undefined"
        >
          <UInput
            v-model="smsForm.appKey"
            type="password"
            class="w-full"
            :placeholder="t('system.smsAppKeyPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField
          :label="t('system.smsSignType')"
          :help="t('system.smsSignTypeHelp')"
        >
          <USelect
            v-model="smsForm.signType"
            :items="smsSignTypeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('system.smsProject')"
          :help="t('system.smsProjectHelp')"
          :required="smsForm.enabled"
          :error="errors.smsProject || undefined"
        >
          <UInput
            v-model="smsForm.smsProject"
            class="w-full"
            :placeholder="t('system.smsProjectPh')"
            autocomplete="off"
          />
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.sms"
        :disabled="saveLoading.sms"
        @click="submitSms"
      >
        {{ saveLoading.sms ? t('common.saving') : t('system.smsSave') }}
      </UButton>
    </SettingsSectionCard>
    </div>
    </template>

    <template v-else-if="tab === 'invoice'">
    <div class="space-y-6">
    <SettingsSectionCard
      :title="t('system.invoiceTitle')"
      :description="t('system.invoiceDesc')"
    >
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        class="mb-4"
        :description="t('system.invoiceQuotaHint')"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :help="t('system.invoiceEnabledHelp')">
          <template #label>
            <span class="cursor-pointer" @click="invoiceForm.enabled = !invoiceForm.enabled">
              {{ t('system.invoiceEnabled') }}
            </span>
          </template>
          <div class="inline-flex min-h-10 cursor-pointer items-center" @click="invoiceForm.enabled = !invoiceForm.enabled">
            <USwitch :model-value="invoiceForm.enabled" @click.stop @update:model-value="invoiceForm.enabled = $event" />
          </div>
        </UFormField>
        <UFormField
          :label="t('system.invoiceServiceUrl')"
          :help="t('system.invoiceServiceUrlHelp')"
          :error="errors.invoiceServiceUrl || undefined"
        >
          <UInput
            v-model="invoiceForm.serviceUrl"
            class="w-full"
            :placeholder="DEFAULT_INVOICE_SERVICE_URL"
          />
        </UFormField>
        <UFormField
          label="App Key"
          :help="t('system.invoiceAppKeyHelp')"
          :required="invoiceForm.enabled && !invoiceSecretSnapshots.appKey"
          :error="errors.invoiceAppKey || undefined"
        >
          <UInput
            v-model="invoiceForm.appKey"
            class="w-full"
            :placeholder="invoiceSecretSnapshots.appKey ? t('system.invoiceSecretConfiguredPh') : t('system.invoiceAppKeyPh')"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          label="App Secret"
          :help="t('system.invoiceAppSecretHelp')"
          :required="invoiceForm.enabled && !invoiceSecretSnapshots.appSecret"
          :error="errors.invoiceAppSecret || undefined"
        >
          <UInput
            v-model="invoiceForm.appSecret"
            type="password"
            class="w-full"
            :placeholder="invoiceSecretSnapshots.appSecret ? t('system.invoiceSecretConfiguredPh') : t('system.invoiceAppSecretPh')"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField
          :label="t('system.invoiceTaxRate')"
          :help="t('system.invoiceTaxRateHelp')"
          :error="errors.invoiceTaxRate || undefined"
        >
          <UInput
            v-model="invoiceForm.taxRate"
            class="w-full"
            :placeholder="DEFAULT_INVOICE_TAX_RATE"
            inputmode="decimal"
          />
        </UFormField>
        <UFormField
          :label="t('system.invoiceItemNo')"
          :help="t('system.invoiceItemNoHelp')"
        >
          <UInput
            v-model="invoiceForm.itemNo"
            class="w-full"
            :placeholder="DEFAULT_INVOICE_ITEM_NO"
          />
        </UFormField>
        <UFormField
          :label="t('system.invoiceItemName')"
          :help="t('system.invoiceItemNameHelp')"
        >
          <UInput
            v-model="invoiceForm.itemName"
            class="w-full"
            :placeholder="DEFAULT_INVOICE_ITEM_NAME"
          />
        </UFormField>
        <UFormField
          :label="t('system.invoiceCategory')"
          :help="t('system.invoiceCategoryHelp')"
        >
          <UInput
            v-model="invoiceForm.category"
            class="w-full"
            :placeholder="DEFAULT_INVOICE_CATEGORY"
          />
        </UFormField>
      </div>
      <UButton
        type="button"
        class="mt-4"
        :loading="saveLoading.invoice"
        :disabled="saveLoading.invoice"
        @click="submitInvoice"
      >
        {{ saveLoading.invoice ? t('common.saving') : t('system.invoiceSave') }}
      </UButton>
    </SettingsSectionCard>
    </div>
    </template>

    <template v-else-if="tab === 'payment'">
    <div class="space-y-6">
      <UTabs
        v-model="paymentTab"
        :items="paymentTabItems"
        variant="link"
        class="w-full"
        :content="false"
        :ui="{
          list: 'border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-x-1 gap-y-0 pb-px',
          trigger: 'px-3 py-2 text-sm whitespace-nowrap',
        }"
      />

      <SettingsSectionCard
        v-if="paymentTab === 'alipay'"
        :title="t('system.payAlipayTitle')"
        :description="t('system.payAlipayDesc')"
      >
        <SettingsOauthCallbackHint
          :base="siteBaseUrl"
          :lines="[t('system.payAlipayHint', { base: '{base}' })]"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :help="t('system.payAlipayEnabledHelp')">
            <template #label>
              <span class="cursor-pointer" @click="alipayForm.enabled = !alipayForm.enabled">
                {{ t('system.payAlipayEnabled') }}
              </span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="alipayForm.enabled = !alipayForm.enabled">
              <USwitch :model-value="alipayForm.enabled" @click.stop @update:model-value="alipayForm.enabled = $event" />
            </div>
          </UFormField>
          <UFormField :help="t('system.payAlipayProductionHelp')">
            <template #label>
              <span class="cursor-pointer" @click="alipayForm.isProduction = !alipayForm.isProduction">
                {{ t('system.payAlipayProduction') }}
              </span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="alipayForm.isProduction = !alipayForm.isProduction">
              <USwitch :model-value="alipayForm.isProduction" @click.stop @update:model-value="alipayForm.isProduction = $event" />
            </div>
          </UFormField>
          <UFormField :help="t('system.payAlipayF2fHelp')">
            <template #label>
              <span class="cursor-pointer" @click="alipayForm.f2fEnabled = !alipayForm.f2fEnabled">
                {{ t('system.payAlipayF2f') }}
              </span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="alipayForm.f2fEnabled = !alipayForm.f2fEnabled">
              <USwitch :model-value="alipayForm.f2fEnabled" @click.stop @update:model-value="alipayForm.f2fEnabled = $event" />
            </div>
          </UFormField>
          <UFormField :help="t('system.payAlipayPcHelp')">
            <template #label>
              <span class="cursor-pointer" @click="alipayForm.pcWebEnabled = !alipayForm.pcWebEnabled">
                {{ t('system.payAlipayPc') }}
              </span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="alipayForm.pcWebEnabled = !alipayForm.pcWebEnabled">
              <USwitch :model-value="alipayForm.pcWebEnabled" @click.stop @update:model-value="alipayForm.pcWebEnabled = $event" />
            </div>
          </UFormField>
          <UFormField :label="t('system.payAlipayAppId')" :help="t('system.payAlipayAppIdHelp')">
            <UInput v-model="alipayForm.appId" class="w-full" placeholder="2021xxxxxxxxxxxx" autocomplete="off" />
          </UFormField>
          <UFormField :label="t('system.payAlipayPrivateKey')" class="sm:col-span-2" :help="t('system.payAlipayPrivateKeyHelp')">
            <UTextarea
              v-model="alipayForm.appPrivateKey"
              class="w-full font-mono text-sm"
              :rows="4"
              :placeholder="t('system.paySecretPh')"
            />
          </UFormField>
          <UFormField :label="t('system.payAlipayPublicKey')" class="sm:col-span-2" :help="t('system.payAlipayPublicKeyHelp')">
            <UTextarea
              v-model="alipayForm.publicKey"
              class="w-full font-mono text-sm"
              :rows="4"
              :placeholder="t('system.paySecretPh')"
            />
          </UFormField>
          <UFormField :label="t('system.payAlipayAppCert')" class="sm:col-span-2" :help="t('system.payAlipayAppCertHelp')">
            <UTextarea
              v-model="alipayForm.appCertPublicKey"
              class="w-full font-mono text-sm"
              :rows="4"
              :placeholder="t('system.paySecretPh')"
            />
          </UFormField>
          <UFormField :label="t('system.payAlipayRootCert')" class="sm:col-span-2" :help="t('system.payAlipayRootCertHelp')">
            <UTextarea
              v-model="alipayForm.rootCert"
              class="w-full font-mono text-sm"
              :rows="4"
              :placeholder="t('system.paySecretPh')"
            />
          </UFormField>
          <UFormField :label="t('system.payAlipayNotifyUrl')" class="sm:col-span-2" :help="t('system.payAlipayNotifyUrlHelp')">
            <UInput v-model="alipayForm.notifyUrl" class="w-full" placeholder="https://yourdomain.com/alipay/webhook" />
          </UFormField>
          <UFormField :label="t('system.payAlipayReturnUrl')" class="sm:col-span-2" :help="t('system.payAlipayReturnUrlHelp')">
            <UInput v-model="alipayForm.returnUrl" class="w-full" placeholder="https://yourdomain.com/console/recharge" />
          </UFormField>
        </div>
        <UButton type="button" :loading="saveLoading.alipay" :disabled="saveLoading.alipay" @click="submitAlipay">
          {{ saveLoading.alipay ? t('common.saving') : t('system.payAlipaySave') }}
        </UButton>
      </SettingsSectionCard>

      <SettingsSectionCard
        v-else
        :title="t('system.payWechatTitle')"
        :description="t('system.payWechatDesc')"
      >
        <SettingsOauthCallbackHint
          :base="siteBaseUrl"
          :lines="[t('system.payWechatHint', { base: '{base}' })]"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :help="t('system.payWechatEnabledHelp')">
            <template #label>
              <span class="cursor-pointer" @click="wechatPayForm.enabled = !wechatPayForm.enabled">
                {{ t('system.payWechatEnabled') }}
              </span>
            </template>
            <div class="inline-flex min-h-10 cursor-pointer items-center" @click="wechatPayForm.enabled = !wechatPayForm.enabled">
              <USwitch :model-value="wechatPayForm.enabled" @click.stop @update:model-value="wechatPayForm.enabled = $event" />
            </div>
          </UFormField>
          <UFormField :label="t('system.payWechatAppId')" :help="t('system.payWechatAppIdHelp')">
            <UInput v-model="wechatPayForm.appId" class="w-full" placeholder="wxxxxxxxxxxxxxxx" autocomplete="off" />
          </UFormField>
          <UFormField :label="t('system.payMchId')" :help="t('system.payMchIdHelp')">
            <UInput v-model="wechatPayForm.mchId" class="w-full" placeholder="1234567890" autocomplete="off" />
          </UFormField>
          <UFormField :label="t('system.payMchSerialNo')" :help="t('system.payMchSerialNoHelp')">
            <UInput v-model="wechatPayForm.mchSerialNo" class="w-full" placeholder="xxxxxxxxxxxxxxxx" autocomplete="off" />
          </UFormField>
          <UFormField :label="t('system.payMchPrivateKey')" class="sm:col-span-2" :help="t('system.payMchPrivateKeyHelp')">
            <UTextarea
              v-model="wechatPayForm.mchPrivateKey"
              class="w-full font-mono text-sm"
              :rows="4"
              :placeholder="t('system.paySecretPh')"
            />
          </UFormField>
          <UFormField :label="t('system.payApiV3Key')" class="sm:col-span-2" :help="t('system.payApiV3Help')">
            <UInput
              v-model="wechatPayForm.apiV3Key"
              type="password"
              class="w-full"
              :placeholder="t('system.paySecretPh')"
              autocomplete="new-password"
            />
          </UFormField>
          <UFormField :label="t('system.payWechatNotifyUrl')" class="sm:col-span-2" :help="t('system.payWechatNotifyUrlHelp')">
            <UInput v-model="wechatPayForm.notifyUrl" class="w-full" placeholder="https://yourdomain.com/wechat/webhook" />
          </UFormField>
          <UFormField :label="t('system.payMinRecharge')" :help="t('system.payMinRechargeHelp')">
            <UInput v-model="wechatPayForm.minRecharge" type="number" min="0" step="0.01" class="w-full" placeholder="1" />
          </UFormField>
        </div>
        <UButton type="button" :loading="saveLoading.wechatPay" :disabled="saveLoading.wechatPay" @click="submitWechatPay">
          {{ saveLoading.wechatPay ? t('common.saving') : t('system.payWechatSave') }}
        </UButton>
      </SettingsSectionCard>
    </div>
    </template>

    <SystemGrowthPanel v-else-if="tab === 'growth'" />
    <SystemMediaPanel v-else-if="tab === 'media'" />
    <SystemChatPanel v-else-if="tab === 'chat'" />
    <SystemGatewayPanel v-else />
  </div>
</template>
