import http from '~/api/http'

/** 提现审核。列表管理员可看，通过 / 驳回 / 标记打款 / 打款失败仅超级管理员。 */

export interface AdminWithdraw {
  id: number
  withdraw_no: string
  /** 1 用户余额 / 2 伙伴 / 3 创作者分成 */
  owner_type: number
  owner_id: number
  amount: number
  fee: number
  actual_amount: number
  /** alipay / wechat / bank */
  way: string
  account_info: string
  /** 0 待审核 / 2 打款中 / 1 已打款 / -1 打款失败 / -9 已驳回 */
  status: number
  audit_admin_id: number
  audit_time: number
  audit_remark: string
  created_at: number
  complete_time: number
  transaction_no: string
  failure_msg: string
}

export const adminWithdrawApi = {
  /** GET /admin/withdraw?status=&page=&page_size= */
  list(query: Record<string, unknown> = {}) {
    return http.get('/admin/withdraw', query)
  },
  /** POST /admin/withdraw/:id/audit（Root）action: approve / reject */
  audit(id: number, action: 'approve' | 'reject', remark = '') {
    return http.post(`/admin/withdraw/${id}/audit`, { action, remark })
  },
  /** POST /admin/withdraw/:id/paid（Root）打款中 → 已打款 */
  markPaid(id: number, transactionNo: string) {
    return http.post(`/admin/withdraw/${id}/paid`, { transaction_no: transactionNo })
  },
  /** POST /admin/withdraw/:id/failed（Root）打款中 → 打款失败，退回冻结额 */
  markFailed(id: number, failureMsg: string) {
    return http.post(`/admin/withdraw/${id}/failed`, { failure_msg: failureMsg })
  },
}

export default adminWithdrawApi
