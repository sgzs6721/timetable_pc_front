import { Button, Select, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { MetricBars } from './bars'
import { NeedOrg, PageHead, genderText, money, monthKey, periodChoices, type PeriodOption, shiftPeriod, tell, todayIso, useShell } from './kit'

interface DailyItem {
  date: string
  revenue?: number
  teacherCost?: number
  operatingExpense?: number
  profit?: number
}

export function ProfitPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [mode, setMode] = useState('salary_cycle')
  const [month, setMonth] = useState(monthKey())
  const [periods, setPeriods] = useState<PeriodOption[]>([])
  const [customStart, setCustomStart] = useState(monthStart())
  const [customEnd, setCustomEnd] = useState(todayIso())
  const [startDate, setStartDate] = useState(monthStart())
  const [endDate, setEndDate] = useState(todayIso())
  const [daily, setDaily] = useState<Record<string, unknown> | null>(null)
  const [campuses, setCampuses] = useState<Array<Record<string, unknown>>>([])
  const [picked, setPicked] = useState('')
  const [view, setView] = useState('campus')
  const [costDetail, setCostDetail] = useState<Record<string, unknown> | null>(null)
  const [revenueDetail, setRevenueDetail] = useState<Record<string, unknown> | null>(null)
  const [expenseDetail, setExpenseDetail] = useState<Record<string, unknown> | null>(null)

  async function load() {
    if (!shell.currentOrgId) return
    if (mode === 'custom_range') {
      if (customStart && customEnd && customStart > customEnd) {
        message.warning('开始日期不能晚于结束日期')
        return
      }
      if (customStart && customEnd && customEnd > addMonthsMinusDay(customStart, 6)) {
        message.warning('自定义时间段最多不能超过6个月')
        return
      }
    }
    const timeMode = !shell.campusId && mode === 'salary_cycle' ? 'natural_month' : mode
    const range = timeMode === 'custom_range'
      ? { startDate: customStart, endDate: customEnd, periodOptions: [] as PeriodOption[], month: '' }
      : await getJson<{ startDate?: string; endDate?: string; month?: string; periodOptions?: PeriodOption[] }>('/finance/time-options', {
        timeMode,
        campusId: shell.campusId,
        month: timeMode === 'salary_cycle' || timeMode === 'natural_month' ? month : undefined,
      })
    setPeriods(range.periodOptions || [])
    const resolvedMonth = String(range.month || '')
    if ((timeMode === 'salary_cycle' || timeMode === 'natural_month') && resolvedMonth && resolvedMonth !== month) setMonth(resolvedMonth)
    const nextStart = String(range.startDate || customStart).slice(0, 10)
    const nextEnd = String(range.endDate || customEnd).slice(0, 10)
    setStartDate(nextStart)
    setEndDate(nextEnd)
    const campusIds = shell.campuses.map((item) => item.id).join(',')
    const [nextDaily, nextCampuses] = await Promise.all([
      getJson<Record<string, unknown>>('/finance/profit/daily', { campusId: shell.campusId, startDate: nextStart, endDate: nextEnd }),
      getJson<Array<Record<string, unknown>>>('/finance/profit/daily/by-campus', { campusIds, startDate: nextStart, endDate: nextEnd }),
    ])
    setDaily(nextDaily)
    setCampuses(nextCampuses || [])
  }

  useEffect(() => {
    load().catch((error) => message.error(tell(error, '经营分析加载失败')))
  }, [shell.currentOrgId, shell.campusId, mode, month, customStart, customEnd])

  async function openRange(start: string, end: string) {
    setPicked(`${start} ~ ${end}`)
    setView('detail')
    await loadDetail(start, end)
  }

  async function openDay(date: string, switchView = true) {
    setPicked(date)
    if (switchView) setView('detail')
    await loadDetail(date, date)
  }

  async function loadDetail(start: string, end: string) {
    const query = { campusId: shell.campusId, startDate: start, endDate: end }
    const [nextCost, nextRevenue, nextExpense] = await Promise.all([
      getJson<Record<string, unknown>>('/finance/profit/teacher-cost-detail', query),
      getJson<Record<string, unknown>>('/finance/profit/revenue-detail', query),
      getJson<Record<string, unknown>>('/finance/profit/operating-expense-detail', query),
    ])
    setCostDetail(nextCost)
    setRevenueDetail(nextRevenue)
    setExpenseDetail(nextExpense)
  }

  return (
    <NeedOrg orgId={shell.currentOrgId}>
      <PageHead title="经营分析" extra="选择统计周期后看校区对比、每日趋势和当日明细。" />
      <section className="work-card">
        <h2>经营汇总</h2>
        <div className="work-toolbar">
          <Select
            style={{ width: 140 }}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'today', label: '今日' },
              { value: 'this_week', label: '本周' },
              { value: 'salary_cycle', label: '记薪周期' },
              { value: 'natural_month', label: '自然月' },
              { value: 'custom_range', label: '自定义' },
            ]}
          />
          {mode === 'salary_cycle' || mode === 'natural_month' ? (
            <>
              <Button onClick={() => setMonth(shiftPeriod(periods, month, -1))}>上一期</Button>
              <Select style={{ width: 360 }} value={month} onChange={setMonth} options={periodChoices(periods, month, !shell.campusId && mode === 'salary_cycle' ? 'natural_month' : mode)} />
              <Button onClick={() => setMonth(shiftPeriod(periods, month, 1))}>下一期</Button>
            </>
          ) : null}
          {mode === 'custom_range' ? (
            <>
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </>
          ) : <span className="range-label">{startDate} ~ {endDate}</span>}
          <Button onClick={() => load()}>刷新</Button>
        </div>
        <div className="stat-line">
          <button type="button" className="stat-link" onClick={() => openRange(startDate, endDate)}>销课收入<strong>{money(daily?.totalRevenue)}</strong></button>
          <button type="button" className="stat-link" onClick={() => openRange(startDate, endDate)}>课时成本<strong>{money(daily?.totalTeacherCost)}</strong></button>
          <button type="button" className="stat-link" onClick={() => openRange(startDate, endDate)}>经营支出<strong>{money(daily?.totalOperatingExpense)}</strong></button>
          <span>利润<strong>{money(daily?.totalProfit)}</strong></span>
        </div>
      </section>
      <Tabs activeKey={view} onChange={setView} items={[
        { key: 'campus', label: '校区对比', children: (
      <section className="work-card">
        <h2>校区利润对比</h2>
        <p className="range-label">{startDate} ~ {endDate}</p>
        <MetricBars
          metrics={BAR_METRICS}
          groups={campuses.map((row) => ({
            id: String(row.campusId),
            label: String(row.campusName || shell.campuses.find((item) => item.id === Number(row.campusId))?.name || '校区'),
            values: {
              revenue: numberOf(readProfit(row, 'totalRevenue')),
              teacherCost: numberOf(readProfit(row, 'totalTeacherCost')),
              operatingExpense: numberOf(readProfit(row, 'totalOperatingExpense')),
              profit: numberOf(readProfit(row, 'totalProfit')),
            },
          }))}
        />
        <Table rowKey={(row) => String(row.campusId)} dataSource={campuses} pagination={false} columns={[
          { title: '校区', render: (_: unknown, row: Record<string, unknown>) => String(row.campusName || shell.campuses.find((item) => item.id === Number(row.campusId))?.name || '校区') },
          { title: '销课收入', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalRevenue')) },
          { title: '课时成本', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalTeacherCost')) },
          { title: '经营支出', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalOperatingExpense')) },
          { title: '利润', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalProfit')) },
        ]} />
      </section>
        ) },
        { key: 'daily', label: '每日趋势', children: (
      <section className="work-card">
        <h2>每日趋势</h2>
        <MetricBars
          metrics={BAR_METRICS}
          groups={((daily?.items as DailyItem[]) || []).map((row) => ({
            id: String(row.date),
            label: String(row.date || '').slice(5),
            sub: weekdayLabel(String(row.date || '')),
            values: {
              revenue: numberOf(row.revenue),
              teacherCost: numberOf(row.teacherCost),
              operatingExpense: numberOf(row.operatingExpense),
              profit: numberOf(row.profit),
            },
          }))}
          onSelect={(id) => openDay(id, false)}
        />
        {picked ? <DaySummary date={picked} items={(daily?.items as DailyItem[]) || []} costDetail={costDetail} revenueDetail={revenueDetail} expenseDetail={expenseDetail} onOpen={() => setView('detail')} onStudent={(id) => navigate(`/students?studentId=${id}`)} /> : null}
        <Table
          rowKey="date"
          dataSource={(daily?.items as DailyItem[]) || []}
          pagination={false}
          columns={[
            { title: '日期', dataIndex: 'date' },
            { title: '销课收入', render: (_: unknown, row: DailyItem) => money(row.revenue) },
            { title: '课时成本', render: (_: unknown, row: DailyItem) => money(row.teacherCost) },
            { title: '经营支出', render: (_: unknown, row: DailyItem) => money(row.operatingExpense) },
            { title: '利润', render: (_: unknown, row: DailyItem) => money(row.profit) },
            { title: '', render: (_: unknown, row: DailyItem) => <Button type="link" onClick={() => openDay(String(row.date))}>当日明细</Button> },
          ]}
        />
      </section>
        ) },
        { key: 'detail', label: '当日明细', children: picked ? (
        <section className="work-card">
          <h2>{picked} 明细</h2>
          <p>1. 固定工资按记薪周期天数分摊到当天。2. 销课课时成本 = 当天销课课时 × 当前老师课时单价。</p>
          <DayTables costDetail={costDetail} revenueDetail={revenueDetail} expenseDetail={expenseDetail} onStudent={(id) => navigate(`/students?studentId=${id}`)} />
        </section>
        ) : <section className="work-card"><p>先在「每日趋势」里点开一天，这里会显示课时成本、销课收入和经营支出。</p></section> },
      ]} />
    </NeedOrg>
  )
}

const BAR_METRICS = [
  { key: 'revenue', label: '销课收入', tone: 'revenue' },
  { key: 'teacherCost', label: '课时成本', tone: 'teacher' },
  { key: 'operatingExpense', label: '经营支出', tone: 'expense' },
  { key: 'profit', label: '利润', tone: 'profit' },
]

function DaySummary(props: {
  date: string
  items: DailyItem[]
  costDetail: Record<string, unknown> | null
  revenueDetail: Record<string, unknown> | null
  expenseDetail: Record<string, unknown> | null
  onOpen: () => void
  onStudent: (id: number) => void
}) {
  const day = props.items.find((item) => item.date === props.date)
  return (
    <div className="profit-day-card">
      <div className="profit-day-card-head">
        <strong>{props.date}</strong>
        <span>利润 {money(day?.profit)}</span>
        <Button type="link" onClick={props.onOpen}>当日明细</Button>
      </div>
      <div className="stat-line">
        <span>销课收入<strong>{money(day?.revenue)}</strong></span>
        <span>课时成本<strong>{money(day?.teacherCost)}</strong></span>
        <span>经营支出<strong>{money(day?.operatingExpense)}</strong></span>
      </div>
      <p>1. 固定工资按记薪周期天数分摊到当天。2. 销课课时成本 = 当天销课课时 × 当前老师课时单价。</p>
      <DayTables costDetail={props.costDetail} revenueDetail={props.revenueDetail} expenseDetail={props.expenseDetail} onStudent={props.onStudent} />
    </div>
  )
}

function DayTables(props: {
  costDetail: Record<string, unknown> | null
  revenueDetail: Record<string, unknown> | null
  expenseDetail: Record<string, unknown> | null
  onStudent: (id: number) => void
}) {
  const [studentFilter, setStudentFilter] = useState<{ id: number; name: string } | null>(null)
  const cost = (props.costDetail?.items as Array<Record<string, unknown>>) || []
  const allRevenue = (props.revenueDetail?.items as Array<Record<string, unknown>>) || []
  const revenue = studentFilter ? allRevenue.filter((row) => Number(row.studentId) === studentFilter.id) : allRevenue
  const expense = (props.expenseDetail?.items as Array<Record<string, unknown>>) || []
  const revenueTotal = studentFilter ? revenue.reduce((sum, row) => sum + numberOf(row.amount), 0) : numberOf(props.revenueDetail?.totalRevenue)
  const revenueHours = studentFilter ? revenue.reduce((sum, row) => sum + numberOf(row.consumedHours), 0) : numberOf(props.revenueDetail?.totalConsumedHours)
  const revenueStudents = studentFilter
    ? new Set(revenue.map((row) => Number(row.studentId)).filter((id) => id > 0)).size
    : Number(props.revenueDetail?.totalStudentCount || 0)
  useEffect(() => { setStudentFilter(null) }, [props.revenueDetail])
  return (
    <>
      <h3>课时成本</h3>
      <div className="stat-line">
        <span>合计<strong>{money(props.costDetail?.totalTeacherCost)}</strong></span>
        <span>固定工资分摊<strong>{money(props.costDetail?.totalFixedCost)}</strong></span>
        <span>销课课时成本<strong>{money(props.costDetail?.totalConsumedCost)}</strong></span>
      </div>
      <Table rowKey={(row, index) => `${row.staffId}-${row.cycleMonth}-${index}`} dataSource={cost} pagination={false} locale={{ emptyText: '当天暂无课时成本明细' }} columns={[
        { title: '老师', render: (_: unknown, row: Record<string, unknown>) => [row.staffName, genderText(row.gender), row.roleLabel].filter(Boolean).join(' · ') },
        { title: '固定分摊', render: (_: unknown, row: Record<string, unknown>) => Number(row.fixedAllocatedCost) > 0 ? <span>{money(row.fixedAllocatedCost)}<br /><span className="range-label">{fixedFormula(row)}</span></span> : money(row.fixedAllocatedCost) },
        { title: '销课成本', render: (_: unknown, row: Record<string, unknown>) => Number(row.consumedCost) > 0 ? <span>{money(row.consumedCost)}<br /><span className="range-label">{consumedFormula(row)}</span></span> : money(row.consumedCost) },
        { title: '合计', render: (_: unknown, row: Record<string, unknown>) => money(row.totalCost) },
        { title: '发薪', render: (_: unknown, row: Record<string, unknown>) => payText(row.payDate) },
      ]} />
      <h3>销课收入</h3>
      <div className="stat-line">
        <span>合计<strong>{money(revenueTotal)}</strong></span>
        <span>销课课时<strong>{money(revenueHours)}</strong></span>
        <span>销课学员<strong>{revenueStudents} 人</strong></span>
      </div>
      {studentFilter ? <p>正在只看「{studentFilter.name || '该学员'}」的销课收入。<Button type="link" onClick={() => setStudentFilter(null)}>取消筛选</Button></p> : null}
      <Table rowKey={(row, index) => `${row.studentId}-${row.courseName}-${index}`} dataSource={revenue} pagination={false} locale={{ emptyText: studentFilter ? '该学员当天暂无销课收入明细' : '当天暂无销课收入明细' }} columns={[
        { title: '学员', render: (_: unknown, row: Record<string, unknown>) => [row.studentName, genderText(row.gender)].filter(Boolean).join(' · ') },
        { title: '课程', dataIndex: 'courseName' },
        { title: '老师', dataIndex: 'coachName' },
        { title: '计算', render: (_: unknown, row: Record<string, unknown>) => revenueFormula(row) },
        { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
        { title: '', render: (_: unknown, row: Record<string, unknown>) => {
          const studentId = Number(row.studentId || 0)
          if (!studentId) return null
          const filtering = studentFilter?.id === studentId
          return (
            <>
              <Button type="link" onClick={() => setStudentFilter(filtering ? null : { id: studentId, name: String(row.studentName || '') })}>{filtering ? '取消筛选' : '只看该学员'}</Button>
              <Button type="link" onClick={() => props.onStudent(studentId)}>学员</Button>
            </>
          )
        } },
      ]} />
      <h3>经营支出</h3>
      <div className="stat-line">
        <span>合计<strong>{money(props.expenseDetail?.totalOperatingExpense)}</strong></span>
        <span>手工支出<strong>{money(props.expenseDetail?.totalManualExpense)}</strong></span>
        <span>周期支出<strong>{money(props.expenseDetail?.totalRecurringExpense)}</strong></span>
      </div>
      <Table rowKey={(row, index) => `${row.title}-${row.date}-${index}`} dataSource={expense} pagination={false} locale={{ emptyText: '暂无经营支出明细' }} columns={[
        { title: '项目', dataIndex: 'title' },
        { title: '说明', dataIndex: 'subtitle' },
        { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
      ]} />
    </>
  )
}

function fixedFormula(row: Record<string, unknown>): string {
  const days = Number(row.cycleDayCount || 0)
  const covered = Number(row.coveredDayCount || 0)
  if (days > 0 && covered > 0) return `¥${money(row.fixedSalaryTotal)} / ${days}天 × ${covered}天`
  return `¥${money(row.fixedSalaryTotal)}`
}

function consumedFormula(row: Record<string, unknown>): string {
  return `${money(row.consumedHours)} 课时 × ¥${money(row.unitRate)}/课时`
}

function revenueFormula(row: Record<string, unknown>): string {
  return `${money(row.consumedHours)} 课时 × ¥${money(row.unitPrice)}/课时`
}

function payText(value: unknown): string {
  const date = String(value || '').slice(0, 10)
  if (!date) return ''
  return `${date <= todayIso() ? '已支出' : ''} 发薪日 ${date}`.trim()
}

function numberOf(value: unknown): number {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function weekdayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `周${'日一二三四五六'[date.getDay()]}`
}

function readProfit(row: Record<string, unknown>, key: string): unknown {
  const daily = row.daily as Record<string, unknown> | undefined
  const nested = row.profit as Record<string, unknown> | undefined
  const overview = row.overview as Record<string, unknown> | undefined
  return row[key] ?? daily?.[key] ?? nested?.[key] ?? overview?.[key]
}

function addMonthsMinusDay(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(year, month - 1 + months, day)
  date.setDate(date.getDate() - 1)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`
}
