type Translate = (key: string, params?: Record<string, unknown>) => string

export function orderKindItems(t: Translate) {
  return [
    { label: t('common.allTypes'), value: '__all__' },
    { label: t('common.kindMembership'), value: 'membership' },
    { label: t('common.kindPoints'), value: 'points' },
  ]
}

export function orderStatusItems(t: Translate) {
  return [
    { label: t('common.allStatus'), value: '__all__' },
    { label: t('common.pendingPay'), value: 'pending' },
    { label: t('common.paid'), value: 'paid' },
    { label: t('common.closed'), value: 'closed' },
    { label: t('common.refunded'), value: 'refunded' },
  ]
}

export function orderKindLabel(kind: string, t: Translate) {
  if (kind === 'membership')
    return t('common.kindMembership')
  if (kind === 'points')
    return t('common.kindPoints')
  return kind
}

export function orderStatusLabel(status: string, t: Translate) {
  if (status === 'pending')
    return t('common.pendingPay')
  if (status === 'paid')
    return t('common.paid')
  if (status === 'closed')
    return t('common.closed')
  if (status === 'refunded')
    return t('common.refunded')
  return status
}

export const ORDER_STATUS_COLOR = {
  pending: 'warning',
  paid: 'success',
  closed: 'neutral',
  refunded: 'error',
} as const

export function pointsDayItems(t: Translate) {
  return [
    { label: t('common.daysN', { n: 30 }), value: '30' },
    { label: t('common.daysN', { n: 90 }), value: '90' },
    { label: t('common.year1'), value: '365' },
    { label: t('common.year2'), value: '730' },
  ]
}

export function formatValidity(days: number, t: Translate) {
  if (days >= 730)
    return t('common.validYears', { n: 2 })
  if (days >= 365)
    return t('common.validYears', { n: 1 })
  return t('common.validDays', { n: days })
}

export function toPositiveInt(value: string | number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n))
    return 0
  return n
}

export function toPositiveNumber(value: string | number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0)
    return 0
  return n
}
