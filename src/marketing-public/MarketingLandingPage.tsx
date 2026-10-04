import { CheckCircleOutlined, ClockCircleOutlined, EnvironmentOutlined, GiftOutlined, PhoneOutlined, QrcodeOutlined, ReloadOutlined, SafetyCertificateOutlined, ShareAltOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Result, Select, Skeleton, Tag, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { marketingPublicApi } from '../api/marketing-public'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import type { MarketingEnrollment, MarketingLanding, MarketingSession } from './marketing-public-model'

interface EnrollForm { studentName: string; sessionId?: number; gender?: string; birthDate?: string; levelText?: string; intentSlots?: string; remark?: string }

export function MarketingLandingPage() {
  const { shareCode = '' } = useParams()
  const [params] = useSearchParams()
  const referralCode = params.get('r') || undefined
  const navigate = useNavigate()
  const [view, setView] = useState<MarketingLanding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successKind, setSuccessKind] = useState<'enrolled' | 'pending' | 'paid' | ''>('')
  const [createdEnrollment, setCreatedEnrollment] = useState<{ shareCode: string; id: number }>()
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [payGuideOpen, setPayGuideOpen] = useState(false)
  const [payCodeUrl, setPayCodeUrl] = useState('')
  const [payGuideError, setPayGuideError] = useState('')
  const [form] = Form.useForm<EnrollForm>()
  const loadSequence = useRef(0)

  function load(silent = false) {
    const requestId = ++loadSequence.current
    if (!silent) setLoading(true)
    if (!silent) setError('')
    return marketingPublicApi.detail(shareCode, referralCode).then((next) => {
      if (requestId === loadSequence.current) setView(next)
      return next
    }).catch((reason) => {
      if (!silent && requestId === loadSequence.current) setError(reason.message)
      throw reason
    }).finally(() => {
      if (!silent && requestId === loadSequence.current) setLoading(false)
    })
  }
  useEffect(() => {
    setView(null)
    setLoading(true)
    setError('')
    setCreatedEnrollment(undefined)
    setSuccessKind('')
    setPayGuideOpen(false)
    setPayCodeUrl('')
    setPayGuideError('')
  }, [shareCode])
  useEffect(() => { void load().catch(() => undefined) }, [shareCode, referralCode])

  const pendingEnrollment = view?.shareCode === shareCode
    && view.myEnrollment?.enrollStatus !== 'CANCELLED'
    && view.myEnrollment?.payStatus === 'PENDING'
    ? view.myEnrollment
    : undefined
  const createdEnrollmentId = createdEnrollment?.shareCode === shareCode ? createdEnrollment.id : undefined
  const pendingPaymentId = pendingEnrollment?.id || createdEnrollmentId

  useEffect(() => {
    if (!pendingPaymentId) return
    const enrollmentId = pendingPaymentId
    const timer = window.setInterval(() => {
      marketingPublicApi.enrollments().then((rows) => {
        const latest = rows.find((item) => item.id === enrollmentId)
        if (!latest || latest.payStatus === 'PENDING') return
        void load(true).then(() => {
          setPayGuideOpen(false)
          setCreatedEnrollment(undefined)
          if (latest?.payStatus === 'PAID') setSuccessKind('paid')
        }).catch(() => undefined)
      }).catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [pendingPaymentId, shareCode, referralCode])

  const sellingPoints = useMemo(() => jsonList(view?.sellingPoints), [view?.sellingPoints])
  const tiers = useMemo(() => jsonObjects(view?.referralRewardTiers), [view?.referralRewardTiers])
  const fields = useMemo(() => jsonObject(view?.enrollmentFields), [view?.enrollmentFields])

  async function enroll() {
    try {
      if (!(await marketingPublicApi.phoneBound())) {
        message.warning('当前账号尚未绑定手机号，请先在微信小程序完成一次手机号授权')
        return
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '账号状态校验失败，请重新登录')
      return
    }
    let values: EnrollForm
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSubmitting(true)
    try {
      const result = await marketingPublicApi.enroll({ ...values, shareCode, referralCode, source: referralCode ? 'SHARE' : 'DIRECT', intentSlots: values.intentSlots ? JSON.stringify([values.intentSlots]) : undefined })
      setSheetOpen(false)
      if (!result.paymentRequired) {
        setCreatedEnrollment(undefined)
        setSuccessKind('enrolled')
        await load(true).catch(() => undefined)
        return
      }
      setCreatedEnrollment({ shareCode, id: result.enrollmentId })
      setSuccessKind('pending')
      const next = await load(true).catch(() => null)
      if (next?.myEnrollment?.payStatus === 'PAID') {
        setCreatedEnrollment(undefined)
        setSuccessKind('paid')
      }
    } catch (reason) { if (reason instanceof Error) message.error(reason.message) } finally { setSubmitting(false) }
  }

  async function continuePayment(enrollmentId = pendingPaymentId) {
    if (!enrollmentId || paymentBusy) return
    setSuccessKind('')
    await openPayGuide()
  }

  async function openPayGuide() {
    setPayGuideOpen(true)
    setPayCodeUrl('')
    setPayGuideError('')
    setPaymentBusy(true)
    try {
      const result = await marketingPublicApi.poster(shareCode)
      if (!result.imageUrl) throw new Error('暂未生成活动小程序码')
      setPayCodeUrl(marketingPublicApi.assetUrl(result.imageUrl))
    } catch (reason) {
      setPayGuideError(reason instanceof Error ? reason.message : '活动小程序码加载失败')
    } finally {
      setPaymentBusy(false)
    }
  }

  async function checkPaymentStatus(showPending = true) {
    setCheckingPayment(true)
    try {
      const enrollmentId = pendingPaymentId
      const rows = enrollmentId ? await marketingPublicApi.enrollments() : []
      const status = rows.find((item) => item.id === enrollmentId)?.payStatus
      if (status === 'PAID') {
        setCreatedEnrollment(undefined)
        await load(true)
        setPayGuideOpen(false)
        setSuccessKind('paid')
      } else if (showPending && status === 'PENDING') {
        message.info('暂未查询到支付成功，请完成支付后再刷新')
      } else if (showPending) {
        setCreatedEnrollment(undefined)
        await load(true)
        setPayGuideOpen(false)
        message.warning('这笔报名已不在待支付状态，请重新查看活动')
      }
    } catch (reason) {
      if (showPending) message.error(reason instanceof Error ? reason.message : '支付状态刷新失败，请稍后重试')
    } finally {
      setCheckingPayment(false)
    }
  }

  function share() {
    navigator.clipboard.writeText(window.location.href).then(() => message.success('活动链接已复制')).catch(() => message.error('复制失败'))
  }

  if (loading) return <MarketingFrame><div className="mkt-loading"><Skeleton active paragraph={{ rows: 12 }} /></div></MarketingFrame>
  if (error || !view || view.shareCode !== shareCode) return <MarketingFrame><Result status="warning" title="暂时打不开这个活动" subTitle={error || '活动不存在'} extra={<Button type="primary" onClick={() => void load().catch(() => undefined)}>重新加载</Button>} /></MarketingFrame>

  const enrolled = Boolean(view.myEnrollment && view.myEnrollment.enrollStatus !== 'CANCELLED' && view.myEnrollment.payStatus !== 'PENDING')
  return (
    <MarketingFrame>
      <div className={`mkt-hero theme-${String(view.posterTheme || 'blue').toLowerCase()}`} style={view.coverImageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(15,32,78,.88), rgba(28,64,160,.54)), url(${view.coverImageUrl})` } : undefined}>
        <div><Tag>{view.displayStatus || '活动进行中'}</Tag><span className="mkt-play"><ThunderboltOutlined /> {playLabel(view.playType)}</span><h1>{view.headline || '精彩活动'}</h1><p>{view.subHeadline || '限时开放，欢迎参与'}</p><div className="mkt-price"><strong>{Number(view.price || 0) > 0 ? `¥${Number(view.price).toFixed(2)}` : '免费'}</strong>{Number(view.originalPrice || 0) > Number(view.price || 0) ? <del>¥{Number(view.originalPrice).toFixed(2)}</del> : null}</div></div>
        <div className="mkt-hero-meta"><span><TeamOutlined /> {view.remainingQuota == null ? '名额不限' : `剩余 ${view.remainingQuota} 个名额`}</span><span>{dateRange(view.activityStartDate, view.activityEndDate)}</span></div>
      </div>
      <div className="mkt-layout">
        <main>
          {tiers.length ? <MarketingCard title="邀请好友报名" icon={<GiftOutlined />}><div className="mkt-tier-list">{tiers.map((tier, index) => <div key={String(tier.threshold || index)}><i>{index + 1}</i><span>邀请 <b>{String(tier.threshold || 0)}</b> 人，可获 {String(tier.rewardName || '专属奖励')}</span></div>)}</div><p className="mkt-card-note">最终奖励以机构审核为准。</p></MarketingCard> : null}
          {sellingPoints.length ? <MarketingCard title="活动亮点" icon={<ThunderboltOutlined />}><div className="mkt-points">{sellingPoints.map((point) => <p key={point}><i />{point}</p>)}</div></MarketingCard> : null}
          <MarketingCard title="活动详情"><div className="mkt-info-grid"><Info label="活动日期" value={dateRange(view.activityStartDate, view.activityEndDate)} /><Info label="报名时间" value={dateRange(view.enrollStartTime, view.enrollEndTime)} /></div>{view.detailText ? <p className="mkt-longtext">{view.detailText}</p> : null}</MarketingCard>
          {view.noticeText ? <MarketingCard title="报名须知"><p className="mkt-longtext">{view.noticeText}</p></MarketingCard> : null}
        </main>
        <aside>
          <section className="mkt-side-card"><h3>校区信息</h3><strong>{view.campusNameText || view.organizationName || '活动校区'}</strong>{view.contactName ? <p>联系人：{view.contactName}</p> : null}{view.address ? <p><EnvironmentOutlined /> {view.address}</p> : null}{view.contactPhone ? <a href={`tel:${view.contactPhone}`}><PhoneOutlined /> {view.contactPhone}</a> : null}</section>
          <section className={pendingPaymentId ? 'mkt-action-card is-pending' : 'mkt-action-card'}>
            <span>{view.organizationName ? `由 ${view.organizationName} 提供` : '云效课时活动'}</span>
            {pendingPaymentId ? <>
              <div className="mkt-pending-note"><ClockCircleOutlined /><div><strong>报名已提交，等待支付</strong><small>{pendingEnrollment ? pendingTimeText(pendingEnrollment) : '请在 15 分钟内完成支付'}</small></div></div>
              <Button size="large" type="primary" block icon={<QrcodeOutlined />} loading={paymentBusy || checkingPayment} onClick={() => void continuePayment()}>前往小程序支付</Button>
              <Button block icon={<ReloadOutlined />} loading={checkingPayment} onClick={() => void checkPaymentStatus()}>刷新支付状态</Button>
            </> : enrolled ? <>
              <Button size="large" type="primary" block icon={<CheckCircleOutlined />} onClick={() => navigate('/my-enrollments')}>查看我的报名</Button>
              {view.referralEnabled && view.myEnrollment?.shareCode ? <Button size="large" block icon={<GiftOutlined />} onClick={() => navigate(`/my-referral/${view.shareCode}`)}>我的推广</Button> : null}
            </> : <Button size="large" type="primary" block disabled={!view.enrollable} onClick={() => setSheetOpen(true)}>{view.enrollable ? (view.payMode === 'PAID' ? '立即支付' : '立即报名') : (view.unenrollableReason || '暂不可报名')}</Button>}
            <Button size="large" block icon={<ShareAltOutlined />} onClick={share}>分享活动</Button>
          </section>
        </aside>
      </div>
      <Modal open={sheetOpen} title="填写报名信息" okText="确认报名" cancelText="取消" confirmLoading={submitting} onOk={() => void enroll()} onCancel={() => setSheetOpen(false)} width={620}>
        <p className="mkt-form-intro">请填写真实信息，机构会通过已绑定手机号与你联系。</p>
        <Form form={form} layout="vertical"><Form.Item name="studentName" label="学员姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }]}><Input maxLength={20} /></Form.Item>{view.signupMode === 'SESSION' ? <Form.Item name="sessionId" label="选择场次" rules={[{ required: true, message: '请选择场次' }]}><Select options={(view.sessions || []).map((session) => ({ value: session.id, label: sessionLabel(session), disabled: session.unavailable }))} /></Form.Item> : null}{fields.gender ? <Form.Item name="gender" label="性别" rules={[{ required: true }]}><Select options={[{ value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]} /></Form.Item> : null}{fields.birthDate ? <Form.Item name="birthDate" label="出生日期" rules={[{ required: true }]}><BusinessDatePicker maxDate={new Date().toISOString().slice(0, 10)} /></Form.Item> : null}{fields.levelText ? <Form.Item name="levelText" label="已有基础"><Input maxLength={40} placeholder="例如：零基础" /></Form.Item> : null}{fields.intentSlots ? <Form.Item name="intentSlots" label="意向时段"><Input maxLength={200} placeholder="例如：周六上午" /></Form.Item> : null}{fields.remark ? <Form.Item name="remark" label="备注（选填）"><Input.TextArea rows={3} maxLength={200} showCount /></Form.Item> : null}</Form>
      </Modal>
      <Modal open={Boolean(successKind)} footer={null} onCancel={() => setSuccessKind('')} closable={!paymentBusy && !checkingPayment} maskClosable={!paymentBusy && !checkingPayment}>
        <Result
          status={successKind === 'pending' ? 'info' : 'success'}
          title={successKind === 'paid' ? '支付成功' : successKind === 'pending' ? '报名已提交' : '报名成功'}
          subTitle={successKind === 'paid' ? '支付状态已确认，报名名额已生效。' : successKind === 'pending' ? '名额已暂时保留，请在 15 分钟内完成支付，超时会自动释放。' : '机构会通过你绑定的手机号与你联系。'}
          extra={<>{successKind === 'pending' ? <Button type="primary" icon={<QrcodeOutlined />} loading={paymentBusy || checkingPayment} onClick={() => void continuePayment(pendingPaymentId)}>前往小程序支付</Button> : null}<Button onClick={() => navigate('/my-enrollments')}>查看我的报名</Button>{successKind !== 'pending' ? <Button onClick={share}>分享给好友</Button> : null}</>}
        />
      </Modal>
      <Modal className="mkt-pay-guide-modal" open={payGuideOpen} title="在微信小程序中继续支付" onCancel={() => setPayGuideOpen(false)} footer={<><Button onClick={() => setPayGuideOpen(false)}>稍后支付</Button><Button type="primary" icon={<ReloadOutlined />} loading={checkingPayment} onClick={() => void checkPaymentStatus()}>我已完成支付</Button></>}>
        <div className="mkt-pay-guide">
          <div className="mkt-pay-code">{payCodeUrl ? <img src={payCodeUrl} alt="活动小程序码" /> : <div className={payGuideError ? 'is-error' : ''}><QrcodeOutlined /><strong>{payGuideError || '正在生成活动小程序码…'}</strong>{payGuideError ? <Button type="link" loading={paymentBusy} onClick={() => void openPayGuide()}>重新加载</Button> : null}</div>}</div>
          <h3>打开小程序，完成这笔报名支付</h3>
          <p>微信内可长按识别小程序码，电脑端请用当前报名账号的微信扫码。页面会自动识别待支付报名，不会重复占用名额。</p>
          <div className="mkt-pay-safe"><SafetyCertificateOutlined /><span><strong>不会创建重复报名</strong><small>桌面端仅打开已有报名，支付状态会在本页自动刷新</small></span></div>
        </div>
      </Modal>
    </MarketingFrame>
  )
}

export function MarketingFrame({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return <div className="mkt-page"><header className="mkt-top"><button type="button" onClick={() => navigate('/parent/home')}><span>云</span><div><strong>云效课时</strong><small>家长活动中心</small></div></button><nav><Button type="text" onClick={() => navigate('/my-enrollments')}>我的报名</Button></nav></header><div className="mkt-body">{children}</div><footer className="mkt-footer">云效课时 · 活动信息由发布机构提供</footer></div>
}

function MarketingCard(props: { title: string; icon?: React.ReactNode; children: React.ReactNode }) { return <section className="mkt-card"><h2>{props.icon ? <span>{props.icon}</span> : null}{props.title}</h2>{props.children}</section> }
function Info({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value || '未设置'}</strong></div> }
function jsonList(value?: string) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [] } catch { return [] } }
function jsonObjects(value?: string): Array<Record<string, unknown>> { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
function jsonObject(value?: string): Record<string, unknown> { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} } }
function dateRange(start?: string, end?: string) { const left = start?.replace('T', ' ').slice(0, 16) || ''; const right = end?.replace('T', ' ').slice(0, 16) || ''; return left && right ? `${left} 至 ${right}` : left || right || '时间待定' }
function playLabel(value?: string) { return value === 'REFERRAL' ? '邀请有礼' : value === 'GROUP_BUY' ? '超值拼团' : value === 'TRIAL' ? '体验活动' : '精选活动' }
function sessionLabel(session: MarketingSession) { return `${session.sessionDate || ''} ${String(session.startTime || '').slice(0, 5)}–${String(session.endTime || '').slice(0, 5)} ${session.classroomText || ''} ${session.remainingQuota == null ? '' : `余 ${session.remainingQuota}`}`.trim() }
function pendingTimeText(enrollment: MarketingEnrollment) {
  const createdAt = enrollment.createTime ? new Date(enrollment.createTime).getTime() : Number.NaN
  if (!Number.isFinite(createdAt)) return '请在 15 分钟内完成支付'
  const minutes = Math.max(1, Math.ceil((createdAt + 15 * 60 * 1000 - Date.now()) / 60000))
  return `名额预计保留 ${minutes} 分钟，请尽快完成支付`
}
