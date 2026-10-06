import { CheckCircleOutlined, CreditCardOutlined } from '@ant-design/icons'
import { Button, Empty, Modal, Result, Skeleton, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { useParentContext } from './ParentLayout'
import type { ParentChild, ParentFeeItem, ParentPayOrder } from './parent-model'

type FeeTab = 'standard' | 'custom'

interface PayItem extends ParentFeeItem {
  itemKey: string
  standard: boolean
}

function formatDecimal(value: unknown): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function dateText(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const year = Number(value[0])
    const month = Number(value[1])
    const day = Number(value[2])
    if (year > 0 && month > 0 && day > 0) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const text = value == null ? '' : String(value).trim()
  return text.length >= 10 ? text.slice(0, 10) : text
}

function cardCategoryText(value: unknown): string {
  const category = String(value || '').trim().toUpperCase()
  if (category === 'STORED_VALUE') return '储值卡'
  if (category === 'PERIOD') return '时段卡'
  if (category === 'HOURS') return '课时卡'
  return ''
}

function periodTypeText(value: unknown): string {
  const labels: Record<string, string> = { WEEK: '7天有效', MONTH: '31天有效', QUARTER: '93天有效', HALF_YEAR: '180天有效', YEAR: '365天有效' }
  return labels[String(value || '').trim().toUpperCase()] || ''
}

function validityText(item: ParentFeeItem): string {
  const start = dateText(item.validStartDate)
  const end = dateText(item.validEndDate)
  if (start && end) return `${start} 至 ${end}`
  if (end) return `至 ${end}`
  if (start) return `${start} 起`
  return ''
}

function orderStatusText(status: string): string {
  if (status === 'BOOKED') return '支付成功，已记入机构缴费记录'
  if (status === 'PAID_UNBOOKED') return '支付成功，机构正在补记缴费记录'
  if (status === 'CLOSED') return '订单已关闭，请重新发起缴费'
  return '支付结果确认中'
}

function recordStatusText(status: unknown): string {
  if (status === 'BOOKED') return '已记入机构缴费记录'
  if (status === 'PAID_UNBOOKED') return '已支付，待机构补记'
  return '处理中'
}

function decorate(item: ParentFeeItem): PayItem {
  const standard = item.sourceType === 'CAMPUS_STANDARD' || Boolean(item.standardPricing)
  return {
    ...item,
    standard,
    itemKey: standard
      ? `standard-${Number(item.coursePricingId || 0)}-${Number(item.studentCardId || 0)}`
      : `student-${Number(item.id || 0)}`,
  }
}

function detailLines(item: PayItem): string {
  const hours = Number(item.hours || 0)
  const giftHours = Number(item.giftHours || 0)
  const unitPrice = Number(item.unitPrice || 0)
  const deadline = dateText(item.paymentDeadline)
  return [
    cardCategoryText(item.cardCategory),
    hours > 0 ? `${formatDecimal(hours)}课时` : '',
    giftHours > 0 ? `赠送${formatDecimal(giftHours)}课时` : '',
    item.cardName ? `续费卡片 ${item.cardName}` : '',
    unitPrice > 0 ? `统一单价 ¥${formatDecimal(unitPrice)}` : '',
    periodTypeText(item.periodType),
    validityText(item),
    deadline ? `缴费截止 ${deadline}` : '',
    item.scopeText || '',
    item.description || '',
    item.standard ? '机构统一定价' : '仅当前学员可用',
  ].filter(Boolean).join(' · ')
}

export function ParentPayPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { home } = useParentContext()
  const institutionMembers = (home.children || []).filter((member) => member.source === 'INSTITUTION' && member.studentId)
  const [member, setMember] = useState<ParentChild | undefined>(() => institutionMembers.find((item) => item.studentId === Number(params.get('studentId'))) || institutionMembers[0])
  const [items, setItems] = useState<PayItem[]>([])
  const [records, setRecords] = useState<ParentPayOrder[]>([])
  const [tab, setTab] = useState<FeeTab>('standard')
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState<{ orderNo: string; itemName?: string; amount?: number; status?: string } | null>(null)
  const [submitting, setSubmitting] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [statusText, setStatusText] = useState('')
  const standardItems = items.filter((item) => item.standard)
  const customItems = items.filter((item) => !item.standard)
  const visibleItems = tab === 'custom' ? customItems : standardItems

  useEffect(() => {
    if (!member?.studentId) {
      setItems([])
      setRecords([])
      return
    }
    const studentId = member.studentId
    setLoading(true)
    setStatusText('')
    Promise.all([
      parentApi.feeItems(studentId),
      parentApi.payOrders(studentId).catch(() => [] as ParentPayOrder[]),
    ]).then(([feeItems, payOrders]) => {
      const decorated = (feeItems || []).map(decorate)
      const standard = decorated.filter((item) => item.standard)
      const custom = decorated.filter((item) => !item.standard)
      setItems(decorated)
      setRecords(payOrders || [])
      setTab((current) => {
        if (current === 'standard' && !standard.length && custom.length) return 'custom'
        if (current === 'custom' && !custom.length && standard.length) return 'standard'
        return current
      })
    }).catch((reason) => message.error(reason instanceof Error ? reason.message : '缴费项目加载失败')).finally(() => setLoading(false))
  }, [member?.studentId])

  async function createOrder(item: PayItem) {
    if (!member?.studentId || submitting) return
    if (item.payable === false) {
      message.warning('请先联系机构配置可续费课时卡')
      return
    }
    setSubmitting(item.itemKey)
    setStatusText('')
    try {
      const created = item.standard
        ? await parentApi.createStandardPricingOrder(member.studentId, Number(item.coursePricingId || 0), Number(item.studentCardId || 0))
        : await parentApi.createPayOrder(item.id)
      setOrder({ ...created, itemName: created.itemName || item.name, amount: created.amount ?? item.amount })
    } catch (reason) {
      if (reason instanceof Error) message.error(reason.message)
    } finally {
      setSubmitting('')
    }
  }

  async function confirmPaid() {
    if (!order?.orderNo || !member?.studentId || confirming) return
    setConfirming(true)
    let latest = ''
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, 800))
        const confirmed = await parentApi.confirmPayOrder(order.orderNo)
        latest = String(confirmed.status || '')
        if (latest === 'BOOKED' || latest === 'PAID_UNBOOKED' || latest === 'CLOSED') break
      }
      const text = orderStatusText(latest)
      setStatusText(text)
      message.info(text)
      if (latest === 'BOOKED' || latest === 'PAID_UNBOOKED') {
        setRecords(await parentApi.payOrders(member.studentId).catch(() => records))
      }
    } catch {
      const text = '支付结果确认中，请稍后在缴费记录中查看'
      setStatusText(text)
      message.info(text)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>缴费报名</h2><p>金额由机构设置。支付成功后会自动进入机构缴费记录。</p></div></div>
      {!institutionMembers.length ? <div className="parent-card parent-empty"><Empty description="暂无可缴费的机构学员" /></div> : null}
      {institutionMembers.length > 1 ? <div className="parent-member-tabs parent-pay-members">{institutionMembers.map((item) => <button type="button" className={member?.studentId === item.studentId ? 'active' : ''} key={item.studentId} onClick={() => setMember(item)}>{item.name}</button>)}</div> : null}
      {institutionMembers.length ? <div className="parent-member-tabs">
        <button type="button" className={tab === 'standard' ? 'active' : ''} onClick={() => setTab('standard')}>标准课程</button>
        <button type="button" className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>专属方案</button>
      </div> : null}
      {loading ? <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 5 }} /></div> : visibleItems.length ? <div className="parent-fee-grid">{visibleItems.map((item) => (
        <article className="parent-card parent-fee-card" key={item.itemKey}>
          <span><CreditCardOutlined /></span>
          <div>
            <h3>{item.name}{item.standard ? '' : ' · 专属'}</h3>
            <p>{detailLines(item)}</p>
            <strong>¥{formatDecimal(item.amount)}</strong>
          </div>
          <Button type="primary" disabled={item.payable === false} loading={submitting === item.itemKey} onClick={() => void createOrder(item)}>{item.payable === false ? '暂不可缴' : '立即缴费'}</Button>
        </article>
      ))}</div> : institutionMembers.length ? <div className="parent-card parent-empty"><Empty description={tab === 'standard' ? '机构暂未发布可缴的标准课程。' : '机构暂未为当前学员设置专属缴费方案。'} /></div> : null}
      {statusText ? <p className="parent-pay-tip">{statusText}</p> : null}
      {records.length ? <section className="parent-card">
        <div className="parent-card-head"><h3>缴费记录</h3><span>学员端支付单独保存，入账后会出现在机构缴费记录</span></div>
        {records.map((record) => <div className="parent-record-row" key={record.orderNo}><div><strong>{record.itemName || '缴费项目'}</strong><small>{[record.createTime, recordStatusText(record.status)].filter(Boolean).join(' · ')}</small></div><b>¥{formatDecimal(record.amount)}</b></div>)}
      </section> : null}
      <Modal open={Boolean(order)} footer={null} onCancel={() => setOrder(null)} width={470}>
        <Result
          icon={<CheckCircleOutlined />}
          status="info"
          title="订单已创建"
          subTitle={`${order?.itemName || '缴费项目'} · ¥${formatDecimal(order?.amount)}`}
          extra={<><p className="parent-pay-tip">订单号：{order?.orderNo}<br />微信支付需要在微信小程序内完成。打开同一账号的学员端“缴费报名”即可继续支付。</p><Button type="primary" loading={confirming} onClick={() => void confirmPaid()}>我已在微信完成支付</Button><Button onClick={() => setOrder(null)}>我知道了</Button><Button onClick={() => navigate('/parent/records?tab=payment')}>查看缴费记录</Button></>}
        />
      </Modal>
    </div>
  )
}
