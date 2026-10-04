import { Button, Collapse, Empty, Form, Input, InputNumber, Modal, Radio, Select, Spin, Table, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, putJson } from '../api/biz'
import { BusinessDatePicker } from '../components/BusinessDatePicker'
import { PaymentMethodPicker } from '../components/PaymentMethodPicker'
import { NeedCampus, PageHead, genderText, money, type PeriodOption, tell, todayIso, useShell } from './kit'

interface SalaryItem extends Record<string, unknown> {
  salaryItemId?: string
  salaryItemName?: string
  itemType?: string
  quantity?: number
  configuredAmount?: number
  calculatedAmount?: number
  campusName?: string
}

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
  campusDetails?: Array<{ campusName?: string; itemDetails?: SalaryItem[] }>
}

interface Summary {
  month?: string
  cycleStartDate?: string
  cycleEndDate?: string
  cycleRangeLabel?: string
  payDateLabel?: string
  totalSalary?: number
  staffCount?: number
  scheduleCount?: number
  trialScheduleCount?: number
  totalPayableHours?: number
  staffSummaries?: Staff[]
}

interface SalaryHistory {
  periodOptions?: PeriodOption[]
  monthlyRecords?: Summary[]
  ownSalaryOnly?: boolean
  canManagePayoutStatus?: boolean
}

type MonthFilterMode = 'all' | 'range' | 'selected'
type MonthPart = { year: number | null; month: number | null }
type MonthRangeInput = [MonthPart, MonthPart]

function emptyMonthRangeInput(): MonthRangeInput {
  return [{ year: null, month: null }, { year: null, month: null }]
}

function serializeMonthPart(value: MonthPart): string {
  if (!value.year || !value.month) return ''
  return `${value.year}-${String(value.month).padStart(2, '0')}`
}

export function SalaryPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [history, setHistory] = useState<SalaryHistory | null>(null)
  const [monthFilterMode, setMonthFilterMode] = useState<MonthFilterMode>('all')
  const [monthRangeInput, setMonthRangeInput] = useState<MonthRangeInput>(emptyMonthRangeInput)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const [activeMonths, setActiveMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function loadHistory() {
    if (!shell.campusId) return
    setLoading(true)
    try {
      const result = await getJson<SalaryHistory>('/salary/history', { campusId: shell.campusId })
      const months = (result.periodOptions || []).map((item) => String(item.month || '')).filter(Boolean)
      setHistory(result)
      setMonthFilterMode('all')
      setMonthRangeInput(emptyMonthRangeInput())
      setSelectedMonths([])
      setActiveMonths(months.slice(0, 1))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setHistory(null)
    setMonthFilterMode('all')
    setMonthRangeInput(emptyMonthRangeInput())
    setSelectedMonths([])
    setActiveMonths([])
    loadHistory().catch((error) => message.error(tell(error, '工资记录加载失败')))
  }, [shell.campusId])

  const monthRange = useMemo<[string, string]>(() => [
    serializeMonthPart(monthRangeInput[0]),
    serializeMonthPart(monthRangeInput[1]),
  ], [monthRangeInput])
  const monthRangeInvalid = Boolean(monthRange[0] && monthRange[1] && monthRange[0] > monthRange[1])

  const records = useMemo(() => {
    const allRecords = history?.monthlyRecords || []
    if (monthFilterMode === 'selected') {
      if (!selectedMonths.length) return allRecords
      const selected = new Set(selectedMonths)
      return allRecords.filter((record) => selected.has(String(record.month || '')))
    }
    if (monthFilterMode !== 'range') return allRecords
    if (monthRangeInvalid) return []
    const [startMonth, endMonth] = monthRange
    if (!startMonth && !endMonth) return allRecords
    return allRecords.filter((record) => {
      const month = String(record.month || '')
      return month && (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth)
    })
  }, [history, monthFilterMode, monthRange, monthRangeInvalid, selectedMonths])

  const aggregate = useMemo(() => records.reduce((result, record) => {
    const people = record.staffSummaries || []
    const paid = people.filter((row) => row.payoutStatus === 1)
    result.total += Number(record.totalSalary || 0)
    result.paid += paid.reduce((sum, row) => sum + Number(row.totalSalary || 0), 0)
    result.staffRecords += people.length
    return result
  }, { total: 0, paid: 0, staffRecords: 0 }), [records])

  function openHours(row: Staff, summary: Summary) {
    const name = String(row.staffName || '').trim()
    if (!name) return void message.warning('缺少老师信息')
    if (!shell.campusId) return void message.warning('请先选择校区')
    const start = String(summary.cycleStartDate || '').slice(0, 10)
    const end = String(summary.cycleEndDate || '').slice(0, 10)
    const query = new URLSearchParams({ teacherName: name })
    if (start && end) {
      query.set('timeMode', 'custom_range')
      query.set('startDate', start)
      query.set('endDate', end)
    } else if (summary.month) {
      query.set('timeMode', 'salary_cycle')
      query.set('month', summary.month)
    } else return void message.warning('缺少核算周期')
    navigate(`/hours?${query.toString()}`)
  }

  async function refreshMonth(month: string) {
    if (!shell.campusId) return
    const summary = await getJson<Summary>('/salary/summary', { campusId: shell.campusId, month })
    setHistory((current) => current ? {
      ...current,
      monthlyRecords: (current.monthlyRecords || []).map((record) => record.month === month ? summary : record),
    } : current)
  }

  function updateMonthRangePart(index: 0 | 1, field: keyof MonthPart, value: number | null) {
    setMonthRangeInput((current) => {
      const next: MonthRangeInput = [{ ...current[0] }, { ...current[1] }]
      next[index][field] = value
      return next
    })
  }

  const periodOptions = history?.periodOptions || []
  const availableMonths = periodOptions.map((item) => String(item.month || '')).filter(Boolean).sort()
  const hasMonthFilter = monthFilterMode === 'range'
    ? Boolean(monthRange?.[0] || monthRange?.[1])
    : monthFilterMode === 'selected' && selectedMonths.length > 0
  const ownSalaryOnly = history?.ownSalaryOnly

  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead
        title={ownSalaryOnly ? '我的工资' : '工资管理'}
        extra={ownSalaryOnly ? '按月查看本人的工资记录与工资项目。' : '每个月形成一条工资记录，可展开查看人员与工资项目。'}
      />
      <section className="work-card salary-history-card">
        <div className="salary-history-toolbar">
          <div className="salary-month-filter">
            <div className="salary-month-filter__modes">
              <span>工资记录</span>
              <Radio.Group
                value={monthFilterMode}
                optionType="button"
                buttonStyle="solid"
                onChange={(event) => setMonthFilterMode(event.target.value as MonthFilterMode)}
              >
                <Radio.Button value="all">全部月份</Radio.Button>
                <Radio.Button value="range">连续区间</Radio.Button>
                <Radio.Button value="selected">指定月份</Radio.Button>
              </Radio.Group>
            </div>
            {monthFilterMode === 'range' ? <div className="salary-month-filter__control is-range">
              <span>月份区间</span>
              <div className={`salary-month-range-inputs${monthRangeInvalid ? ' is-invalid' : ''}`} title={monthRangeInvalid ? '开始月份不能晚于结束月份' : undefined}>
                <div className="salary-month-stepper">
                  <span>开始</span>
                  <InputNumber className="salary-month-year-input" aria-label="开始年份" placeholder="年份" min={2000} max={2100} precision={0} value={monthRangeInput[0].year} onChange={(value) => updateMonthRangePart(0, 'year', value)} />
                  <em>年</em>
                  <InputNumber className="salary-month-number-input" aria-label="开始月份" placeholder="月份" min={1} max={12} precision={0} value={monthRangeInput[0].month} onChange={(value) => updateMonthRangePart(0, 'month', value)} />
                  <em>月</em>
                </div>
                <b>至</b>
                <div className="salary-month-stepper">
                  <span>结束</span>
                  <InputNumber className="salary-month-year-input" aria-label="结束年份" placeholder="年份" min={2000} max={2100} precision={0} value={monthRangeInput[1].year} onChange={(value) => updateMonthRangePart(1, 'year', value)} />
                  <em>年</em>
                  <InputNumber className="salary-month-number-input" aria-label="结束月份" placeholder="月份" min={1} max={12} precision={0} value={monthRangeInput[1].month} onChange={(value) => updateMonthRangePart(1, 'month', value)} />
                  <em>月</em>
                </div>
              </div>
            </div> : null}
            {monthFilterMode === 'selected' ? <div className="salary-month-filter__control">
              <span>指定月份</span>
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                value={selectedMonths}
                placeholder="请选择一个或多个月份"
                options={[...availableMonths].reverse().map((month) => ({ value: month, label: formatMonth(month) }))}
                onChange={(values) => setSelectedMonths(values.slice().sort().reverse())}
              />
            </div> : null}
          </div>
        </div>
        <Spin spinning={loading}>
          {history ? <>
            <div className="salary-history-overview">
              <span><em>{hasMonthFilter ? '筛选月份' : '全部月份'}</em><strong>{records.length}<small>个月</small></strong></span>
              <span><em>工资总额</em><strong>¥{money(aggregate.total)}</strong></span>
              <span><em>已发工资</em><strong>¥{money(aggregate.paid)}</strong></span>
              <span><em>待发工资</em><strong>¥{money(Math.max(aggregate.total - aggregate.paid, 0))}</strong></span>
              <span><em>人员记录</em><strong>{aggregate.staffRecords}<small>人次</small></strong></span>
            </div>
            {records.length ? <Collapse
              className="salary-month-list"
              activeKey={activeMonths}
              onChange={(keys) => setActiveMonths(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
              items={records.map((summary) => ({
                key: String(summary.month),
                label: <MonthRecordHeader summary={summary} />,
                children: <MonthDetails
                  summary={summary}
                  canManagePayoutStatus={Boolean(history.canManagePayoutStatus)}
                  campusId={shell.campusId}
                  onOpenHours={openHours}
                  onSaved={() => refreshMonth(String(summary.month))}
                />,
              }))}
            /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasMonthFilter ? '所选月份暂无工资记录' : '暂无工资记录'} />}
          </> : <div className="salary-loading-space" />}
        </Spin>
      </section>
    </NeedCampus>
  )
}

function MonthRecordHeader({ summary }: { summary: Summary }) {
  const people = summary.staffSummaries || []
  const paid = people.filter((row) => row.payoutStatus === 1)
  const paidTotal = paid.reduce((sum, row) => sum + Number(row.totalSalary || 0), 0)
  const pendingTotal = Math.max(Number(summary.totalSalary || 0) - paidTotal, 0)
  const payoutProgress = people.length ? Math.round(paid.length / people.length * 100) : 0
  const payoutComplete = people.length > 0 && paid.length === people.length
  return <div className="salary-month-header">
    <div className="salary-month-title"><strong>{summary.cycleRangeLabel || '工资核算周期'}</strong>{summary.payDateLabel ? <em>{summary.payDateLabel}</em> : null}</div>
    <div><span>工资总额</span><strong>¥{money(summary.totalSalary)}</strong></div>
    <div><span>已发</span><strong className="is-paid">¥{money(paidTotal)}</strong></div>
    <div><span>待发</span><strong className={pendingTotal > 0 ? 'is-pending' : ''}>¥{money(pendingTotal)}</strong></div>
    <div><span>核算人员</span><strong>{people.length} 人</strong></div>
    <div className="salary-month-status-summary">
      <div className={`salary-month-progress${payoutComplete ? ' is-complete' : ''}`}>
        <span className={payoutComplete ? 'salary-month-progress__status is-complete' : 'salary-month-progress__status'}>{payoutComplete ? '已全部发放' : `${paid.length}/${people.length} 人已发`}</span>
        <strong>{payoutProgress}%</strong>
        <div
          className="salary-month-progress__track"
          role="progressbar"
          aria-label={`${formatMonth(summary.month)}工资发放进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={payoutProgress}
        >
          <i style={{ width: `${payoutProgress}%` }} />
        </div>
      </div>
    </div>
  </div>
}

function MonthDetails({ summary, campusId, canManagePayoutStatus, onOpenHours, onSaved }: {
  summary: Summary
  campusId?: number | null
  canManagePayoutStatus: boolean
  onOpenHours: (row: Staff, summary: Summary) => void
  onSaved: () => Promise<void>
}) {
  const people = summary.staffSummaries || []
  const [payingStaff, setPayingStaff] = useState<Staff | null>(null)
  if (!people.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本月暂无可核算人员" />
  return <>
    <Table
      className="salary-staff-table"
      rowKey="staffId"
      dataSource={people}
      pagination={false}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (row) => <StaffSalaryDetails row={row} />,
      }}
      columns={[
        { title: '人员', render: (_: unknown, row: Staff) => <div className="salary-person-cell"><strong>{[row.staffName, genderText(row.gender), row.roleLabel].filter(Boolean).join(' · ')}</strong><span>{row.scheduleCount || 0} 课时 / 体验 {row.trialScheduleCount || 0} 课时 · {hoursSummary(row)}</span>{row.warningText ? <em>{row.warningText}</em> : null}</div> },
        { title: '固定项', align: 'right', render: (_: unknown, row: Staff) => `¥${money(row.fixedSalaryTotal)}` },
        { title: '单价项', align: 'right', render: (_: unknown, row: Staff) => `¥${money(row.unitSalaryTotal)}` },
        { title: '体验课', align: 'right', render: (_: unknown, row: Staff) => `¥${money(row.trialSalaryTotal)}` },
        { title: '奖惩', align: 'right', render: (_: unknown, row: Staff) => `¥${money(row.rewardPenaltyTotal)}` },
        { title: '应发工资', align: 'right', render: (_: unknown, row: Staff) => <strong>¥{money(row.totalSalary)}</strong> },
        {
          title: '状态',
          align: 'center',
          width: 92,
          render: (_: unknown, row: Staff) => row.payoutStatus === 1
            ? <span className="status-pill salary-status-control is-ok">已发</span>
            : canManagePayoutStatus
              ? <Button className="salary-pay-button salary-status-control" type="primary" size="small" onClick={(event) => { event.stopPropagation(); setPayingStaff(row) }}>发放</Button>
              : <span className="status-pill salary-status-control is-warn">待发</span>,
        },
        { title: '课时', width: 76, render: (_: unknown, row: Staff) => <Button type="link" onClick={(event) => { event.stopPropagation(); onOpenHours(row, summary) }}>查看</Button> },
      ]}
    />
    {payingStaff ? <PayoutModal
      row={payingStaff}
      summary={summary}
      campusId={campusId}
      onClose={() => setPayingStaff(null)}
      onSaved={onSaved}
    /> : null}
  </>
}

function StaffSalaryDetails({ row }: {
  row: Staff
}) {
  const details = row.campusDetails || []
  const multiCampus = details.length > 1
  const items = details.flatMap((detail) => (detail.itemDetails || []).map((item) => ({ ...item, campusName: detail.campusName })))
  return <div className="salary-person-details">
    {items.length ? <div className="salary-item-matrix">
      <table>
        <thead>
          <tr>
            <th scope="col">薪资项目</th>
            {items.map((item, index) => <th scope="col" key={`${item.campusName || ''}-${item.salaryItemId || item.salaryItemName || index}`}>
              <span className="salary-item-name">
                <strong>{String(item.salaryItemName || '未命名工资项')}</strong>
                {multiCampus && item.campusName ? <em>{item.campusName}</em> : null}
              </span>
            </th>)}
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row">数量</th>{items.map((item, index) => <td key={index}>{quantityText(item.itemType, item.quantity)}</td>)}</tr>
          <tr><th scope="row">配置金额</th>{items.map((item, index) => <td key={index}>¥{money(item.configuredAmount)}</td>)}</tr>
          <tr><th scope="row">核算金额</th>{items.map((item, index) => <td key={index}><strong>¥{money(item.calculatedAmount)}</strong></td>)}</tr>
        </tbody>
      </table>
    </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工资项目" />}
  </div>
}

function PayoutModal({ row, summary, campusId, onClose, onSaved }: {
  row: Staff
  summary: Summary
  campusId?: number | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  async function submit(values: { paymentType?: number; paymentDate?: string; paymentRemark?: string }) {
    if (!campusId || !row.staffId || !summary.month) return void message.warning('缺少工资记录信息')
    setSaving(true)
    try {
      await putJson('/salary/cycle-record/status', {
        campusId,
        staffId: row.staffId,
        month: summary.month,
        status: 1,
        paymentType: Number(values.paymentType),
        paymentDate: values.paymentDate,
        paymentRemark: String(values.paymentRemark || '').trim(),
      })
      message.success(`${row.staffName || '该人员'}的工资已发放`)
      onClose()
      await onSaved()
    } catch (error) {
      message.error(tell(error, '发放失败'))
    } finally {
      setSaving(false)
    }
  }

  return <Modal
    open
    width={520}
    title={`发放工资 · ${row.staffName || '未命名人员'}`}
    okText="确认发放"
    cancelText="取消"
    confirmLoading={saving}
    onOk={() => form.submit()}
    onCancel={onClose}
  >
    <div className="salary-payout-summary">
      <span>{formatMonth(summary.month)}</span>
      <strong>应发 ¥{money(row.totalSalary)}</strong>
    </div>
    <Form form={form} layout="vertical" initialValues={{ paymentDate: todayIso() }} onFinish={submit}>
      <Form.Item name="paymentDate" label="发放日期" rules={[{ required: true, message: '请选择发放日期' }]}>
        <BusinessDatePicker />
      </Form.Item>
      <Form.Item name="paymentType" label="支付方式" rules={[{ required: true, message: '请选择支付方式' }]}>
        <PaymentMethodPicker />
      </Form.Item>
      <Form.Item name="paymentRemark" label="流水号 / 凭证备注" rules={[{ required: true, whitespace: true, message: '请输入流水号或凭证备注' }]}>
        <Input placeholder="请输入支付流水号；现金发放可填写凭证备注" maxLength={100} />
      </Form.Item>
    </Form>
  </Modal>
}

function formatMonth(month: unknown): string {
  const value = String(month || '')
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  return match ? `${match[1]}年${match[2]}月` : value || '未命名月份'
}

function hoursSummary(row: Staff): string {
  const teaching = money(row.teachingHours)
  const payable = money(row.payableHours)
  return teaching === payable ? `共计 ${teaching}h` : `共计 ${teaching}h · 折算 ${payable}h`
}

function quantityText(itemType: unknown, quantity: unknown): string {
  return String(itemType || 'fixed').trim().toLowerCase() === 'unit' ? `${money(quantity)}h` : '--'
}
