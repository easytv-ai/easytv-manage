/**
 * 控制台 / 管理后台筛选区共用的 USelect :items 数据源。
 */

/** Radix SelectItem 不允许 `value === ''`（空串用于清空选中）。筛选用此表示「不限 / 全部」。 */
export const SELECT_ITEM_ALL = '__all__' as const

/** 表单里「未选择」占位（同样不能用空串作 item value）。 */
export const SELECT_ITEM_UNSET = '__unset__' as const

/** 将筛选下拉的「全部」哨兵还原为请求/逻辑用的空串。 */
export function selectFilterToQuery(v: string): string {
  return v === SELECT_ITEM_ALL ? '' : v
}

/** 控制台列表统一分页选项 */
export const CONSOLE_PAGE_SIZES = [10, 25, 50, 100] as const

export const CONSOLE_DEFAULT_PAGE_SIZE = CONSOLE_PAGE_SIZES[0]

export function pageSizeSelectItems(sizes: readonly number[] = CONSOLE_PAGE_SIZES) {
  return sizes.map(n => ({ label: String(n), value: n }))
}

/** 带「条/页」文案的分页下拉项 */
export function consolePageSizeSelectItems(sizes: readonly number[] = CONSOLE_PAGE_SIZES) {
  return sizes.map(n => ({ label: `${n}条/页`, value: n }))
}
