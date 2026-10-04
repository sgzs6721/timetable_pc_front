import { Button, Empty, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { genderText, todayIso } from './kit'
import { currency, numberOf, PROFIT_METRICS, type ProfitDetailRequest } from './profit-model'

export function ProfitDetailPanel(props: {
  request: ProfitDetailRequest
  data: Record<string, unknown> | null
  loading: boolean
  onStudent: (id: number) => void
}) {
  const [studentFilter, setStudentFilter] = useState<{ id: number; name: string } | null>(null)
  useEffect(() => setStudentFilter(null), [props.request, props.data])

  if (props.loading) {
    return <div className="profit-detail-empty"><Spin /><span>正在加载明细…</span></div>
  }
  if (!props.data) return <div className="profit-detail-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细" /></div>

  if (props.request.metric === 'teacherCost') {
    return <TeacherCostDetail data={props.data} />
  }
  if (props.request.metric === 'operatingExpense') {
    return <OperatingExpenseDetail data={props.data} />
  }
  return (
    <RevenueDetail
      data={props.data}
      filter={studentFilter}
      onFilter={setStudentFilter}
      onStudent={props.onStudent}
    />
  )
}

export function detailTitle(request: ProfitDetailRequest): string {
  const label = PROFIT_METRICS.find((item) => item.key === request.metric)?.label || '经营明细'
  return `${request.campusName} · ${label}`
}

function TeacherCostDetail(props: { data: Record<string, unknown> }) {
  const rows = rowsOf(props.data)
  return (
    <div className="profit-detail-panel">
      <DetailSummary items={[
        ['合计', currency(props.data.totalTeacherCost)],
        ['固定工资分摊', currency(props.data.totalFixedCost)],
        ['销课课时成本', currency(props.data.totalConsumedCost)],
      ]} />
      <p className="profit-detail-note">固定工资按记薪周期天数分摊；销课课时成本按销课课时与老师课时单价计算。</p>
      <div className="profit-detail-table">
        <Table
          size="small"
          rowKey={(row, index) => `${row.staffId}-${row.cycleMonth}-${index}`}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '当前范围暂无课时成本明细' }}
          scroll={{ x: 760 }}
          columns={[
            { title: '老师', width: 150, render: (_: unknown, row) => <PersonName row={row} nameKey="staffName" /> },
            { title: '固定工资分摊', width: 190, render: (_: unknown, row) => Number(row.fixedAllocatedCost) > 0 ? <AmountFormula amount={row.fixedAllocatedCost} formula={fixedFormula(row)} /> : currency(0) },
            { title: '销课课时成本', width: 190, render: (_: unknown, row) => Number(row.consumedCost) > 0 ? <AmountFormula amount={row.consumedCost} formula={consumedFormula(row)} /> : currency(0) },
            { title: '合计', width: 110, render: (_: unknown, row) => currency(row.totalCost) },
            { title: '发薪状态', width: 140, render: (_: unknown, row) => payText(row.payDate) },
          ]}
        />
      </div>
    </div>
  )
}

function RevenueDetail(props: {
  data: Record<string, unknown>
  filter: { id: number; name: string } | null
  onFilter: (value: { id: number; name: string } | null) => void
  onStudent: (id: number) => void
}) {
  const allRows = rowsOf(props.data)
  const rows = props.filter ? allRows.filter((row) => Number(row.studentId) === props.filter?.id) : allRows
  const total = props.filter ? rows.reduce((sum, row) => sum + numberOf(row.amount), 0) : numberOf(props.data.totalRevenue)
  const hours = props.filter ? rows.reduce((sum, row) => sum + numberOf(row.consumedHours), 0) : numberOf(props.data.totalConsumedHours)
  const students = props.filter
    ? new Set(rows.map((row) => Number(row.studentId)).filter((id) => id > 0)).size
    : numberOf(props.data.totalStudentCount)
  return (
    <div className="profit-detail-panel">
      <DetailSummary items={[
        ['合计', currency(total)],
        ['销课课时', `${formatNumber(hours)} 课时`],
        ['涉及学员', `${students} 人`],
      ]} />
      {props.filter ? (
        <div className="profit-detail-filter">
          <span>正在只看「{props.filter.name || '该学员'}」</span>
          <Button type="link" size="small" onClick={() => props.onFilter(null)}>取消筛选</Button>
        </div>
      ) : null}
      <div className="profit-detail-table">
        <Table
          size="small"
          rowKey={(row, index) => `${row.date}-${row.studentId}-${row.courseName}-${index}`}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: props.filter ? '该学员暂无销课收入明细' : '当前范围暂无销课收入明细' }}
          scroll={{ x: 860 }}
          columns={[
            { title: '日期', width: 110, dataIndex: 'date' },
            { title: '学员', width: 140, render: (_: unknown, row) => <PersonName row={row} nameKey="studentName" /> },
            { title: '课程', width: 150, dataIndex: 'courseName' },
            { title: '老师', width: 130, dataIndex: 'coachName' },
            { title: '计算', width: 190, render: (_: unknown, row) => revenueFormula(row) },
            { title: '金额', width: 110, render: (_: unknown, row) => currency(row.amount) },
            { title: '操作', width: 160, fixed: 'right', render: (_: unknown, row) => {
              const studentId = Number(row.studentId || 0)
              if (!studentId) return null
              const filtering = props.filter?.id === studentId
              return (
                <>
                  <Button type="link" size="small" onClick={() => props.onFilter(filtering ? null : { id: studentId, name: String(row.studentName || '') })}>{filtering ? '取消筛选' : '只看该学员'}</Button>
                  <Button type="link" size="small" onClick={() => props.onStudent(studentId)}>学员详情</Button>
                </>
              )
            } },
          ]}
        />
      </div>
    </div>
  )
}

function OperatingExpenseDetail(props: { data: Record<string, unknown> }) {
  const rows = rowsOf(props.data)
  return (
    <div className="profit-detail-panel">
      <DetailSummary items={[
        ['合计', currency(props.data.totalOperatingExpense)],
        ['手工支出', currency(props.data.totalManualExpense)],
        ['周期支出', currency(props.data.totalRecurringExpense)],
      ]} />
      <div className="profit-detail-table">
        <Table
          size="small"
          rowKey={(row, index) => `${row.date}-${row.detailType}-${row.title}-${index}`}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '当前范围暂无经营支出明细' }}
          columns={[
            { title: '日期', width: 120, dataIndex: 'date' },
            { title: '项目', width: 180, dataIndex: 'title' },
            { title: '说明', dataIndex: 'subtitle' },
            { title: '金额', width: 130, render: (_: unknown, row) => currency(row.amount) },
          ]}
        />
      </div>
    </div>
  )
}

function DetailSummary(props: { items: Array<[string, string]> }) {
  return (
    <div className="profit-detail-summary">
      {props.items.map(([label, value]) => (
        <div key={label} className="profit-detail-summary-item"><span>{label}</span><strong>{value}</strong></div>
      ))}
    </div>
  )
}

function PersonName(props: { row: Record<string, unknown>; nameKey: string }) {
  const meta = [genderText(props.row.gender), props.row.roleLabel].filter(Boolean).join(' · ')
  return <span className="profit-detail-person"><strong>{String(props.row[props.nameKey] || '未命名')}</strong>{meta ? <small>{meta}</small> : null}</span>
}

function AmountFormula(props: { amount: unknown; formula: string }) {
  return <span className="profit-detail-formula"><strong>{currency(props.amount)}</strong><small>{props.formula}</small></span>
}

function rowsOf(data: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
}

function fixedFormula(row: Record<string, unknown>): string {
  const days = numberOf(row.cycleDayCount)
  const covered = numberOf(row.coveredDayCount)
  return days > 0 && covered > 0
    ? `${currency(row.fixedSalaryTotal)} / ${days}天 × ${covered}天`
    : currency(row.fixedSalaryTotal)
}

function consumedFormula(row: Record<string, unknown>): string {
  return `${formatNumber(row.consumedHours)} 课时 × ${currency(row.unitRate)}/课时`
}

function revenueFormula(row: Record<string, unknown>): string {
  return `${formatNumber(row.consumedHours)} 课时 × ${currency(row.unitPrice)}/课时`
}

function formatNumber(value: unknown): string {
  const amount = numberOf(value)
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

function payText(value: unknown): string {
  const date = String(value || '').slice(0, 10)
  if (!date) return '—'
  return `${date <= todayIso() ? '已支出 · ' : ''}发薪日 ${date}`
}
