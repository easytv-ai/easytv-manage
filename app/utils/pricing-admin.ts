export const ORDER_KIND_ITEMS = [
  { label: '全部类型', value: '__all__' },
  { label: '开通会员', value: 'membership' },
  { label: '积分充值', value: 'points' },
]

export const ORDER_STATUS_ITEMS = [
  { label: '全部状态', value: '__all__' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已关闭', value: 'closed' },
  { label: '已退款', value: 'refunded' },
]

export const ORDER_KIND_LABEL = {
  membership: '开通会员',
  points: '积分充值',
} as const

export const ORDER_STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  refunded: '已退款',
} as const

export const ORDER_STATUS_COLOR = {
  pending: 'warning',
  paid: 'success',
  closed: 'neutral',
  refunded: 'error',
} as const

export const POINTS_DAY_ITEMS = [
  { label: '30 天', value: '30' },
  { label: '90 天', value: '90' },
  { label: '1 年', value: '365' },
  { label: '2 年', value: '730' },
]

export function formatValidity(days: number) {
  if (days >= 730)
    return '有效期 2 年'
  if (days >= 365)
    return '有效期 1 年'
  return `有效期 ${days} 天`
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
