import { CheckCircleOutlined, CreditCardOutlined } from '@ant-design/icons'
import { Button, Empty, Modal, Result, Skeleton, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parentApi } from '../api/parent'
import { useParentContext } from './ParentLayout'
import type { ParentChild, ParentFeeItem } from './parent-model'

export function ParentPayPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { home } = useParentContext()
  const institutionMembers = (home.children || []).filter((member) => member.source === 'INSTITUTION' && member.studentId)
  const [member, setMember] = useState<ParentChild | undefined>(() => institutionMembers.find((item) => item.studentId === Number(params.get('studentId'))) || institutionMembers[0])
  const [items, setItems] = useState<ParentFeeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState<{ orderNo: string; itemName?: string; amount?: number; status?: string } | null>(null)
  const [submitting, setSubmitting] = useState<number | null>(null)

  useEffect(() => {
    if (!member?.studentId) return setItems([])
    setLoading(true)
    parentApi.feeItems(member.studentId).then(setItems).catch((reason) => message.error(reason.message)).finally(() => setLoading(false))
  }, [member?.studentId])

  async function createOrder(item: ParentFeeItem) {
    setSubmitting(item.id)
    try {
      const created = await parentApi.createPayOrder(item.id)
      setOrder({ ...created, itemName: created.itemName || item.name, amount: created.amount ?? item.amount })
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSubmitting(null) }
  }

  return (
    <div>
      <div className="parent-page-head"><div><h2>选择缴费项目</h2><p>金额由机构设置；支付成功后会自动进入机构缴费记录。</p></div></div>
      {institutionMembers.length > 1 ? <div className="parent-member-tabs parent-pay-members">{institutionMembers.map((item) => <button type="button" className={member?.studentId === item.studentId ? 'active' : ''} key={item.studentId} onClick={() => setMember(item)}>{item.name}</button>)}</div> : null}
      {loading ? <div className="parent-card parent-record-loading"><Skeleton active paragraph={{ rows: 5 }} /></div> : items.length ? <div className="parent-fee-grid">{items.filter((item) => item.enabled !== false).map((item) => <article className="parent-card parent-fee-card" key={item.id}><span><CreditCardOutlined /></span><div><h3>{item.name}</h3><p>{item.chargeSnapshot || '机构费用项目'}</p><strong>¥{Number(item.amount || 0).toFixed(2)}</strong></div><Button type="primary" loading={submitting === item.id} onClick={() => void createOrder(item)}>立即缴费</Button></article>)}</div> : <div className="parent-card parent-empty"><Empty description="机构还没有设置可缴项目，请联系管理员" /></div>}
      <Modal open={Boolean(order)} footer={null} onCancel={() => setOrder(null)} width={470}>
        <Result icon={<CheckCircleOutlined />} status="info" title="订单已创建" subTitle={`${order?.itemName || '缴费项目'} · ¥${Number(order?.amount || 0).toFixed(2)}`} extra={<><p className="parent-pay-tip">订单号：{order?.orderNo}<br />微信支付需要在微信小程序内完成。打开同一账号的“家长端 → 缴费”即可继续支付，订单状态会自动同步。</p><Button type="primary" onClick={() => setOrder(null)}>我知道了</Button><Button onClick={() => navigate('/parent/records?tab=payment')}>查看缴费记录</Button></>} />
      </Modal>
    </div>
  )
}
