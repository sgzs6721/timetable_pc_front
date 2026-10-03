import { CheckCircleOutlined, EyeOutlined, GiftOutlined, ShareAltOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Empty, Modal, Progress, Result, Skeleton, Tag, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { marketingPublicApi } from '../api/marketing-public'
import { MarketingFrame } from './MarketingLandingPage'
import type { MarketingEnrollment, MarketingReferral } from './marketing-public-model'

export function MarketingEnrollmentsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<MarketingEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  function load() { setLoading(true); setError(''); marketingPublicApi.enrollments().then(setRows).catch((reason) => setError(reason.message)).finally(() => setLoading(false)) }
  useEffect(load, [])
  function cancel(row: MarketingEnrollment) {
    Modal.confirm({ title: '取消这次报名？', content: '取消后名额会释放。已支付活动如需退款，请联系活动机构。', okText: '确认取消', okButtonProps: { danger: true }, cancelText: '保留报名', onOk: async () => { await marketingPublicApi.cancel(row.id); message.success('报名已取消'); load() } })
  }
  return <MarketingFrame><div className="mkt-my-head"><span><CheckCircleOutlined /></span><div><h1>我的报名</h1><p>查看活动状态、场次与报名结果</p></div></div>{loading ? <div className="mkt-loading"><Skeleton active paragraph={{ rows: 10 }} /></div> : error ? <div className="mkt-empty"><Result status="warning" title="暂时无法加载报名记录" subTitle={error} extra={<Button type="primary" onClick={load}>重新加载</Button>} /></div> : rows.length ? <div className="mkt-enrollment-grid">{rows.map((row) => { const cancelled = row.enrollStatus === 'CANCELLED'; const pending = !cancelled && row.payStatus === 'PENDING'; const canCancel = !cancelled && (!row.payStatus || row.payStatus === 'NONE'); const canPromote = !cancelled && Boolean(row.referralCode); return <article className={pending ? 'mkt-enrollment-card is-pending' : 'mkt-enrollment-card'} key={row.id}><header><Tag color={cancelled ? 'default' : row.payStatus === 'PAID' || row.payStatus === 'NONE' ? 'success' : 'warning'}>{cancelled ? '已取消' : payLabel(row.payStatus)}</Tag><span>{row.displayStatus || '活动'}</span></header><h2>{row.headline || '活动报名'}</h2><p>{row.campusNameText || '活动校区'}</p><div><span>学员</span><strong>{row.studentName || '未填写'}</strong></div>{row.sessionText ? <div><span>场次</span><strong>{row.sessionText}</strong></div> : null}<div><span>报名时间</span><strong>{row.createTime?.replace('T', ' ').slice(0, 16) || '—'}</strong></div><footer><Button type={pending ? 'primary' : 'default'} onClick={() => navigate(`/campaign/${row.shareCode}`)}>{pending ? '继续支付' : '查看活动'}</Button>{canPromote ? <Button icon={<GiftOutlined />} onClick={() => navigate(`/my-referral/${row.shareCode}`)}>我的推广</Button> : null}{canCancel ? <Button danger onClick={() => cancel(row)}>取消报名</Button> : null}</footer></article> })}</div> : <div className="mkt-empty"><Empty description="还没有报名记录，从机构分享的活动页完成报名后会显示在这里" /></div>}</MarketingFrame>
}

export function MarketingReferralPage() {
  const { shareCode = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<MarketingReferral | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { setLoading(true); setError(''); marketingPublicApi.referral(shareCode).then(setView).catch((reason) => setError(reason.message)).finally(() => setLoading(false)) }, [shareCode])
  const progress = useMemo(() => { const next = view?.tiers?.find((tier) => !tier.achieved)?.threshold || view?.validReferralCount || 1; return Math.min(100, Math.round(Number(view?.validReferralCount || 0) / Math.max(1, Number(next)) * 100)) }, [view])
  function share() {
    const url = `${window.location.origin}/campaign/${shareCode}?r=${encodeURIComponent(view?.referralCode || '')}`
    navigator.clipboard.writeText(url).then(() => message.success('专属推广链接已复制')).catch(() => message.error('复制失败'))
  }
  async function poster() {
    const result = await marketingPublicApi.poster(shareCode)
    if (result.imageUrl) Modal.info({ title: '推广海报小程序码', width: 440, content: <div className="mkt-poster-code"><img src={marketingPublicApi.assetUrl(result.imageUrl)} alt="活动推广小程序码" /><p>长按或下载后分享给好友</p></div> })
  }
  if (loading) return <MarketingFrame><div className="mkt-loading"><Skeleton active paragraph={{ rows: 12 }} /></div></MarketingFrame>
  if (error) return <MarketingFrame><div className="mkt-empty"><Result status="warning" title="暂时无法查看推广数据" subTitle={error} extra={<Button type="primary" onClick={() => navigate(`/campaign/${shareCode}`)}>返回活动</Button>} /></div></MarketingFrame>
  if (!view) return <MarketingFrame><div className="mkt-empty"><Empty description="暂时无法查看推广数据" /></div></MarketingFrame>
  return <MarketingFrame><div className="mkt-referral-hero"><div><Tag>邀请有礼</Tag><h1>{view.headline || '活动推广'}</h1><p>{view.campusNameText || '活动校区'} · {view.priceText || ''}</p></div><div><Button type="primary" size="large" icon={<ShareAltOutlined />} onClick={share}>复制专属链接</Button><Button size="large" onClick={() => navigate(`/campaign/${shareCode}`)}>查看活动</Button></div></div><section className="mkt-referral-stats"><div><EyeOutlined /><strong>{view.visitCount || 0}</strong><span>好友浏览</span></div><div><TeamOutlined /><strong>{view.validReferralCount || 0}</strong><span>有效报名</span></div><article><header><strong>邀请进度</strong><span>{progress}%</span></header><Progress percent={progress} showInfo={false} strokeColor="#315ff4" /><p>{view.nextTierText || '继续邀请好友，解锁更多奖励'}</p></article></section><div className="mkt-referral-grid"><ReferralCard title="奖励档位">{view.tiers?.length ? view.tiers.map((tier, index) => <div className={tier.achieved ? 'mkt-ref-row achieved' : 'mkt-ref-row'} key={`${tier.threshold}-${index}`}><span>{tier.achieved ? <CheckCircleOutlined /> : index + 1}</span><div><strong>邀请 {tier.threshold || 0} 人 · {tier.rewardName}</strong><small>{tier.statusText || (tier.achieved ? '已达成' : '进行中')}</small></div></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="机构暂未设置邀请奖励" />}</ReferralCard><ReferralCard title="我的奖励">{view.rewards?.length ? view.rewards.map((reward) => <div className="mkt-ref-row" key={reward.id}><span><GiftOutlined /></span><div><strong>{reward.rewardName}</strong><small>邀请 {reward.tierThreshold || 0} 人 · {reward.statusText}</small></div></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="达到档位后会显示在这里" />}</ReferralCard><ReferralCard title="邀请明细" wide>{view.invitees?.length ? view.invitees.map((invitee, index) => <div className="mkt-invite-row" key={`${invitee.studentName}-${index}`}><div><strong>{invitee.studentName || '好友学员'}</strong><small>{invitee.timeText || '—'}</small></div><Tag color={invitee.counted ? 'success' : 'default'}>{invitee.statusText || '已报名'}</Tag></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有好友通过你的链接报名" />}</ReferralCard></div><div className="mkt-referral-footer"><Button type="primary" size="large" onClick={() => void poster()}>生成推广海报</Button><span>最终奖励以机构审核为准</span></div></MarketingFrame>
}

function ReferralCard(props: { title: string; children: React.ReactNode; wide?: boolean }) { return <section className={props.wide ? 'mkt-ref-card wide' : 'mkt-ref-card'}><h2>{props.title}</h2>{props.children}</section> }
function payLabel(value?: string) { if (value === 'PAID') return '已支付'; if (value === 'PENDING') return '待支付'; if (value === 'REFUNDED') return '已退款'; if (value === 'NONE') return '报名成功'; return value || '报名成功' }
