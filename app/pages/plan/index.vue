<script setup lang="ts">
import type { AdminMembershipPlan, AdminPointsPack, AdminPromoConfig } from '~/types/easytv-admin'
import { formatValidity, pointsDayItems, toPositiveInt, toPositiveNumber } from '~/utils/pricing-admin'
import { adminPackApi, adminPlanApi, adminPromoApi, type PromoPayload } from '~/api/billing'
import { isOk } from '~/api/creative'

const { t } = useI18n()
useHead({ title: () => t('plan.pageTitle') })
definePageMeta({ layout: 'console' })

const { notify } = useNotifyToast()

const { loading, listReady, beginListLoad, markListReady } = useListReadyState()
const tab = ref<'membership' | 'points' | 'promo'>('membership')

const membershipPlans = ref<AdminMembershipPlan[]>([])
const pointsPacks = ref<AdminPointsPack[]>([])

const planOpen = ref(false)
const editingPlan = ref<AdminMembershipPlan | null>(null)
const planForm = reactive({
  name: '',
  monthlyOrigin: '',
  monthlyPrice: '',
  monthlyPoints: '',
  addOnPoints: '',
  addOnPrice: '',
  concurrent: '',
  storage: '',
  featured: false,
  sortOrder: '0',
})
const planErrors = reactive({
  name: '',
  monthlyOrigin: '',
  monthlyPrice: '',
  monthlyPoints: '',
  addOnPoints: '',
  addOnPrice: '',
  concurrent: '',
  storage: '',
})
const planSaving = ref(false)

const packOpen = ref(false)
const editingPack = ref<AdminPointsPack | null>(null)
const packForm = reactive({
  points: '',
  days: '30',
  origin: '',
  memberPrice: '',
  featured: false,
  sortOrder: '0',
})
const packErrors = reactive({ points: '', origin: '', memberPrice: '' })
const packSaving = ref(false)

const promoForm = reactive<AdminPromoConfig>({
  title: '',
  subtitle: '',
  endsAt: '',
  yearRate: 0.62,
  quarterRate: 0.85,
  monthRate: 1,
  yearOffLabel: t('plan.defaultYearOff'),
  quarterOffLabel: t('plan.defaultQuarterOff'),
  teamSeatMin: 2,
  teamSeatMax: 10,
  teamSeatRate: 0.9,
  enabled: true,
  bannerEnabled: false,
  bannerLink: '/pricing',
})
const promoErrors = reactive({ title: '', endsAt: '', yearRate: '', quarterRate: '', monthRate: '', teamSeatMin: '', teamSeatMax: '' })
const promoSaving = ref(false)

const confirmOpen = ref(false)
const confirmKind = ref<'plan-status' | 'plan-delete' | 'pack-status' | 'pack-delete'>('plan-status')
const confirmPlan = ref<AdminMembershipPlan | null>(null)
const confirmPack = ref<AdminPointsPack | null>(null)
const confirming = ref(false)

const planRows = computed(() => [...membershipPlans.value].sort((a, b) => a.sortOrder - b.sortOrder))
const packRows = computed(() => [...pointsPacks.value].sort((a, b) => a.sortOrder - b.sortOrder))

const tabItems = computed(() => [
  { label: t('common.tabMembership'), value: 'membership' },
  { label: t('common.tabPoints'), value: 'points' },
  { label: t('common.tabPromo'), value: 'promo' },
])
const dayItems = computed(() => pointsDayItems(t))

function formatDiscount(price: number, origin: number) {
  if (!origin || price >= origin)
    return ''
  const off = Math.round((price / origin) * 100) / 10
  return t('plan.offSuffix', { n: String(off).replace(/\.0$/, '') })
}

function toPlanRow(item: any): AdminMembershipPlan {
  return {
    id: item.id,
    name: item.name,
    featured: Boolean(item.featured),
    monthlyOrigin: Number(item.monthly_origin) || 0,
    monthlyPrice: Number(item.monthly_price) || 0,
    monthlyPoints: Number(item.monthly_points) || 0,
    addOnPoints: Number(item.add_on_points) || 0,
    addOnPrice: Number(item.add_on_price) || 0,
    concurrent: Number(item.concurrent) || 1,
    storage: `${Number(item.storage_gb) || 0}`,
    sortOrder: Number(item.sort_order) || 0,
    status: item.status === 2 ? 2 : 1,
  }
}

function toPackRow(item: any): AdminPointsPack {
  return {
    id: item.id,
    points: Number(item.points) || 0,
    days: Number(item.valid_days) || 30,
    origin: Number(item.origin) || 0,
    memberPrice: Number(item.member_price) || 0,
    featured: Boolean(item.featured),
    sortOrder: Number(item.sort_order) || 0,
    status: item.status === 2 ? 2 : 1,
  }
}

function tsToLocalInput(ts: number) {
  if (!ts)
    return ''
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToTs(value: string) {
  const t = Date.parse(value)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

function applyPromo(p: any) {
  Object.assign(promoForm, {
    title: p.title ?? '',
    subtitle: p.subtitle ?? '',
    endsAt: tsToLocalInput(Number(p.ends_at) || 0),
    yearRate: Number(p.cycle_rate?.year ?? 1),
    quarterRate: Number(p.cycle_rate?.quarter ?? 1),
    monthRate: Number(p.cycle_rate?.month ?? 1),
    yearOffLabel: p.cycle_off_label?.year ?? '',
    quarterOffLabel: p.cycle_off_label?.quarter ?? '',
    teamSeatMin: Number(p.team_seat_min) || 2,
    teamSeatMax: Number(p.team_seat_max) || 10,
    teamSeatRate: Number(p.team_seat_rate) || 0.9,
    enabled: Boolean(p.enabled),
    bannerEnabled: Boolean(p.banner_enabled),
    bannerLink: String(p.banner_link || '/pricing'),
  })
}

const fetchAll = useClientListFetch(async () => {
  beginListLoad()
  try {
    const [plansRaw, packsRaw, promoRaw] = await Promise.all([adminPlanApi.list(), adminPackApi.list(), adminPromoApi.get()])
    if (isOk(plansRaw))
      membershipPlans.value = (plansRaw.data ?? []).map(toPlanRow)
    else
      notify(plansRaw?.message ?? t('plan.loadPlanFail'), 'error')
    if (isOk(packsRaw))
      pointsPacks.value = (packsRaw.data ?? []).map(toPackRow)
    else
      notify(packsRaw?.message ?? t('plan.loadPackFail'), 'error')
    if (isOk(promoRaw) && promoRaw.data)
      applyPromo(promoRaw.data)
    markListReady()
  }
  finally {
    loading.value = false
  }
})

onMounted(() => void fetchAll())

function slugify(name: string, prefix: string) {
  const ascii = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return ascii || `${prefix}-${Date.now().toString(36)}`
}

function openCreatePlan() {
  editingPlan.value = null
  Object.assign(planForm, {
    name: '',
    monthlyOrigin: '',
    monthlyPrice: '',
    monthlyPoints: '',
    addOnPoints: '',
    addOnPrice: '',
    concurrent: '',
    storage: '',
    featured: false,
    sortOrder: String(membershipPlans.value.length),
  })
  Object.assign(planErrors, { name: '', monthlyOrigin: '', monthlyPrice: '', monthlyPoints: '', addOnPoints: '', addOnPrice: '', concurrent: '', storage: '' })
  planOpen.value = true
}

function openEditPlan(item: AdminMembershipPlan) {
  editingPlan.value = item
  Object.assign(planForm, {
    name: item.name,
    monthlyOrigin: String(item.monthlyOrigin),
    monthlyPrice: String(item.monthlyPrice),
    monthlyPoints: String(item.monthlyPoints),
    addOnPoints: String(item.addOnPoints),
    addOnPrice: String(item.addOnPrice),
    concurrent: String(item.concurrent),
    storage: String(Number(String(item.storage).replace(/[^\d]/g, '')) || 0),
    featured: item.featured,
    sortOrder: String(item.sortOrder),
  })
  Object.assign(planErrors, { name: '', monthlyOrigin: '', monthlyPrice: '', monthlyPoints: '', addOnPoints: '', addOnPrice: '', concurrent: '', storage: '' })
  planOpen.value = true
}

function validatePlan() {
  planErrors.name = planForm.name.trim() ? '' : t('plan.nameRequired')
  planErrors.monthlyOrigin = toPositiveNumber(planForm.monthlyOrigin) ? '' : t('plan.originRequired')
  planErrors.monthlyPrice = toPositiveNumber(planForm.monthlyPrice) ? '' : t('plan.currentRequired')
  planErrors.monthlyPoints = toPositiveInt(planForm.monthlyPoints) ? '' : t('plan.monthRequired')
  planErrors.addOnPoints = toPositiveInt(planForm.addOnPoints) ? '' : t('plan.grantRequired')
  planErrors.addOnPrice = toPositiveNumber(planForm.addOnPrice) ? '' : t('plan.addonPriceRequired')
  planErrors.concurrent = toPositiveInt(planForm.concurrent) ? '' : t('plan.lanesRequired')
  planErrors.storage = toPositiveInt(planForm.storage) ? '' : t('plan.storageRequired')
  return Object.values(planErrors).every(item => !item)
}

async function submitPlan() {
  if (!validatePlan())
    return
  planSaving.value = true
  try {
    const payload = {
      name: planForm.name.trim(),
      featured: planForm.featured,
      monthly_origin: toPositiveNumber(planForm.monthlyOrigin),
      monthly_price: toPositiveNumber(planForm.monthlyPrice),
      monthly_points: toPositiveInt(planForm.monthlyPoints),
      add_on_points: toPositiveInt(planForm.addOnPoints),
      add_on_price: toPositiveNumber(planForm.addOnPrice),
      concurrent: toPositiveInt(planForm.concurrent),
      storage_gb: toPositiveInt(planForm.storage),
      sort_order: Number(planForm.sortOrder) || 0,
    }
    const raw = editingPlan.value
      ? await adminPlanApi.update(editingPlan.value.id, payload)
      : await adminPlanApi.create({ ...payload, code: slugify(planForm.name, 'plan'), status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editingPlan.value ? t('plan.updated') : t('plan.created'))
    planOpen.value = false
    await fetchAll(`p-${Date.now()}`)
  }
  finally {
    planSaving.value = false
  }
}

function openCreatePack() {
  editingPack.value = null
  Object.assign(packForm, { points: '', days: '30', origin: '', memberPrice: '', featured: false, sortOrder: String(pointsPacks.value.length) })
  Object.assign(packErrors, { points: '', origin: '', memberPrice: '' })
  packOpen.value = true
}

function openEditPack(item: AdminPointsPack) {
  editingPack.value = item
  Object.assign(packForm, {
    points: String(item.points),
    days: String(item.days),
    origin: String(item.origin),
    memberPrice: String(item.memberPrice),
    featured: item.featured,
    sortOrder: String(item.sortOrder),
  })
  Object.assign(packErrors, { points: '', origin: '', memberPrice: '' })
  packOpen.value = true
}

function validatePack() {
  packErrors.points = toPositiveInt(packForm.points) ? '' : t('plan.pointsQtyRequired')
  packErrors.origin = toPositiveNumber(packForm.origin) ? '' : t('plan.originRequired')
  packErrors.memberPrice = toPositiveNumber(packForm.memberPrice) ? '' : t('plan.memberPriceRequired')
  return Object.values(packErrors).every(item => !item)
}

async function submitPack() {
  if (!validatePack())
    return
  packSaving.value = true
  try {
    const payload = {
      points: toPositiveInt(packForm.points),
      valid_days: Number(packForm.days) || 30,
      origin: toPositiveNumber(packForm.origin),
      member_price: toPositiveNumber(packForm.memberPrice),
      featured: packForm.featured,
      sort_order: Number(packForm.sortOrder) || 0,
    }
    const raw = editingPack.value
      ? await adminPackApi.update(editingPack.value.id, payload)
      : await adminPackApi.create({ ...payload, code: `p${Number(packForm.days) || 30}-${toPositiveInt(packForm.points)}`, status: 1 })
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    notify(editingPack.value ? t('plan.packUpdated') : t('plan.packCreated'))
    packOpen.value = false
    await fetchAll(`k-${Date.now()}`)
  }
  finally {
    packSaving.value = false
  }
}

function validatePromo() {
  promoErrors.title = promoForm.title.trim() ? '' : t('plan.promoTitleRequired')
  promoErrors.endsAt = promoForm.endsAt ? '' : t('plan.endRequired')
  promoErrors.yearRate = promoForm.yearRate > 0 && promoForm.yearRate <= 1 ? '' : t('plan.annualInvalid')
  promoErrors.quarterRate = promoForm.quarterRate > 0 && promoForm.quarterRate <= 1 ? '' : t('plan.quarterInvalid')
  promoErrors.monthRate = promoForm.monthRate > 0 && promoForm.monthRate <= 1 ? '' : t('plan.monthInvalid')
  promoErrors.teamSeatMin = promoForm.teamSeatMin >= 1 ? '' : t('plan.seatMinInvalid')
  promoErrors.teamSeatMax = promoForm.teamSeatMax >= promoForm.teamSeatMin ? '' : t('plan.maxSeatsInvalid')
  return Object.values(promoErrors).every(item => !item)
}

async function submitPromo() {
  if (!validatePromo())
    return
  promoSaving.value = true
  try {
    const payload: PromoPayload = {
      enabled: promoForm.enabled,
      title: promoForm.title.trim(),
      subtitle: promoForm.subtitle.trim(),
      ends_at: localInputToTs(promoForm.endsAt),
      cycle_rate: { month: promoForm.monthRate, quarter: promoForm.quarterRate, year: promoForm.yearRate },
      cycle_off_label: { quarter: promoForm.quarterOffLabel, year: promoForm.yearOffLabel },
      team_seat_min: promoForm.teamSeatMin,
      team_seat_max: promoForm.teamSeatMax,
      team_seat_rate: promoForm.teamSeatRate,
      banner_enabled: promoForm.bannerEnabled,
      banner_link: promoForm.bannerLink.trim() || '/pricing',
    }
    const raw = await adminPromoApi.save(payload)
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.saveFail'), 'error')
      return
    }
    if (raw.data)
      applyPromo(raw.data)
    notify(t('plan.promoSaved'))
  }
  finally {
    promoSaving.value = false
  }
}

function requestPlanConfirm(item: AdminMembershipPlan, kind: 'plan-status' | 'plan-delete') {
  confirmPlan.value = item
  confirmPack.value = null
  confirmKind.value = kind
  confirmOpen.value = true
}

function requestPackConfirm(item: AdminPointsPack, kind: 'pack-status' | 'pack-delete') {
  confirmPack.value = item
  confirmPlan.value = null
  confirmKind.value = kind
  confirmOpen.value = true
}

const confirmTitle = computed(() => {
  if (confirmKind.value === 'plan-delete')
    return t('plan.confirmDeletePlan')
  if (confirmKind.value === 'pack-delete')
    return t('plan.confirmDeletePack')
  if (confirmKind.value === 'plan-status')
    return confirmPlan.value?.status === 1 ? t('plan.confirmOffPlan') : t('plan.confirmOnPlan')
  return confirmPack.value?.status === 1 ? t('plan.confirmOffPack') : t('plan.confirmOnPack')
})

async function confirmChange() {
  confirming.value = true
  try {
    let raw: any = null
    let message = ''
    if (confirmKind.value === 'plan-delete' && confirmPlan.value) {
      raw = await adminPlanApi.remove(confirmPlan.value.id)
      message = t('plan.planDeleted')
    }
    else if (confirmKind.value === 'plan-status' && confirmPlan.value) {
      raw = await adminPlanApi.update(confirmPlan.value.id, { status: confirmPlan.value.status === 1 ? 2 : 1 })
      message = confirmPlan.value.status === 1 ? t('plan.planOff') : t('plan.planOn')
    }
    else if (confirmKind.value === 'pack-delete' && confirmPack.value) {
      raw = await adminPackApi.remove(confirmPack.value.id)
      message = t('plan.packDeleted')
    }
    else if (confirmKind.value === 'pack-status' && confirmPack.value) {
      raw = await adminPackApi.update(confirmPack.value.id, { status: confirmPack.value.status === 1 ? 2 : 1 })
      message = confirmPack.value.status === 1 ? t('plan.packOff') : t('plan.packOn')
    }
    if (!isOk(raw)) {
      notify(raw?.message ?? t('common.opFail'), 'error')
      return
    }
    notify(message)
    confirmOpen.value = false
    await fetchAll(`c-${Date.now()}`)
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="console-container">
    <ManagePageHeader :page-title="t('plan.title')" :page-description="t('plan.description')" />

    <UTabs
      :model-value="tab"
      :items="tabItems"
      variant="pill"
      :content="false"
      class="mb-6 w-full"
      :ui="{
        list: 'w-fit gap-2',
        trigger: 'px-4',
      }"
      @update:model-value="tab = $event as 'membership' | 'points' | 'promo'"
    />

    <div v-if="loading && !listReady" class="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin" />
      <span class="text-sm">{{ t('common.loading') }}</span>
    </div>

    <template v-else-if="tab === 'membership'">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-zinc-500">{{ t('plan.frontHighlight') }}</p>
        <UButton type="button" icon="i-lucide-plus" @click="openCreatePlan">{{ t('plan.createPlan') }}</UButton>
      </div>
      <UEmpty v-if="!planRows.length" icon="i-lucide-gem" :title="t('plan.emptyPlan')" :description="t('plan.emptyPlanAdd')" class="min-h-72" />
      <div v-else class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <UCard
          v-for="item in planRows"
          :key="item.id"
          variant="outline"
          :class="[
            'flex flex-col dark:bg-zinc-950',
            item.featured ? 'ring-2 ring-primary' : '',
            item.status !== 1 ? 'opacity-75' : '',
          ]"
        >
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ item.name }}</h3>
            <UBadge v-if="item.featured" color="primary" variant="subtle">{{ t('plan.recommend') }}</UBadge>
            <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">
              {{ item.status === 1 ? t('common.onShelf') : t('common.offShelf') }}
            </UBadge>
          </div>
          <div class="mb-6">
            <div class="flex items-end gap-1">
              <span class="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">¥{{ item.monthlyPrice }}</span>
              <span class="mb-1 text-sm text-zinc-500">{{ t('plan.perMonthSlash') }}</span>
            </div>
            <p class="mt-1 text-sm text-zinc-400">
              <span class="line-through">¥{{ item.monthlyOrigin }}</span>
              <span v-if="formatDiscount(item.monthlyPrice, item.monthlyOrigin)" class="ml-2 text-primary-600 dark:text-primary-400">
                {{ formatDiscount(item.monthlyPrice, item.monthlyOrigin) }}
              </span>
            </p>
          </div>
          <ul class="mb-6 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-300">
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-coins" class="size-4 shrink-0 text-zinc-400" />
              {{ t('plan.monthlyLine', { n: item.monthlyPoints.toLocaleString() }) }}
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-layers" class="size-4 shrink-0 text-zinc-400" />
              {{ t('plan.laneLine', { n: item.concurrent }) }}
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-hard-drive" class="size-4 shrink-0 text-zinc-400" />
              {{ t('plan.storageLine', { n: item.storage }) }}
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-plus-circle" class="size-4 shrink-0 text-zinc-400" />
              {{ t('plan.addonLine', { n: item.addOnPoints.toLocaleString(), price: item.addOnPrice }) }}
            </li>
          </ul>
          <div class="mt-auto flex flex-wrap gap-2">
            <UButton type="button" variant="soft" @click="openEditPlan(item)">{{ t('common.edit') }}</UButton>
            <UButton
              type="button"
              variant="soft"
              :color="item.status === 1 ? 'warning' : 'success'"
              @click="requestPlanConfirm(item, 'plan-status')"
            >
              {{ item.status === 1 ? t('common.takeDown') : t('common.putOn') }}
            </UButton>
            <UButton type="button" variant="soft" color="error" @click="requestPlanConfirm(item, 'plan-delete')">{{ t('common.delete') }}</UButton>
          </div>
        </UCard>
      </div>
    </template>

    <template v-else-if="tab === 'points'">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-zinc-500">{{ t('plan.packSortLine') }}</p>
        <UButton type="button" icon="i-lucide-plus" @click="openCreatePack">{{ t('plan.createPackBtn') }}</UButton>
      </div>
      <UEmpty v-if="!packRows.length" icon="i-lucide-coins" :title="t('plan.emptyPack')" :description="t('plan.emptyPackAdd')" class="min-h-72" />
      <div v-else class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <UCard
          v-for="item in packRows"
          :key="item.id"
          variant="outline"
          :class="[
            'flex flex-col dark:bg-zinc-950',
            item.featured ? 'ring-2 ring-primary' : '',
            item.status !== 1 ? 'opacity-75' : '',
          ]"
        >
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">{{ t('plan.pointsTitle', { n: item.points.toLocaleString() }) }}</h3>
            <UBadge v-if="item.featured" color="primary" variant="subtle">{{ t('plan.commonBadge') }}</UBadge>
            <UBadge :color="item.status === 1 ? 'success' : 'neutral'" variant="subtle">
              {{ item.status === 1 ? t('common.onShelf') : t('common.offShelf') }}
            </UBadge>
          </div>
          <div class="mb-6">
            <div class="flex items-end gap-1">
              <span class="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">¥{{ item.memberPrice }}</span>
              <span class="mb-1 text-sm text-zinc-500">{{ t('plan.memberPriceShort') }}</span>
            </div>
            <p class="mt-1 text-sm text-zinc-400">
              <span class="line-through">¥{{ item.origin }}</span>
              <span v-if="formatDiscount(item.memberPrice, item.origin)" class="ml-2 text-primary-600 dark:text-primary-400">
                {{ formatDiscount(item.memberPrice, item.origin) }}
              </span>
            </p>
          </div>
          <ul class="mb-6 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-300">
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-calendar" class="size-4 shrink-0 text-zinc-400" />
              {{ formatValidity(item.days, t) }}
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-wallet" class="size-4 shrink-0 text-zinc-400" />
              {{ t('plan.packWalletHint') }}
            </li>
          </ul>
          <div class="mt-auto flex flex-wrap gap-2">
            <UButton type="button" variant="soft" @click="openEditPack(item)">{{ t('common.edit') }}</UButton>
            <UButton
              type="button"
              variant="soft"
              :color="item.status === 1 ? 'warning' : 'success'"
              @click="requestPackConfirm(item, 'pack-status')"
            >
              {{ item.status === 1 ? t('common.takeDown') : t('common.putOn') }}
            </UButton>
            <UButton type="button" variant="soft" color="error" @click="requestPackConfirm(item, 'pack-delete')">{{ t('common.delete') }}</UButton>
          </div>
        </UCard>
      </div>
    </template>

    <UCard v-else variant="outline" class="dark:bg-zinc-950">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('plan.promoTitle')" required :error="promoErrors.title || undefined">
          <UInput v-model="promoForm.title" maxlength="40" :placeholder="t('plan.promoTitlePhAlt')" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.endTime')" required :error="promoErrors.endsAt || undefined">
          <UInput v-model="promoForm.endsAt" type="datetime-local" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.promoDesc')" :hint="t('plan.promoDescHint')">
          <UInput v-model="promoForm.subtitle" maxlength="80" :placeholder="t('plan.promoDescPh')" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.annualBadge')" :hint="t('common.optional')">
          <UInput v-model="promoForm.yearOffLabel" maxlength="12" :placeholder="t('plan.annualBadgePh')" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.quarterBadge')" :hint="t('common.optional')">
          <UInput v-model="promoForm.quarterOffLabel" maxlength="12" :placeholder="t('plan.upgradeBadgePh')" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.yearRateLabel')" required :hint="t('plan.yearRateHintAlt')" :error="promoErrors.yearRate || undefined">
          <UInput v-model.number="promoForm.yearRate" type="number" step="0.01" min="0.01" max="1" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.quarterRateLabel')" required :error="promoErrors.quarterRate || undefined">
          <UInput v-model.number="promoForm.quarterRate" type="number" step="0.01" min="0.01" max="1" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.monthRateLabel')" required :error="promoErrors.monthRate || undefined">
          <UInput v-model.number="promoForm.monthRate" type="number" step="0.01" min="0.01" max="1" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.teamMin')" required :error="promoErrors.teamSeatMin || undefined">
          <UInput v-model.number="promoForm.teamSeatMin" type="number" min="1" class="w-full" />
        </UFormField>
        <UFormField :label="t('plan.teamMax')" required :error="promoErrors.teamSeatMax || undefined">
          <UInput v-model.number="promoForm.teamSeatMax" type="number" min="1" class="w-full" />
        </UFormField>
        <label class="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <UCheckbox v-model="promoForm.enabled" />
          <span>{{ t('plan.enablePromo') }}</span>
        </label>
      </div>
      <div class="mt-5 rounded-lg border border-dashed border-zinc-200 p-4 dark:border-zinc-800">
        <p class="mb-1 text-sm font-medium text-zinc-900 dark:text-white">{{ t('plan.countdownTitle') }}</p>
        <p class="mb-4 text-xs text-zinc-500">{{ t('plan.countdownHint') }}</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <UCheckbox v-model="promoForm.bannerEnabled" />
            <span>{{ t('plan.showBar') }}</span>
          </label>
          <UFormField :label="t('plan.ctaLink')" :hint="t('plan.ctaLinkHint')">
            <UInput v-model="promoForm.bannerLink" maxlength="200" placeholder="/pricing" class="w-full" />
          </UFormField>
        </div>
      </div>
      <div class="mt-5">
        <UButton type="button" :loading="promoSaving" :disabled="promoSaving" @click="submitPromo">
          {{ promoSaving ? t('common.saving') : t('plan.savePromo') }}
        </UButton>
      </div>
    </UCard>

    <UModal
      v-model:open="planOpen"
      :title="editingPlan ? t('plan.editPlan') : t('plan.createPlanTitle')"
      :description="t('plan.modalDesc')"
      :ui="{ content: 'w-[min(96vw,40rem)]', body: 'space-y-6', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <section class="space-y-4">
          <p class="text-xs font-medium tracking-wide text-zinc-400">{{ t('plan.basic') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('plan.planName')" required :error="planErrors.name || undefined">
              <UInput v-model="planForm.name" maxlength="12" :placeholder="t('plan.planNamePh')" class="w-full" />
            </UFormField>
            <UFormField :label="t('common.sort')" :hint="t('plan.sortHint')">
              <UInput v-model="planForm.sortOrder" type="number" class="w-full" />
            </UFormField>
          </div>
          <div class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800" @click="planForm.featured = !planForm.featured">
            <div>
              <p class="text-sm font-medium text-zinc-900 dark:text-white">{{ t('plan.featured') }}</p>
              <p class="mt-0.5 text-xs text-zinc-500">{{ t('plan.featuredHint') }}</p>
            </div>
            <USwitch :model-value="planForm.featured" @click.stop @update:model-value="planForm.featured = $event" />
          </div>
        </section>

        <section class="space-y-4">
          <p class="text-xs font-medium tracking-wide text-zinc-400">{{ t('plan.priceSection') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('plan.currentPrice')" required :error="planErrors.monthlyPrice || undefined">
              <UInput v-model="planForm.monthlyPrice" type="number" min="1" placeholder="259" class="w-full">
                <template #leading>
                  <span class="text-sm text-zinc-400">¥</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.originPriceMonth')" required :error="planErrors.monthlyOrigin || undefined">
              <UInput v-model="planForm.monthlyOrigin" type="number" min="1" placeholder="399" class="w-full">
                <template #leading>
                  <span class="text-sm text-zinc-400">¥</span>
                </template>
              </UInput>
            </UFormField>
          </div>
        </section>

        <section class="space-y-4">
          <p class="text-xs font-medium tracking-wide text-zinc-400">{{ t('plan.entitlements') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('plan.monthlyPoints')" required :error="planErrors.monthlyPoints || undefined">
              <UInput v-model="planForm.monthlyPoints" type="number" min="1" placeholder="1800" class="w-full">
                <template #trailing>
                  <span class="text-sm text-zinc-400">{{ t('common.points') }}</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.concurrentLabel')" required :error="planErrors.concurrent || undefined">
              <UInput v-model="planForm.concurrent" type="number" min="1" placeholder="10" class="w-full">
                <template #trailing>
                  <span class="text-sm text-zinc-400">{{ t('plan.lane') }}</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.addonPoints')" required :error="planErrors.addOnPoints || undefined">
              <UInput v-model="planForm.addOnPoints" type="number" min="1" placeholder="800" class="w-full">
                <template #trailing>
                  <span class="text-sm text-zinc-400">{{ t('common.points') }}</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.addonPrice')" required :error="planErrors.addOnPrice || undefined">
              <UInput v-model="planForm.addOnPrice" type="number" min="1" placeholder="69" class="w-full">
                <template #leading>
                  <span class="text-sm text-zinc-400">¥</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.storageLabel')" required :error="planErrors.storage || undefined" class="sm:col-span-2">
              <UInput v-model="planForm.storage" type="number" min="1" placeholder="50" class="w-full">
                <template #trailing>
                  <span class="text-sm text-zinc-400">GB</span>
                </template>
              </UInput>
            </UFormField>
          </div>
        </section>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="planSaving" @click="() => { planOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="planSaving" :disabled="planSaving" @click="submitPlan">{{ planSaving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="packOpen"
      :title="editingPack ? t('plan.editPack') : t('plan.createPack')"
      :description="t('plan.packDesc')"
      :ui="{ content: 'w-[min(96vw,36rem)]', body: 'space-y-6', footer: 'justify-end gap-2' }"
    >
      <template #body>
        <section class="space-y-4">
          <p class="text-xs font-medium tracking-wide text-zinc-400">{{ t('plan.tier') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('plan.pointsQty')" required :error="packErrors.points || undefined">
              <UInput v-model="packForm.points" type="number" min="1" placeholder="6000" class="w-full">
                <template #trailing>
                  <span class="text-sm text-zinc-400">{{ t('common.points') }}</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.validDays')" required>
              <USelect v-model="packForm.days" :items="dayItems" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <div class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800" @click="packForm.featured = !packForm.featured">
            <div>
              <p class="text-sm font-medium text-zinc-900 dark:text-white">{{ t('plan.commonTier') }}</p>
              <p class="mt-0.5 text-xs text-zinc-500">{{ t('plan.bestValueHint') }}</p>
            </div>
            <USwitch :model-value="packForm.featured" @click.stop @update:model-value="packForm.featured = $event" />
          </div>
        </section>

        <section class="space-y-4">
          <p class="text-xs font-medium tracking-wide text-zinc-400">{{ t('plan.priceSection') }}</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('plan.memberPriceShort')" required :error="packErrors.memberPrice || undefined">
              <UInput v-model="packForm.memberPrice" type="number" min="1" placeholder="199" class="w-full">
                <template #leading>
                  <span class="text-sm text-zinc-400">¥</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('plan.origin')" required :error="packErrors.origin || undefined">
              <UInput v-model="packForm.origin" type="number" min="1" placeholder="299" class="w-full">
                <template #leading>
                  <span class="text-sm text-zinc-400">¥</span>
                </template>
              </UInput>
            </UFormField>
          </div>
        </section>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="packSaving" @click="() => { packOpen = false }">{{ t('common.cancel') }}</UButton>
        <UButton type="button" :loading="packSaving" :disabled="packSaving" @click="submitPack">{{ packSaving ? t('common.saving') : t('common.save') }}</UButton>
      </template>
    </UModal>

    <ManageConfirmModal
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :tone="confirmKind.includes('delete') ? 'error' : confirmPlan?.status === 1 || confirmPack?.status === 1 ? 'warning' : 'success'"
      :loading="confirming"
      @confirm="confirmChange"
    >
      {{ t('plan.confirmBody', { action: confirmKind.includes('delete') ? t('common.delete') : (confirmPlan?.status === 1 || confirmPack?.status === 1 ? t('common.takeDown') : t('common.putOn')), name: confirmPlan?.name || (confirmPack ? t('plan.pointsTitle', { n: confirmPack.points }) : '') }) }}
    </ManageConfirmModal>
  </div>
</template>
