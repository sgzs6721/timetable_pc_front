import { Button, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { NeedOrg, PageHead, money, monthKey, periodChoices, type PeriodOption, shiftPeriod, tell, todayIso, useShell } from './kit'

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
  const [cost, setCost] = useState<Array<Record<string, unknown>>>([])
  const [revenue, setRevenue] = useState<Array<Record<string, unknown>>>([])
  const [expense, setExpense] = useState<Array<Record<string, unknown>>>([])

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

  async function openDay(date: string) {
    setPicked(date)
    const query = { campusId: shell.campusId, startDate: date, endDate: date }
    const [nextCost, nextRevenue, nextExpense] = await Promise.all([
      getJson<Record<string, unknown>>('/finance/profit/teacher-cost-detail', query),
      getJson<Record<string, unknown>>('/finance/profit/revenue-detail', query),
      getJson<Record<string, unknown>>('/finance/profit/operating-expense-detail', query),
    ])
    setCost((nextCost.items as Array<Record<string, unknown>>) || [])
    setRevenue((nextRevenue.items as Array<Record<string, unknown>>) || [])
    setExpense((nextExpense.items as Array<Record<string, unknown>>) || [])
  }

  return (
    <NeedOrg orgId={shell.currentOrgId}>
      <PageHead title="经营分析" extra="选择统计周期后看校区对比、每日趋势和当日明细。" />
      <section className="work-card">
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
          <span>收入<strong>{money(daily?.totalRevenue)}</strong></span>
          <span>老师成本<strong>{money(daily?.totalTeacherCost)}</strong></span>
          <span>运营支出<strong>{money(daily?.totalOperatingExpense)}</strong></span>
          <span>利润<strong>{money(daily?.totalProfit)}</strong></span>
        </div>
        <h3>校区利润对比</h3>
        <Table rowKey={(row) => String(row.campusId)} dataSource={campuses} pagination={false} columns={[
          { title: '校区', dataIndex: 'campusName' },
          { title: '收入', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalRevenue')) },
          { title: '成本', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalTeacherCost')) },
          { title: '支出', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalOperatingExpense')) },
          { title: '利润', render: (_: unknown, row: Record<string, unknown>) => money(readProfit(row, 'totalProfit')) },
        ]} />
        <h3>每日趋势</h3>
        <Table
          rowKey="date"
          dataSource={(daily?.items as DailyItem[]) || []}
          pagination={false}
          columns={[
            { title: '日期', dataIndex: 'date' },
            { title: '收入', render: (_: unknown, row: DailyItem) => money(row.revenue) },
            { title: '老师成本', render: (_: unknown, row: DailyItem) => money(row.teacherCost) },
            { title: '运营支出', render: (_: unknown, row: DailyItem) => money(row.operatingExpense) },
            { title: '利润', render: (_: unknown, row: DailyItem) => money(row.profit) },
            { title: '', render: (_: unknown, row: DailyItem) => <Button type="link" onClick={() => openDay(String(row.date))}>当日明细</Button> },
          ]}
        />
      </section>
      {picked ? (
        <section className="work-card">
          <h2>{picked} 明细</h2>
          <p>课时成本由记薪周期内固定工资分摊，加上当天销课课时乘老师课时单价。</p>
          <h3>课时成本</h3>
          <Table rowKey={(row) => String(row.staffId)} dataSource={cost} pagination={false} columns={[
            { title: '老师', dataIndex: 'staffName' },
            { title: '固定分摊', render: (_: unknown, row: Record<string, unknown>) => money(row.fixedAllocatedCost) },
            { title: '销课成本', render: (_: unknown, row: Record<string, unknown>) => money(row.consumedCost) },
          ]} />
          <h3>销课收入</h3>
          <Table rowKey={(row) => String(row.studentId) + String(row.courseName)} dataSource={revenue} pagination={false} columns={[
            { title: '学员', dataIndex: 'studentName' },
            { title: '课程', dataIndex: 'courseName' },
            { title: '老师', dataIndex: 'coachName' },
            { title: '课时', dataIndex: 'consumedHours' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
            { title: '', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => navigate(`/students?studentId=${row.studentId}`)}>学员</Button> : null },
          ]} />
          <h3>经营支出</h3>
          <Table rowKey={(row) => String(row.title) + String(row.date)} dataSource={expense} pagination={false} columns={[
            { title: '项目', dataIndex: 'title' },
            { title: '说明', dataIndex: 'subtitle' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
          ]} />
        </section>
      ) : null}
    </NeedOrg>
  )
}

function readProfit(row: Record<string, unknown>, key: string): unknown {
  const nested = row.profit as Record<string, unknown> | undefined
  const overview = row.overview as Record<string, unknown> | undefined
  return row[key] ?? nested?.[key] ?? overview?.[key]
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
