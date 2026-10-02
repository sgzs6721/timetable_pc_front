import { Button, Form, Input, Modal, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { NeedCampus, PageHead, genderText, money, monthKey, periodChoices, type PeriodOption, tell, todayIso, useShell } from './kit'

interface Staff {
  staffId: number
  staffName?: string
  gender?: string
  roleLabel?: string
  scheduleCount?: number
  trialScheduleCount?: number
  teachingHours?: number
  payableHours?: number
  totalSalary?: number
  fixedSalaryTotal?: number
  unitSalaryTotal?: number
  trialSalaryTotal?: number
  rewardPenaltyTotal?: number
  payoutStatus?: number
  warningText?: string
  campusDetails?: Array<{ campusName?: string; itemDetails?: Array<Record<string, unknown>> }>
}

interface Summary {
  month?: string
  cycleStartDate?: string
  cycleEndDate?: string
  cycleRangeLabel?: string
  ownSalaryOnly?: boolean
  canManagePayoutStatus?: boolean
  totalSalary?: number
  staffCount?: number
  scheduleCount?: number
  trialScheduleCount?: number
  totalPayableHours?: number
  staffSummaries?: Staff[]
  periodOptions?: PeriodOption[]
}

export function SalaryPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [month, setMonth] = useState(monthKey())
  const [data, setData] = useState<Summary | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  async function load(next = month) {
    if (!shell.campusId) return
    const result = await getJson<Summary>('/salary/summary', { campusId: shell.campusId, month: next })
    setData(result)
    if (result?.month && result.month !== next) setMonth(result.month)
  }

  function openHours(row: Staff) {
    const name = String(row.staffName || '').trim()
    if (!name) {
      message.warning('缺少老师信息')
      return
    }
    if (!shell.campusId) {
      message.warning('请先选择校区')
      return
    }
    const start = String(data?.cycleStartDate || '').slice(0, 10)
    const end = String(data?.cycleEndDate || '').slice(0, 10)
    const query = new URLSearchParams({ teacherName: name })
    if (start && end) {
      query.set('timeMode', 'custom_range')
      query.set('startDate', start)
      query.set('endDate', end)
    } else if (month) {
      query.set('timeMode', 'salary_cycle')
      query.set('month', month)
    } else {
      message.warning('请先选择核算周期')
      return
    }
    navigate(`/hours?${query.toString()}`)
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '工资汇总加载失败')))
  }, [shell.campusId, month])

  const mine = data?.ownSalaryOnly
  const people = data?.staffSummaries || []
  const paidPeople = people.filter((row) => row.payoutStatus === 1)
  const paidTotal = paidPeople.reduce((total, row) => total + Number(row.totalSalary || 0), 0)
  const pendingTotal = Math.max(Number(data?.totalSalary || 0) - paidTotal, 0)
  const trialPeople = people.filter((row) => Number(row.trialScheduleCount || 0) > 0).length
  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead title={mine ? '我的工资' : '工资管理'} extra={data?.cycleRangeLabel || '按记薪周期汇总。没有管理权时只看自己的工资。'}>
        <Select
          style={{ minWidth: 280 }}
          value={month}
          onChange={setMonth}
          options={periodChoices(data?.periodOptions, month, 'salary_cycle')}
        />
      </PageHead>
      <section className="work-card">
        <h2>工资明细</h2>
        {!people.length ? <p>{mine ? '本周期暂无您的工资记录。这里只显示您本人的工资，其他老师不会出现。' : '本周期暂无可核算人员。只有在校区工资设置里配好工资项的老师，才会出现在这里。'}</p> : (
          <div className="stat-line is-metrics salary-metrics">
            <span>应发工资<strong>{money(data?.totalSalary)}<small>元</small></strong><em>固定项/单价项/奖惩</em></span>
            <span>已发工资<strong>{money(paidTotal)}<small>元</small></strong><em>{paidPeople.length} 人已发放</em></span>
            <span>待发工资<strong>{money(pendingTotal)}<small>元</small></strong><em>{people.length - paidPeople.length} 人待发放</em></span>
            <span>折算课时<strong>{money(data?.totalPayableHours)}<small>小时</small></strong><em>已按体验比例折算</em></span>
            <span>核算人数<strong>{data?.staffCount || people.length}<small>人</small></strong><em>共 {data?.scheduleCount || 0} 课时</em></span>
            <span>体验人数<strong>{trialPeople}<small>人</small></strong><em>体验 {data?.trialScheduleCount || 0} 课时</em></span>
          </div>
        )}
        {people.length ? <Table
          rowKey="staffId"
          dataSource={people}
          pagination={false}
          columns={[
            { title: '老师', render: (_: unknown, row: Staff) => (
              <div>
                <div>{[row.staffName, genderText(row.gender), row.roleLabel].filter(Boolean).join(' · ')}</div>
                <div className="range-label">{row.scheduleCount || 0} 课时 / 体验 {row.trialScheduleCount || 0} 课时 · {hoursSummary(row)}</div>
                {row.warningText ? <div className="range-label">{row.warningText}</div> : null}
              </div>
            ) },
            { title: '固定项', render: (_: unknown, row: Staff) => money(row.fixedSalaryTotal) },
            { title: '单价项', render: (_: unknown, row: Staff) => money(row.unitSalaryTotal) },
            { title: '体验课工资', render: (_: unknown, row: Staff) => money(row.trialSalaryTotal) },
            { title: '奖惩合计', render: (_: unknown, row: Staff) => money(row.rewardPenaltyTotal) },
            { title: '应发', render: (_: unknown, row: Staff) => money(row.totalSalary) },
            { title: '发放', render: (_: unknown, row: Staff) => <span className={row.payoutStatus === 1 ? 'status-pill is-ok' : 'status-pill is-warn'}>{row.payoutStatus === 1 ? '已发' : '应发'}</span> },
            { title: '', render: (_: unknown, row: Staff) => (
              <>
                <Button type="link" onClick={() => setOpenId(openId === row.staffId ? null : row.staffId)}>明细</Button>
                <Button type="link" onClick={() => openHours(row)}>课时</Button>
              </>
            ) },
          ]}
        /> : null}
        {people.filter((row) => row.staffId === openId).map((row) => {
          const details = row.campusDetails || []
          const multiCampus = details.length > 1
          const items = details.flatMap((detail) => (detail.itemDetails || []).map((item) => ({ ...item, campusName: detail.campusName })))
          return (
          <div key={row.staffId} style={{ marginTop: 12 }}>
            <Table
              rowKey={(item) => `${item.campusName || ''}-${item.salaryItemId}`}
              pagination={false}
              dataSource={items}
              columns={[
                ...(multiCampus ? [{ title: '校区', dataIndex: 'campusName' }] : []),
                { title: '工资项', render: (_: unknown, item: Record<string, unknown>) => <span>{String(item.salaryItemName || '未命名工资项')}<br /><span className="range-label">{itemMeta(item.itemType)}</span></span> },
                { title: '数量', render: (_: unknown, item: Record<string, unknown>) => quantityText(item.itemType, item.quantity) },
                { title: '配置', render: (_: unknown, item: Record<string, unknown>) => money(item.configuredAmount) },
                { title: '核算', render: (_: unknown, item: Record<string, unknown>) => money(item.calculatedAmount) },
              ]}
            />
            {data?.canManagePayoutStatus ? (
              <Form
                key={`${row.staffId}-${row.payoutStatus}`}
                layout="inline"
                style={{ marginTop: 12 }}
                initialValues={{ status: row.payoutStatus || 0, paymentDate: todayIso() }}
                onFinish={async (values: { status: number; paymentType?: number; paymentDate?: string; paymentRemark?: string }) => {
                  if (!data?.canManagePayoutStatus) {
                    message.warning('仅管理员可更新发放状态')
                    return
                  }
                  const paid = Number(values.status) === 1
                  if (!shell.campusId || !row.staffId || !month) {
                    message.warning('缺少工资记录信息')
                    return
                  }
                  if (!paid) {
                    const confirmed = await new Promise<boolean>((resolve) => {
                      Modal.confirm({
                        title: '确认改回应发',
                        content: `确认将${row.staffName || '该老师'}本周期工资改回应发吗？`,
                        onOk: () => resolve(true),
                        onCancel: () => resolve(false),
                      })
                    })
                    if (!confirmed) return
                  }
                  if (paid && !values.paymentType) {
                    message.warning('请选择支付方式')
                    return
                  }
                  if (paid && !values.paymentDate) {
                    message.warning('请选择发放日期')
                    return
                  }
                  if (paid) {
                    const confirmed = await new Promise<boolean>((resolve) => {
                      Modal.confirm({
                        title: '确认标记已发',
                        content: `确认将${row.staffName || '该老师'}本周期工资标记为已发吗？`,
                        onOk: () => resolve(true),
                        onCancel: () => resolve(false),
                      })
                    })
                    if (!confirmed) return
                  }
                  try {
                    await putJson('/salary/cycle-record/status', {
                      campusId: shell.campusId,
                      staffId: row.staffId,
                      month,
                      status: values.status,
                      paymentType: paid ? Number(values.paymentType) : undefined,
                      paymentDate: paid ? values.paymentDate : undefined,
                      paymentRemark: paid ? String(values.paymentRemark || '').trim() : undefined,
                    })
                    message.success(paid ? '已标记为已发' : '已改回应发')
                    await load()
                  } catch (error) {
                    message.error(tell(error, '保存失败'))
                  }
                }}
              >
                <Form.Item name="status"><Select options={[{ value: 0, label: '应发' }, { value: 1, label: '已发' }]} /></Form.Item>
                <Form.Item name="paymentDate"><BusinessDatePicker /></Form.Item>
                <Form.Item name="paymentType"><Select style={{ width: 120 }} placeholder="支付方式" options={[{ value: 1, label: '支付宝' }, { value: 2, label: '微信' }, { value: 3, label: '银行卡' }, { value: 4, label: '公户' }, { value: 5, label: '现金' }]} /></Form.Item>
                <Form.Item name="paymentRemark"><Input placeholder="支付账户或流水号" /></Form.Item>
                <Button htmlType="submit">记录发放</Button>
              </Form>
            ) : null}
          </div>
          )
        })}
      </section>
    </NeedCampus>
  )
}

function hoursSummary(row: Staff): string {
  const teaching = money(row.teachingHours)
  const payable = money(row.payableHours)
  if (teaching === payable) return `共计 ${teaching}h`
  return `共计 ${teaching}h · 折算 ${payable}h`
}

function itemMeta(itemType: unknown): string {
  const normalized = String(itemType || 'fixed').trim().toLowerCase()
  if (normalized === 'unit') return '单价项'
  if (normalized === 'reward') return '奖励项'
  if (normalized === 'penalty') return '处罚项'
  return '固定项'
}

function quantityText(itemType: unknown, quantity: unknown): string {
  if (String(itemType || 'fixed').trim().toLowerCase() !== 'unit') return '--'
  return `${money(quantity)}h`
}
