import { Alert, Button, Modal, QRCode, Spin, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { getJson, postJson } from '../api/biz'
import { money, tell } from './kit'

interface NativePayParams {
  orderNo: string
  totalFee?: number
  totalFeeYuan?: number
  codeUrl: string
}

interface PayStatus {
  payStatus?: number
  paid?: boolean
}

interface MembershipIntent {
  kind: 'membership'
  title: string
  amount?: number
  payload: { planId: string; termYears?: number; upgradeMode?: string }
}

interface AddonIntent {
  kind: 'addon'
  title: string
  amount?: number
  payload: { items: Array<{ campusId: number; capacityIncrement: number }> }
}

export type MembershipPaymentIntent = MembershipIntent | AddonIntent

export function MembershipPaymentModal(props: {
  intent: MembershipPaymentIntent | null
  onClose: () => void
  onPaid: () => Promise<void> | void
}) {
  const [order, setOrder] = useState<NativePayParams | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [paid, setPaid] = useState(false)
  const settledRef = useRef(false)

  async function createOrder(intent: MembershipPaymentIntent) {
    setLoading(true)
    setError('')
    setOrder(null)
    setPaid(false)
    settledRef.current = false
    try {
      const endpoint = intent.kind === 'addon'
        ? '/auth/membership/addon/create-native-payment'
        : '/auth/membership/create-native-payment'
      setOrder(await postJson<NativePayParams>(endpoint, intent.payload))
    } catch (reason) {
      setError(tell(reason, '支付订单创建失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (props.intent) void createOrder(props.intent)
  }, [props.intent])

  async function checkStatus(silent = false) {
    if (!order?.orderNo || !props.intent || settledRef.current) return
    if (!silent) setChecking(true)
    try {
      const prefix = props.intent.kind === 'addon'
        ? '/auth/membership/addon/pay/status/'
        : '/auth/membership/pay/status/'
      const status = await getJson<PayStatus>(`${prefix}${encodeURIComponent(order.orderNo)}`)
      if (status.paid || status.payStatus === 1) {
        settledRef.current = true
        setPaid(true)
        message.success('支付成功，会员权益已更新')
        await props.onPaid()
      } else if (status.payStatus === 3) {
        settledRef.current = true
        setError('订单已失效，请关闭后重新下单。')
      } else if (!silent) {
        message.info('暂未查询到支付结果，请完成付款后再试')
      }
    } catch (reason) {
      if (!silent) message.error(tell(reason, '支付结果查询失败'))
    } finally {
      if (!silent) setChecking(false)
    }
  }

  useEffect(() => {
    if (!order?.orderNo || !props.intent || paid) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkStatus(true)
    }, 4000)
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 10 * 60 * 1000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stopTimer)
    }
  }, [order?.orderNo, props.intent, paid])

  function close() {
    setOrder(null)
    setError('')
    setPaid(false)
    settledRef.current = false
    props.onClose()
  }

  const displayAmount = order?.totalFeeYuan ?? props.intent?.amount
  return (
    <Modal
      open={!!props.intent}
      title={paid ? '支付完成' : '微信扫码支付'}
      width={430}
      maskClosable={false}
      closable={!loading}
      onCancel={close}
      footer={paid ? <Button type="primary" onClick={close}>完成</Button> : (
        <>
          <Button onClick={close}>稍后支付</Button>
          <Button type="primary" loading={checking} disabled={!order} onClick={() => { void checkStatus(false) }}>我已完成支付</Button>
        </>
      )}
    >
      <div className="membership-pay-panel">
        {loading ? <Spin tip="正在创建安全支付订单…" /> : null}
        {!loading && error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            action={props.intent && !settledRef.current ? <Button size="small" onClick={() => { void createOrder(props.intent!) }}>重新下单</Button> : undefined}
          />
        ) : null}
        {!loading && order && !paid ? (
          <>
            <strong className="membership-pay-title">{props.intent?.title}</strong>
            {displayAmount != null ? <span className="membership-pay-amount">¥{money(displayAmount)}</span> : null}
            <QRCode value={order.codeUrl} size={224} bordered={false} errorLevel="M" />
            <p>请使用微信扫码完成支付。页面会自动确认结果，无需重复付款。</p>
            <small>订单号 {order.orderNo}</small>
          </>
        ) : null}
        {paid ? (
          <div className="membership-pay-success">
            <span aria-hidden="true">✓</span>
            <strong>支付成功</strong>
            <p>会员状态和校区容量已同步刷新。</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
