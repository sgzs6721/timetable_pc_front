import { CalendarOutlined, CheckOutlined, CrownOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Modal, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { postJson } from '../api/biz'
import { PageHead, money, tell, useShell } from './kit'
import { MembershipPaymentModal, type MembershipPaymentIntent } from './membership-payment'

interface TermOption {
  years: number
  label: string
  price?: number
}

interface UpgradeOption {
  mode: string
  label: string
  amount?: number
  chargeDays?: number
  effectiveFrom?: string
  effectiveTo?: string
  description?: string
  validityText?: string
}

interface Plan {
  id: string
  name: string
  price?: number
  desc?: string
  tag?: string
  benefitLines?: string[]
  termOptions?: TermOption[]
  upgradeEligible?: boolean
  upgradeOptions?: UpgradeOption[]
  organizationLimit?: number
  campusLimit?: number
  studentLimitPerCampus?: number
  planRank?: number
}

interface AddonPrice {
  capacityIncrement: number
  price?: number
  totalPrice?: number
  label?: string
}

interface CampusCapacity {
  orgId?: number
  orgName?: string
  campusId: number
  campusName?: string
  visibleInList?: boolean | number | string
  baseCapacity?: number
  extraCapacity?: number
  totalCapacity?: number
}

interface Overview {
  currentStatus?: string
  accessExpireDate?: string
  currentPlanId?: string
  remainingDays?: number
  plans?: Plan[]
  addonAvailable?: boolean
  addonBillingYears?: number
  addonEffectiveTo?: string
  addonPrices?: AddonPrice[]
  campusCapacities?: CampusCapacity[]
}

const PLAN_RANK: Record<string, number> = { year: 1, excellence: 2, navigator: 3 }
const UPGRADE_OPTION_LABELS: Record<string, string> = {
  remaining_period: '按剩余有效期补差价',
  one_cycle: '至少补一个周期差价',
}

function decorateUpgradeOption(option: UpgradeOption): UpgradeOption {
  const from = String(option.effectiveFrom || '').slice(0, 10)
  const to = String(option.effectiveTo || '').slice(0, 10)
  const days = Number(option.chargeDays || 0)
  const validityText = from && to
    ? `${from} 至 ${to}${days > 0 ? `（${days}天）` : ''}`
    : (option.validityText || '')
  return {
    ...option,
    label: UPGRADE_OPTION_LABELS[option.mode] || option.label || '升级补差价',
    validityText,
  }
}

function membershipStatusText(status?: string, planName?: string): string {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return '未开通'
  if (value === 'expired') return '服务已到期'
  if (value === 'trial') return '试用中'
  if (value === 'active') return planName ? `${planName}使用中` : '使用中'
  return status || '未开通'
}

function rankOf(plan?: Plan): number {
  if (!plan) return 0
  if (Number(plan.planRank) > 0) return Number(plan.planRank)
  return PLAN_RANK[String(plan.id || '').trim().toLowerCase()] || 0
}

function campusOnline(value: CampusCapacity['visibleInList']): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized !== '0' && normalized !== 'false'
  }
  return value !== false && value !== 0
}

function termPrice(plan: Plan | undefined, years: number): number | undefined {
  const matched = plan?.termOptions?.find((item) => Number(item.years) === years)
  if (matched?.price != null) return Number(matched.price)
  if (plan?.price == null) return undefined
  return Number(plan.price) * years
}

function upgradeStartingPrice(plan: Plan): number | undefined {
  const amounts = (plan.upgradeOptions || [])
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount) && amount >= 0)
  if (amounts.length) return Math.min(...amounts)
  return plan.price == null ? undefined : Number(plan.price)
}

export function MembershipPage() {
  const shell = useShell()
  const [data, setData] = useState<Overview | null>(null)
  const [planId, setPlanId] = useState('')
  const [showLower, setShowLower] = useState(false)
  const [upgradeMode, setUpgradeMode] = useState('')
  const [termYears, setTermYears] = useState(1)
  const [addons, setAddons] = useState<Record<number, number>>({})
  const [openOrgs, setOpenOrgs] = useState<Record<string, boolean>>({})
  const [paymentIntent, setPaymentIntent] = useState<MembershipPaymentIntent | null>(null)

  async function load() {
    const overview = await postJson<Overview>('/auth/membership/overview', {})
    setData(overview)
    const current = overview.currentPlanId || ''
    const first = (overview.plans || []).find((item) => !current || rankOf(item) >= rankOf(overview.plans?.find((plan) => plan.id === current)))
    setPlanId(current || first?.id || overview.plans?.[0]?.id || '')
    setUpgradeMode('')
    setTermYears(1)
    setAddons({})
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '会员信息加载失败')))
  }, [shell.currentOrgId])

  const currentPlan = data?.plans?.find((item) => item.id === data.currentPlanId)
  const currentRank = rankOf(currentPlan)
  const plans = useMemo(() => (data?.plans || []).map((item) => {
    const rank = rankOf(item)
    return {
      ...item,
      unavailable: !!data?.currentPlanId && rank > 0 && rank < currentRank,
      upgradeTarget: !!data?.currentPlanId && rank > currentRank,
    }
  }), [data, currentRank])
  const visiblePlans = plans.filter((item) => showLower || !item.unavailable)
  const plan = plans.find((item) => item.id === planId)
  const upgradeOptions = plan?.upgradeTarget
    ? (plan.upgradeOptions || []).map(decorateUpgradeOption)
    : []
  const selectedUpgrade = upgradeOptions.find((item) => item.mode === upgradeMode) || upgradeOptions[0]
  const quoted = plan?.upgradeTarget ? selectedUpgrade?.amount : termPrice(plan, termYears)
  const years = Number(data?.addonBillingYears || 1)
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; campuses: CampusCapacity[] }>()
    ;(data?.campusCapacities || []).forEach((item) => {
      const id = String(item.orgId || item.orgName || 'org')
      const group = map.get(id) || { id, name: item.orgName || '机构', campuses: [] }
      group.campuses.push(item)
      map.set(id, group)
    })
    return Array.from(map.values())
  }, [data])
  const selectedAddons = (data?.campusCapacities || []).filter((item) => addons[item.campusId] > 0)
  const addonTotal = selectedAddons.reduce((sum, item) => {
    const price = (data?.addonPrices || []).find((entry) => entry.capacityIncrement === addons[item.campusId])
    return sum + Number(price?.totalPrice ?? price?.price ?? 0)
  }, 0)

  function choosePlan(next: typeof plans[number]) {
    if (next.unavailable) {
      message.warning('暂不支持降级套餐')
      return
    }
    if (next.upgradeTarget && !(next.upgradeOptions || []).length) {
      message.warning('升级报价暂不可用')
      return
    }
    setPlanId(next.id)
    setUpgradeMode(next.upgradeOptions?.[0]?.mode || '')
    setTermYears(1)
  }

  function chooseIncrement(campusId: number, increment: number) {
    if (!data?.addonAvailable) return
    setAddons((current) => ({ ...current, [campusId]: current[campusId] === increment ? 0 : increment }))
  }

  const purchaseLabel = plan?.upgradeTarget ? '立即升级' : (data?.currentPlanId ? '立即续费' : '立即购买')
  const openPayment = () => {
    if (!plan) {
      message.warning('请选择套餐')
      return
    }
    if (plan.unavailable || (plan.upgradeTarget && !selectedUpgrade)) return
    setPaymentIntent({
      kind: 'membership',
      title: `${plan.upgradeTarget ? '升级' : (data?.currentPlanId ? '续费' : '购买')} · ${plan.name}`,
      amount: quoted,
      payload: {
        planId: plan.id,
        termYears: plan.upgradeTarget ? undefined : termYears,
        upgradeMode: plan.upgradeTarget ? selectedUpgrade?.mode : undefined,
      },
    })
  }

  return (
    <section className="membership-page">
      <PageHead title="会员中心" extra="管理机构套餐、续费升级与学员容量" />
      <section className="membership-hero">
        <div className="membership-hero-copy">
          <span className="membership-hero-icon"><CrownOutlined /></span>
          <div>
            <span className="membership-eyebrow">CURRENT MEMBERSHIP</span>
            <h2>{currentPlan?.name || '暂未开通会员'}</h2>
            <p><i />{membershipStatusText(data?.currentStatus, currentPlan?.name)}</p>
          </div>
        </div>
        <div className="membership-hero-metrics">
          <div><CalendarOutlined /><span>有效期至</span><strong>{String(data?.accessExpireDate || '').slice(0, 10) || '尚未开通'}</strong></div>
          <div><SafetyCertificateOutlined /><span>剩余有效期</span><strong>{data?.remainingDays ?? 0}<small>天</small></strong></div>
          <div><TeamOutlined /><span>每校区容量</span><strong>{currentPlan?.studentLimitPerCampus || '-'}<small>人</small></strong></div>
        </div>
      </section>
      <div className="membership-workspace">
          <section className="membership-panel membership-plans-panel">
            <header className="membership-section-head">
              <div><h2>会员套餐</h2><p>选择适合机构规模的方案</p></div>
              {plans.some((item) => item.unavailable) ? <Button type="link" onClick={() => setShowLower((open) => !open)}>{showLower ? '收起低阶套餐' : '查看全部套餐'}</Button> : null}
            </header>
            <div className="membership-plan-grid">
              {visiblePlans.map((item) => {
                const upgradePrice = item.id === planId ? (selectedUpgrade?.amount ?? upgradeStartingPrice(item)) : upgradeStartingPrice(item)
                return <button key={item.id} type="button" disabled={item.unavailable} className={`membership-plan-card${item.id === planId ? ' is-selected' : ''}${item.unavailable ? ' is-disabled' : ''}`} onClick={() => choosePlan(item)}>
                  <span className="membership-plan-topline">
                    <em>{item.id === data?.currentPlanId ? '当前套餐' : item.upgradeTarget ? '可升级' : item.tag || '会员套餐'}</em>
                    {item.id === planId ? <i><CheckOutlined /></i> : null}
                  </span>
                  <strong>{item.name}</strong>
                  <span className="membership-plan-price"><b>¥</b>{item.upgradeTarget ? (upgradePrice == null ? '—' : money(upgradePrice)) : money(item.price)}<small>{item.upgradeTarget ? '补差价起' : '/ 年起'}</small></span>
                  <span className="membership-plan-desc">{item.desc || '满足日常教务与校区管理需求'}</span>
                  <span className="membership-plan-limits"><span>{item.organizationLimit || '-'}<small>机构</small></span><span>{item.campusLimit || '-'}<small>校区</small></span><span>{item.studentLimitPerCampus || '-'}<small>学员/校区</small></span></span>
                </button>
              })}
              <div className="membership-purchase-grid">
              <div className="membership-benefits">
                <h3><SafetyCertificateOutlined /> 订单结算</h3>
                {plan?.benefitLines?.length ? <ul>{plan.benefitLines.map((line) => <li key={line}><CheckOutlined /><strong>{plan.name}</strong><span>{line}</span></li>)}</ul> : <p>选择套餐后查看订单信息</p>}
              </div>
              <div className="membership-checkout">
                {plan?.upgradeTarget ? <>
                  <div className="membership-checkout-head"><div><span>升级方式</span><strong>{upgradeOptions.length > 1 ? '报价不同是因升级有效期不同' : '确认升级权益有效期'}</strong></div></div>
                {!upgradeOptions.length ? <p>升级报价暂不可用</p> : (
                  <div className="membership-upgrade-options">
                    {upgradeOptions.map((item) => (
                      <button key={item.mode} type="button" className={(selectedUpgrade?.mode === item.mode) ? 'is-on' : ''} onClick={() => setUpgradeMode(item.mode)}>
                        <span>{item.label}</span><strong>¥{money(item.amount)}</strong><small>有效期：{item.validityText || '支付成功后立即生效'}</small>
                      </button>
                    ))}
                  </div>
                )}
                </> : <>
                  <div className="membership-checkout-head"><div><span>购买时长</span><strong>最长可一次购买 3 年</strong></div></div>
                  <div className="membership-term-stepper">
                    <Button disabled={termYears <= 1} onClick={() => setTermYears((value) => Math.max(1, value - 1))}>－</Button>
                    <div><strong>{termYears * 12}</strong><span>个月</span></div>
                    <Button disabled={termYears >= 3} onClick={() => setTermYears((value) => Math.min(3, value + 1))}>＋</Button>
                  </div>
                </>}
                <div className="membership-order-summary">
                  <div><span>套餐方案</span><strong>{plan?.name || '待选择'}</strong></div>
                  <div><span>业务类型</span><strong>{plan?.upgradeTarget ? '套餐升级' : (data?.currentPlanId ? '会员续费' : '新购会员')}</strong></div>
                  <div><span>服务期限</span><strong>{plan?.upgradeTarget ? (selectedUpgrade?.validityText || '待确认') : `${termYears * 12} 个月`}</strong></div>
                  <div><span>权益范围</span><strong>{plan ? `${plan.organizationLimit || '-'}机构 · ${plan.campusLimit || '-'}校区 · ${plan.studentLimitPerCampus || '-'}人/校区` : '待选择'}</strong></div>
                </div>
                <div className="membership-total"><span>{plan?.upgradeTarget ? '升级补差价' : (data?.currentPlanId ? '续费金额' : '购买金额')}</span><strong>{quoted == null ? '待确认' : `¥${money(quoted)}`}</strong></div>
                <Button className="membership-pay-button" type="primary" size="large" onClick={openPayment}>{purchaseLabel}</Button>
                <small className="membership-secure-note"><SafetyCertificateOutlined /> 支付成功后权益自动生效</small>
              </div>
              </div>
            </div>
          </section>
          <section className="membership-panel membership-addon-panel">
            <header className="membership-section-head"><div><h2>学员扩容</h2><p>{data?.addonAvailable && data.addonEffectiveTo ? `有效期至 ${String(data.addonEffectiveTo).slice(0, 10)}，本次按${years}年计费` : '按校区增加容量，扩容有效期与会员一致'}</p></div></header>
            <div className="membership-addon-layout">
              <div className="membership-addon-operations">
                {!data?.addonAvailable ? <div className="membership-empty-note">开通有效会员后可购买学员扩容</div> : null}
                {data?.addonAvailable && !groups.length ? <div className="membership-empty-note">暂无可扩容校区</div> : null}
                {groups.map((group) => {
              const open = openOrgs[group.id] !== false
              const online = group.campuses.filter((item) => campusOnline(item.visibleInList)).length
              const picked = group.campuses.filter((item) => addons[item.campusId] > 0).length
              return (
                <div key={group.id} className="membership-addon-group">
                  <button type="button" className="membership-addon-group-head" onClick={() => setOpenOrgs((current) => ({ ...current, [group.id]: !open }))}>
                    <span><strong>{group.name}</strong><small>{group.campuses.length} 个校区 · {online} 个已上线 · {group.campuses.length - online} 个未上线</small></span><em>{picked ? `已选 ${picked} 个` : ''} {open ? '收起' : '展开'}</em>
                  </button>
                  {open ? group.campuses.map((campus) => {
                    const increment = addons[campus.campusId] || 0
                    const projected = Number(campus.totalCapacity || 0) + increment
                    return (
                      <div key={campus.campusId} className="membership-campus-row">
                        <div><strong>{campus.campusName}</strong><span>{campusOnline(campus.visibleInList) ? '已上线' : '未上线'} · 当前 {campus.totalCapacity || 0} 人 · 扩容后 {projected} 人{campus.extraCapacity ? ` · 已扩容 +${campus.extraCapacity}人` : ''}</span></div>
                        <div className="membership-capacity-options">
                          {(data?.addonPrices || []).map((price) => (
                            <button
                              key={price.capacityIncrement}
                              type="button"
                              disabled={!data?.addonAvailable}
                              className={increment === price.capacityIncrement ? 'is-on' : ''}
                              onClick={() => chooseIncrement(campus.campusId, price.capacityIncrement)}
                            >
                              +{price.capacityIncrement}人<small>¥{money(price.price)}/年 ×{years}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  }) : null}
                </div>
              )
                })}
              </div>
              <aside className="membership-addon-order">
                <header><SafetyCertificateOutlined /><div><h3>订单结算</h3><p>按所选校区汇总扩容费用</p></div></header>
                <div className="membership-addon-order-list">
                  {selectedAddons.length ? selectedAddons.map((campus) => {
                    const increment = addons[campus.campusId]
                    const quote = (data?.addonPrices || []).find((item) => item.capacityIncrement === increment)
                    return <div key={campus.campusId}><span><strong>{campus.campusName}</strong><small>扩容 +{increment} 人</small></span><em>¥{money(quote?.totalPrice ?? quote?.price)}</em></div>
                  }) : <p>在左侧选择校区和扩容人数后生成订单</p>}
                </div>
                <div className="membership-addon-order-meta"><span>扩容有效期<strong>{String(data?.addonEffectiveTo || '').slice(0, 10) || '待开通会员'}</strong></span><span>计费周期<strong>{years} 年</strong></span></div>
                <div className="membership-addon-checkout"><div><span>已选校区</span><strong>{selectedAddons.length ? `${selectedAddons.length} 个` : '尚未选择'}</strong></div><div><span>订单合计</span><strong>{selectedAddons.length ? `¥${money(addonTotal)}` : '—'}</strong></div><Button className="membership-addon-pay-button" type="primary" disabled={!data?.addonAvailable || !selectedAddons.length} onClick={() => {
              if (!data?.addonAvailable) {
                message.warning('开通有效会员后可购买学员扩容')
                return
              }
              if (!selectedAddons.length) {
                message.warning('请至少选择一个校区')
                return
              }
              const until = String(data.addonEffectiveTo || '').slice(0, 10)
              Modal.confirm({
                title: '确认学员扩容',
                content: `已选择${selectedAddons.length}个校区，扩容有效期至${until}，本次按${years}年计费，合计支付 ¥${money(addonTotal)}。`,
                okText: '确认购买',
                cancelText: '取消',
                onOk: () => setPaymentIntent({
                  kind: 'addon',
                  title: `学员扩容 · ${selectedAddons.length} 个校区`,
                  amount: addonTotal,
                  payload: {
                    items: selectedAddons.map((item) => ({
                      campusId: item.campusId,
                      capacityIncrement: addons[item.campusId],
                    })),
                  },
                }),
              })
                }}>购买扩容</Button></div>
              </aside>
            </div>
          </section>
      </div>
      <MembershipPaymentModal
        intent={paymentIntent}
        onClose={() => setPaymentIntent(null)}
        onPaid={async () => {
          await load()
          shell.reload()
        }}
      />
    </section>
  )
}
