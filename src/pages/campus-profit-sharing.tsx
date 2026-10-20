import { DollarOutlined } from '@ant-design/icons'
import { Button, Input, Popconfirm, Switch, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson, putJson } from '../api/biz'
import { tell } from './kit'

interface CampusProfitSharingValue {
  campusId: number
  orgId: number
  configured: boolean
  merchantIdMasked?: string
  merchantName?: string
  status: 'UNCONFIGURED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED'
  rate?: number
  enabled: boolean
  errorMessage?: string
  verifiedAt?: string
}

const STATUS_TEXT: Record<CampusProfitSharingValue['status'], string> = {
  UNCONFIGURED: '未配置',
  PENDING: '待平台验证',
  VERIFIED: '已验证',
  FAILED: '验证失败',
  DISABLED: '已停用',
}

export function CampusProfitSharing({ campusId }: { campusId: number | null }) {
  const [value, setValue] = useState<CampusProfitSharingValue | null>(null)
  const [merchantId, setMerchantId] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)

  function apply(next: CampusProfitSharingValue) {
    setValue(next)
    setMerchantId('')
    setMerchantName(next.merchantName || '')
    setEnabled(next.configured ? next.enabled !== false : true)
  }

  async function load() {
    const id = Number(campusId || 0)
    if (!id) {
      setValue(null)
      return
    }
    const currentRequest = requestId.current + 1
    requestId.current = currentRequest
    setLoading(true)
    try {
      const next = await getJson<CampusProfitSharingValue>(`/campus/${id}/profit-sharing`)
      if (requestId.current === currentRequest && Number(campusId || 0) === id) apply(next)
    } catch (error) {
      if (requestId.current === currentRequest) {
        setValue(null)
        message.error(tell(error, '分账配置加载失败'))
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => { requestId.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId])

  function payload() {
    const normalizedMerchantId = merchantId.replace(/\D+/g, '').slice(0, 32)
    const normalizedMerchantName = merchantName.trim()
    if (!value?.configured && !/^\d{8,32}$/.test(normalizedMerchantId)) return { error: '请输入正确的微信支付商户号' }
    if (!normalizedMerchantName) return { error: '请输入商户法定全称' }
    if (Array.from(normalizedMerchantName).length > 100) return { error: '商户法定全称不能超过100个字' }
    return {
      data: {
        merchantId: normalizedMerchantId || undefined,
        merchantName: normalizedMerchantName,
        enabled,
      },
    }
  }

  async function save(successTitle: string) {
    const id = Number(campusId || 0)
    if (!id || saving) return
    const result = payload()
    if ('error' in result) {
      message.warning(result.error)
      return
    }
    setSaving(true)
    try {
      const next = await putJson<CampusProfitSharingValue>(`/campus/${id}/profit-sharing`, result.data)
      apply(next)
      message.success(next.status === 'VERIFIED' ? successTitle : '资料已保存，待验证')
    } catch (error) {
      message.error(tell(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function disable() {
    const id = Number(campusId || 0)
    if (!id || saving) return
    setSaving(true)
    try {
      const next = await putJson<CampusProfitSharingValue>(`/campus/${id}/profit-sharing`, { enabled: false })
      apply(next)
      message.success('已停用')
    } catch (error) {
      message.error(tell(error, '停用失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="work-card org-block-card org-profit-sharing-card campus-profit-sharing-card">
      <div className="org-card-heading">
        <span className="org-card-heading-icon org-card-heading-icon--green"><DollarOutlined /></span>
        <div>
          <h2>微信支付分账</h2>
          <p>按校区配置商户资料，不配置不影响正常使用</p>
        </div>
        <span className={`org-profit-sharing-status is-${String(value?.status || 'UNCONFIGURED').toLowerCase()}`}>
          {loading ? '加载中' : STATUS_TEXT[value?.status || 'UNCONFIGURED']}
        </span>
      </div>
      <div className="org-profit-sharing-body">
        <p className="org-profit-sharing-notice">验证通过后，仅当前校区新产生的营销订单进入分账，历史订单不受影响。</p>
        {value?.errorMessage ? <p className="org-profit-sharing-error">{value.errorMessage}</p> : null}
        <div className="org-profit-sharing-fields">
          <label>
            <span>微信支付商户号 <em>选填</em></span>
            <Input
              value={merchantId}
              maxLength={32}
              inputMode="numeric"
              disabled={loading || saving}
              placeholder={value?.merchantIdMasked ? `当前 ${value.merchantIdMasked}，不修改可留空` : '请输入当前校区的微信支付商户号'}
              onChange={(event) => setMerchantId(event.target.value.replace(/\D+/g, '').slice(0, 32))}
            />
          </label>
          <label>
            <span>商户法定全称 <em>选填</em></span>
            <Input
              value={merchantName}
              maxLength={100}
              disabled={loading || saving}
              placeholder="必须与微信支付商户信息完全一致"
              onChange={(event) => setMerchantName(event.target.value)}
            />
          </label>
        </div>
        <div className="org-profit-sharing-setting">
          <div><strong>机构分账比例</strong><span>由平台管理员设置，校区端仅展示</span></div>
          <b>{Number(value?.rate || 30)}%</b>
        </div>
        <div className="org-profit-sharing-setting">
          <div><strong>验证后启用</strong><span>关闭后，当前校区的新订单不再进入微信分账</span></div>
          <Switch checked={enabled} disabled={loading || saving} onChange={setEnabled} />
        </div>
        <div className="org-profit-sharing-actions">
          <Button disabled={loading} loading={saving} onClick={() => { void save('商户资料检测通过') }}>检测商户资料</Button>
          {value?.configured ? <Popconfirm title="停用微信支付分账？" description="停用后，当前校区的新订单不再进入微信分账。" onConfirm={() => void disable()}><Button danger disabled={saving}>停用分账</Button></Popconfirm> : null}
          <Button type="primary" disabled={loading} loading={saving} onClick={() => { void save('分账设置已保存') }}>保存分账设置</Button>
        </div>
      </div>
    </section>
  )
}
