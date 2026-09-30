import { Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { postJson } from '../api/biz'
import { PageHead, money, tell, useShell } from './kit'

interface Plan {
  id: string
  name: string
  price?: number
  desc?: string
  benefitLines?: string[]
  termOptions?: Array<{ years: number; label: string; price?: number }>
  upgradeEligible?: boolean
  upgradeOptions?: Array<{ mode: string; label: string; amount?: number; description?: string }>
  organizationLimit?: number
  campusLimit?: number
  studentLimitPerCampus?: number
}

interface Overview {
  currentStatus?: string
  accessExpireDate?: string
  currentPlanId?: string
  remainingDays?: number
  plans?: Plan[]
  addonAvailable?: boolean
  addonPrices?: Array<{ capacityIncrement: number; price?: number; totalPrice?: number; label?: string }>
  campusCapacities?: Array<{ campusId: number; campusName?: string; orgName?: string; baseCapacity?: number; extraCapacity?: number; totalCapacity?: number }>
}

function membershipStatusText(status?: string, planName?: string): string {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return '未开通'
  if (value === 'expired') return '服务已到期'
  if (value === 'trial') return '试用中'
  if (value === 'active') return planName ? `${planName}使用中` : '使用中'
  return status || '未开通'
}

export function MembershipPage() {
  const shell = useShell()
  const [data, setData] = useState<Overview | null>(null)
  const [planId, setPlanId] = useState('')

  async function load() {
    const overview = await postJson<Overview>('/auth/membership/overview', {})
    setData(overview)
    setPlanId(overview.currentPlanId || overview.plans?.[0]?.id || '')
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '会员信息加载失败')))
  }, [shell.currentOrgId])

  const plan = data?.plans?.find((item) => item.id === planId)
  const currentPlan = data?.plans?.find((item) => item.id === data.currentPlanId)
  return (
    <section>
      <PageHead title="会员续费与升级" extra="这里只查看套餐、有效期和校区容量。微信支付请在小程序会员页完成。" />
      <section className="work-card">
        <div className="stat-line">
          <span>状态<strong>{membershipStatusText(data?.currentStatus, currentPlan?.name)}</strong></span>
          <span>有效期<strong>{String(data?.accessExpireDate || '').slice(0, 10) || '无'}</strong></span>
          <span>剩余<strong>{data?.remainingDays ?? 0} 天</strong></span>
        </div>
        <div className="shortcut-grid">
          {(data?.plans || []).map((item) => (
            <button key={item.id} type="button" className={item.id === planId ? 'shortcut-card is-current' : 'shortcut-card'} onClick={() => setPlanId(item.id)}>
              <strong>{item.name} {item.id === data?.currentPlanId ? '· 当前' : ''}</strong>
              <span>{money(item.price)} 元 · {item.desc}</span>
              <span>机构 {item.organizationLimit || '-'} / 校区 {item.campusLimit || '-'} / 每校区学员 {item.studentLimitPerCampus || '-'}</span>
            </button>
          ))}
        </div>
        {plan?.benefitLines?.length ? <ul>{plan.benefitLines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
        <h3>{plan?.upgradeEligible ? '升级报价' : '续费年限'}</h3>
        {plan?.upgradeEligible ? (
          <ul>
            {(plan.upgradeOptions || []).map((item) => <li key={item.mode}>{item.label} {money(item.amount)} 元{item.description ? ` · ${item.description}` : ''}</li>)}
            {!plan.upgradeOptions?.length ? <li>升级报价暂不可用</li> : null}
          </ul>
        ) : (
          <ul>
            {(plan?.termOptions?.length ? plan.termOptions : [{ years: 1, label: '1 年' }, { years: 2, label: '2 年' }, { years: 3, label: '3 年' }]).map((item) => <li key={item.years}>{item.label}{item.price != null ? ` · ${money(item.price)} 元` : ''}</li>)}
          </ul>
        )}
        <p>暂不支持降级。续费、升级和扩容的微信支付请在小程序会员页完成。</p>
      </section>
      <section className="work-card">
        <h2>校区学员容量</h2>
        <Table
          rowKey="campusId"
          pagination={false}
          dataSource={data?.campusCapacities || []}
          locale={{ emptyText: data?.addonAvailable ? '暂无校区容量' : '请先开通有效会员' }}
          columns={[
            { title: '机构', dataIndex: 'orgName' },
            { title: '校区', dataIndex: 'campusName' },
            { title: '基础上限', dataIndex: 'baseCapacity' },
            { title: '已扩容', dataIndex: 'extraCapacity' },
            { title: '总容量', dataIndex: 'totalCapacity' },
          ]}
        />
        {data?.addonAvailable && data.addonPrices?.length ? (
          <p>扩容档位：{data.addonPrices.map((item) => `${item.label || `${item.capacityIncrement}人`} ${money(item.totalPrice)}元`).join('，')}</p>
        ) : null}
      </section>
    </section>
  )
}
