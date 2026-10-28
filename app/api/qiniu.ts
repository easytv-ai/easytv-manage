import http from '~/api/http'

const QINIU_UPLOAD_URL = 'https://upload.qiniup.com'

function readErrorMessage(data: unknown, status: number): string {
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : null
  const msg = String(body?.error ?? body?.message ?? '').trim()
  if (msg)
    return msg
  return status ? `上传失败 (${status})` : '上传失败'
}

function pickPayload(raw: any): any {
  if (raw && typeof raw === 'object' && raw.data != null)
    return raw.data
  return raw
}

const qiniu = {
  /** 获取七牛 key（GET /user/qiniu/key?suffix=） */
  getKey(suffix?: string) {
    return http.get('/user/qiniu/key', suffix ? { suffix } : undefined)
  },

  /** 获取七牛 upload token（GET /user/qiniu/upload-token?key=） */
  getToken(key?: string) {
    return http.get('/user/qiniu/upload-token', key ? { key } : undefined)
  },

  /**
   * 直传七牛（不要走业务 http：避免带 Authorization / EasyAPI-User 触发 CORS 预检失败）
   */
  async uploadFiles(data: FormData): Promise<{ key?: string, hash?: string }> {
    const res = await fetch(QINIU_UPLOAD_URL, {
      method: 'POST',
      body: data,
    })

    let payload: Record<string, unknown> = {}
    const text = await res.text()
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>
      }
      catch {
        payload = { message: text }
      }
    }

    if (!res.ok)
      throw new Error(readErrorMessage(payload, res.status))

    return payload as { key?: string, hash?: string }
  },

  /** 选图后直传七牛，返回可访问的完整 URL */
  async uploadImage(file: File): Promise<string> {
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : ''
    const keyRaw = await this.getKey(ext) as any
    if (keyRaw?.success === false)
      throw new Error(String(keyRaw?.message || '获取上传路径失败'))

    const keyData = pickPayload(keyRaw)
    let key = typeof keyData === 'string'
      ? keyData
      : String(keyData?.key ?? '').trim()
    if (!key)
      throw new Error('获取上传路径失败')
    if (ext && !/\.[a-z0-9]+$/i.test(key))
      key += ext

    const tokenRaw = await this.getToken(key) as any
    if (tokenRaw?.success === false)
      throw new Error(String(tokenRaw?.message || '获取上传凭证失败'))

    const tokenData = pickPayload(tokenRaw)
    const token = typeof tokenData === 'string'
      ? tokenData
      : String(tokenData?.up_token ?? tokenData?.upload_token ?? tokenData?.token ?? tokenData?.uploadToken ?? tokenData?.uptoken ?? '').trim()
    const domain = String(
      (typeof tokenData === 'object' && tokenData ? tokenData.domain ?? tokenData.host : '')
      || (typeof keyData === 'object' && keyData ? keyData.domain ?? keyData.host : ''),
    ).trim().replace(/\/$/, '')

    if (!token)
      throw new Error('获取上传凭证失败')

    const form = new FormData()
    form.append('token', token)
    form.append('key', key)
    form.append('file', file, file.name)
    const uploaded = await this.uploadFiles(form)
    const finalKey = String(uploaded.key || key).replace(/^\//, '')
    if (!domain)
      throw new Error('未返回七牛访问域名')
    return `${domain}/${finalKey}`
  },
}

export default qiniu
