import { Button, Form, Input, Modal, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, putJson } from '../api/biz'
import { NeedCampus, PageHead, money, monthKey, periodChoices, type PeriodOption, tell, useShell } from './kit'

interface Staff {
  staffId: number
  staffName?: string
  roleLabel?: string
  totalSalary?: number
  fixedSalaryTotal?: number
  unitSalaryTotal?: number
  trialSalaryTotal?: number
  rewardPenaltyTotal?: number
  payoutStatus?: number
  campusDetails?: Array<{ itemDetails?: Array<Record<string, unknown>> }>
}

interface Summary {
  month?: string
  cycleStartDate?: string
  cycleEndDate?: string
  cycleRangeLabel?: string
  ownSalaryOnly?: boolean
  canManagePayoutStatus?: boolean
  totalSalary?: number
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
    load().catch((error) => message.error(tell(error, '工资加载失败')))
  }, [shell.campusId, month])

  const mine = data?.ownSalaryOnly
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
        <div className="stat-line"><span>应发合计<strong>{money(data?.totalSalary)}</strong></span></div>
        <Table
          rowKey="staffId"
          dataSource={data?.staffSummaries || []}
          pagination={false}
          columns={[
            { title: '老师', dataIndex: 'staffName' },
            { title: '角色', dataIndex: 'roleLabel' },
            { title: '固定', render: (_: unknown, row: Staff) => money(row.fixedSalaryTotal) },
            { title: '课时', render: (_: unknown, row: Staff) => money(row.unitSalaryTotal) },
            { title: '体验', render: (_: unknown, row: Staff) => money(row.trialSalaryTotal) },
            { title: '奖惩', render: (_: unknown, row: Staff) => money(row.rewardPenaltyTotal) },
            { title: '应发', render: (_: unknown, row: Staff) => money(row.totalSalary) },
            { title: '发放', render: (_: unknown, row: Staff) => <span className={row.payoutStatus === 1 ? 'status-pill is-ok' : 'status-pill is-warn'}>{row.payoutStatus === 1 ? '已发' : '未发'}</span> },
            { title: '', render: (_: unknown, row: Staff) => (
              <>
                <Button type="link" onClick={() => setOpenId(openId === row.staffId ? null : row.staffId)}>明细</Button>
                <Button type="link" onClick={() => openHours(row)}>课时</Button>
              </>
            ) },
          ]}
        />
        {(data?.staffSummaries || []).filter((row) => row.staffId === openId).map((row) => (
          <div key={row.staffId} style={{ marginTop: 12 }}>
            <Table
              rowKey={(item) => String(item.salaryItemId)}
              pagination={false}
              dataSource={(row.campusDetails || []).flatMap((detail) => detail.itemDetails || [])}
              columns={[
                { title: '工资项', dataIndex: 'salaryItemName' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '配置', render: (_: unknown, item: Record<string, unknown>) => money(item.configuredAmount) },
                { title: '核算', render: (_: unknown, item: Record<string, unknown>) => money(item.calculatedAmount) },
              ]}
            />
            {data?.canManagePayoutStatus ? (
              <Form
                layout="inline"
                style={{ marginTop: 12 }}
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
                <Form.Item name="status" initialValue={row.payoutStatus || 0}><Select options={[{ value: 0, label: '未发' }, { value: 1, label: '已发' }]} /></Form.Item>
                <Form.Item name="paymentDate"><Input type="date" /></Form.Item>
                <Form.Item name="paymentType"><Select style={{ width: 120 }} placeholder="支付方式" options={[{ value: 1, label: '支付宝' }, { value: 2, label: '微信' }, { value: 3, label: '银行卡' }, { value: 4, label: '公户' }, { value: 5, label: '现金' }]} /></Form.Item>
                <Form.Item name="paymentRemark"><Input placeholder="支付账户或流水号" /></Form.Item>
                <Button htmlType="submit">记录发放</Button>
              </Form>
            ) : null}
          </div>
        ))}
      </section>
    </NeedCampus>
  )
}
