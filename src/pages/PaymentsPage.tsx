import { Button, Empty, Input, Select, Spin, Table, Tabs, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { BusinessDateRangePicker } from '../components/BusinessDatePicker'
import { MetricBars } from './bars'
import { NeedCampus, PageHead, money, tell, useShell } from './kit'
import './PaymentsPage.css'

interface StatTag { label?: string; tone?: string; date?: string }
interface Stat {
  key?: string
  studentId?: number
  label?: string
  amount?: number
  count?: number
  hours?: number
  detailText?: string
  tags?: StatTag[]
}
interface PaymentSummary {
  netAmount?: number
  netHours?: number
  incomeAmount?: number
  incomeCount?: number
  refundAmount?: number
  refundCount?: number
  recordCount?: number
  studentCount?: number
}
interface Overview {
  summary?: PaymentSummary
  typeStats?: Array<{ type?: string; count?: number }>
  campusStats?: Stat[]
  coachStats?: Stat[]
  courseStats?: Stat[]
  studentStats?: Stat[]
}
interface PaymentCampusScope {
  allCampusesAccessible?: boolean
  campuses?: Array<{ id: number; name?: string }>
}
interface Named { id: number; name?: string; serviceName?: string }
interface TrendPoint { date?: string; incomeAmount?: number; refundAmount?: number; netAmount?: number }
type PaymentRow = Record<string, unknown>
type TimeRange = 'all' | 'today' | 'month' | 'three_months' | 'custom'

const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'new', label: '新增' },
  { value: 'renew', label: '续费' },
  { value: 'supplement', label: '补缴' },
  { value: 'adjustment', label: '课时调整' },
  { value: 'refund', label: '退费' },
]

export function PaymentsPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const requestVersion = useRef(0)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [custom, setCustom] = useState<[string, string]>(['', ''])
  const [type, setType] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [campusStats, setCampusStats] = useState<Stat[]>([])
  const [records, setRecords] = useState<PaymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [grain, setGrain] = useState<'day' | 'week' | 'month'>('month')
  const [workspaceTab, setWorkspaceTab] = useState('records')
  const [groups, setGroups] = useState<Named[]>([])
  const [services, setServices] = useState<Named[]>([])
  const [scopeReady, setScopeReady] = useState(false)
  const [allCampuses, setAllCampuses] = useState(false)
  const [scopeCampuses, setScopeCampuses] = useState<Array<{ id: number; name?: string }>>([])
  const [scopeId, setScopeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const allMode = scopeId === 0

  function dates() {
    if (timeRange === 'today') {
      const day = today()
      return { startDate: day, endDate: day }
    }
    if (timeRange === 'month') {
      const [startDate, endDate] = monthRange()
      return { startDate, endDate }
    }
    if (timeRange === 'three_months') {
      const now = new Date()
      return { startDate: localIso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), endDate: today() }
    }
    if (timeRange === 'custom') return { startDate: custom[0], endDate: custom[1] }
    return {}
  }

  function rangeError() {
    if (timeRange !== 'custom' || !custom[0] || !custom[1]) return ''
    if (custom[0] > custom[1]) return '开始日期不能晚于结束日期'
    return custom[1] > addMonthsMinusDay(custom[0], 6) ? '自定义时间段最多只能选择6个月' : ''
  }

  async function load(nextPage = page, nextKeyword = keyword) {
    if (!shell.campusId || scopeId == null) return
    const error = rangeError()
    if (error) return void message.warning(error)
    const version = ++requestVersion.current
    setLoading(true)
    const query = {
      campusId: scopeId > 0 ? scopeId : undefined,
      keyword: nextKeyword.trim() || undefined,
      type: type === 'all' ? undefined : type,
      ...dates(),
    }
    try {
      const [summary, list, trendRows, campusRows] = await Promise.all([
        getJson<Overview>('/payment-records/overview', query),
        getJson<{ records?: PaymentRow[]; total?: number }>('/payment-records/list', {
          ...query,
          sortField: sort.startsWith('amount') ? 'amount' : 'paymentDate',
          sortOrder: sort.endsWith('_asc') ? 'asc' : 'desc',
          page: nextPage,
          pageSize: 20,
        }),
        getJson<TrendPoint[]>('/payment-records/overview/trends', query),
        scopeId === 0 ? getJson<Stat[]>('/payment-records/overview/campus-stats', query) : Promise.resolve([]),
      ])
      if (version !== requestVersion.current) return
      setOverview(summary)
      setCampusStats(campusRows || [])
      setRecords(list.records || [])
      setTotal(Number(list.total || 0))
      setTrends(trendRows || [])
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    load(1).catch((error) => message.error(tell(error, '缴费数据加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.campusId, scopeId, timeRange, custom, type, sort])

  useEffect(() => {
    let cancelled = false
    setScopeReady(false)
    getJson<PaymentCampusScope>('/payment-records/campuses').then((scope) => {
      if (cancelled) return
      const rows = (scope?.campuses || []).filter((item) => item.id)
      const accessible = scope?.allCampusesAccessible === true
      setAllCampuses(accessible)
      setScopeCampuses(rows)
      setScopeId(accessible ? 0 : (rows.some((item) => item.id === shell.campusId) ? shell.campusId : rows[0]?.id) ?? null)
      setScopeReady(true)
    }).catch(() => {
      if (cancelled) return
      setAllCampuses(false)
      setScopeId(shell.campusId)
      setScopeReady(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.currentOrgId])

  useEffect(() => {
    if (!scopeReady || allCampuses || !shell.campusId) return
    if (scopeCampuses.some((item) => item.id === shell.campusId)) setScopeId(shell.campusId)
  }, [scopeReady, allCampuses, shell.campusId, scopeCampuses])

  useEffect(() => {
    if (!shell.campusId || scopeId == null) return
    const campusQuery = scopeId > 0 ? { campusId: scopeId } : {}
    getJson<Named[]>('/student-groups/list', { ...campusQuery, includeInternal: true }).then(setGroups).catch(() => setGroups([]))
    if (scopeId > 0) getJson<Named[]>(`/campus-services/${scopeId}/items`).then(setServices).catch(() => setServices([]))
    else setServices([])
  }, [shell.campusId, scopeId])

  const activeFilterCount = [scopeId !== 0 && allCampuses, timeRange !== 'all', type !== 'all', Boolean(keyword), sort !== 'date_desc'].filter(Boolean).length
  const typeCounts = useMemo(() => new Map((overview?.typeStats || []).map((item) => [item.type, Number(item.count || 0)])), [overview])
  const trendGroups = useMemo(() => bucketTrends(trends, grain), [trends, grain])

  function applySearch(value = searchDraft) {
    setKeyword(value.trim())
    setSearchDraft(value)
    setPage(1)
    load(1, value).catch((error) => message.error(tell(error, '搜索失败')))
  }

  function resetFilters() {
    const nextScope = allCampuses ? 0 : scopeId
    setScopeId(nextScope)
    setTimeRange('all')
    setCustom(['', ''])
    setType('all')
    setSort('date_desc')
    setKeyword('')
    setSearchDraft('')
    setPage(1)
    if (timeRange === 'all' && type === 'all' && sort === 'date_desc' && !keyword && nextScope === scopeId) {
      load(1, '').catch((error) => message.error(tell(error, '缴费数据加载失败')))
    }
  }

  const analytics = <div className="payment-analysis-grid">
    <section className="payment-panel payment-trend-panel">
      <div className="payment-panel-head">
        <div><h3>收款趋势</h3><p>对比收入、退费与实际净收变化</p></div>
        <Select value={grain} onChange={setGrain} options={[{ value: 'day', label: '按日' }, { value: 'week', label: '按周' }, { value: 'month', label: '按月' }]} />
      </div>
      <MetricBars metrics={TREND_METRICS} emptyText="当前筛选范围暂无趋势数据" groups={trendGroups} />
    </section>
    {allMode ? <PieStatPanel title="校区贡献" subtitle="各校区净收金额占比" rows={campusStats} /> : null}
    <PieStatPanel title="老师维度" subtitle="经办老师金额占比" rows={overview?.coachStats || []} />
    <PieStatPanel title="课程维度" subtitle="各课程类型收入占比" rows={(overview?.courseStats || []).map((row) => ({ ...row, label: courseDisplayName(row.label, groups, services) }))} />
    <PieStatPanel title="学员维度" subtitle="学员缴费金额占比" rows={overview?.studentStats || []} onOpen={(row) => row.key && navigate(`/students?studentId=${row.key}&tab=payment`)} />
  </div>

  const renderFilters = () => <div className="payment-filter-shell">
    <div className="payment-inline-filter-head">
      <div><strong>筛选缴费流水</strong><span>筛选结果同步更新汇总与多维统计</span></div>
      <div>{activeFilterCount ? <span className="payment-filter-count">已应用 {activeFilterCount} 项</span> : null}<Button type="link" disabled={!activeFilterCount} onClick={resetFilters}>清空筛选</Button></div>
    </div>
    <div className="payment-filter-grid">
      {allCampuses || scopeCampuses.length > 1 ? <FilterField label="校区范围"><Select value={scopeId ?? undefined} onChange={(value) => { setScopeId(value); setPage(1) }} options={[...(allCampuses ? [{ value: 0, label: '全部校区' }] : []), ...scopeCampuses.map((item) => ({ value: item.id, label: item.name || '未命名校区' }))]} /></FilterField> : null}
      <FilterField label="缴费时间"><Select value={timeRange} onChange={(value: TimeRange) => { if (value === 'custom' && (!custom[0] || !custom[1])) { const day = today(); setCustom([day, day]) }; setTimeRange(value) }} options={[{ value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: 'month', label: '本月' }, { value: 'three_months', label: '近三个月' }, { value: 'custom', label: '自定义日期' }]} /></FilterField>
      <FilterField label="缴费类型"><Select value={type} onChange={setType} options={TYPE_OPTIONS} /></FilterField>
      <FilterField label="记录排序"><Select value={sort} onChange={setSort} options={[{ value: 'date_desc', label: '日期最新' }, { value: 'date_asc', label: '日期最早' }, { value: 'amount_desc', label: '金额从高到低' }, { value: 'amount_asc', label: '金额从低到高' }]} /></FilterField>
      <FilterField label="搜索学员或课程" wide><div className="payment-search-actions"><Input allowClear value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onPressEnter={() => applySearch()} placeholder="输入学员姓名、手机号或课程" /><Button type="primary" onClick={() => applySearch()}>查询</Button><Button onClick={() => load()} loading={loading}>刷新</Button></div></FilterField>
    </div>
    {timeRange === 'custom' ? <div className="payment-custom-range"><span>自定义范围</span><BusinessDateRangePicker value={custom} onChange={setCustom} /><em>最多选择连续 6 个月</em></div> : null}
  </div>

  return <NeedCampus campusId={shell.campusId}>
    <PageHead title="缴费管理" extra="集中查看全部缴费流水，并按校区、时间、类型和关键词筛选分析。" />

    <Spin spinning={loading}>
      <section className="work-card payment-summary-card">
        <div className="payment-summary-main">
          <SummaryMetric label="净收金额" value={`¥${money(overview?.summary?.netAmount)}`} detail={`净增课时 ${money(overview?.summary?.netHours)}`} tone="blue" />
          <SummaryMetric label="收款总额" value={`¥${money(overview?.summary?.incomeAmount)}`} detail={`${overview?.summary?.incomeCount || 0} 笔正向收款`} tone="green" />
          <SummaryMetric label="退费金额" value={`¥${money(overview?.summary?.refundAmount)}`} detail={`${overview?.summary?.refundCount || 0} 笔退费`} tone="red" />
          <SummaryMetric label="记录与学员" value={`${overview?.summary?.recordCount || 0} 笔`} detail={`覆盖 ${overview?.summary?.studentCount || 0} 位学员`} tone="orange" />
        </div>
        <div className="payment-type-strip">
          {TYPE_OPTIONS.slice(1).map((item) => <span key={item.value} className={`is-${item.value}`}><em>{item.label}</em><strong>{typeCounts.get(item.value) || 0}</strong><small>笔</small></span>)}
        </div>
      </section>

      <section className="work-card payment-workspace-card">
        <Tabs activeKey={workspaceTab} onChange={setWorkspaceTab} items={[
          { key: 'records', label: `全部缴费记录（${total}）`, children: <>{renderFilters()}<PaymentRecordsTable records={records} total={total} page={page} allMode={allMode} onPage={(next) => { setPage(next); load(next).catch((error) => message.error(tell(error, '缴费记录加载失败'))) }} onStudent={(id) => navigate(`/students?studentId=${id}&tab=payment`)} /></> },
          { key: 'analytics', label: '多维统计分析', children: <>{renderFilters()}{analytics}</> },
        ]} />
      </section>
    </Spin>
  </NeedCampus>
}

function FilterField({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`payment-filter-field${wide ? ' is-wide' : ''}`}><span>{label}</span>{children}</label>
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className={`payment-summary-metric is-${tone}`}><span>{label}</span><strong>{value}</strong><em>{detail}</em></div>
}

function PaymentRecordsTable({ records, total, page, allMode, onPage, onStudent }: { records: PaymentRow[]; total: number; page: number; allMode: boolean; onPage: (page: number) => void; onStudent: (id: number) => void }) {
  return <div className="payment-records-section">
    <div className="payment-section-head"><div><h3>全部缴费流水</h3><p>共 {total} 条，点击学员可进入其完整缴费档案。</p></div><span>每页 20 条</span></div>
    <Table
      rowKey={(row) => String(row.id)}
      dataSource={records}
      scroll={{ x: 1320 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选条件下暂无缴费记录" /> }}
      pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, showTotal: (count, range) => `第 ${range[0]}–${range[1]} 条，共 ${count} 条`, onChange: onPage }}
      columns={[
        { title: '缴费日期', dataIndex: 'paymentDate', width: 112, fixed: 'left' },
        { title: '学员', width: 130, fixed: 'left', render: (_: unknown, row: PaymentRow) => row.studentId ? <Button type="link" className="payment-student-link" onClick={() => onStudent(Number(row.studentId))}>{String(row.studentName || '未命名学员')}</Button> : String(row.studentName || '—') },
        ...(allMode ? [{ title: '校区', dataIndex: 'campusName', width: 120 }] : []),
        { title: '类型', width: 100, render: (_: unknown, row: PaymentRow) => <span className={`payment-type-badge is-${String(row.type || '')}`}>{String(row.typeText || typeLabel(String(row.type || '')))}</span> },
        { title: '金额', width: 120, align: 'right' as const, sorter: (left: PaymentRow, right: PaymentRow) => Number(left.amount || 0) - Number(right.amount || 0), render: (_: unknown, row: PaymentRow) => <strong className={row.type === 'refund' ? 'payment-amount is-refund' : 'payment-amount'}>{amountPrefix(row.type)}¥{money(row.amount)}</strong> },
        { title: '课时', width: 155, render: (_: unknown, row: PaymentRow) => recordHoursText(row.hours, row.giftHours) || '—' },
        { title: '课程', dataIndex: 'courseTypeLabel', width: 150, ellipsis: true },
        { title: '老师', dataIndex: 'coachMemberName', width: 110, ellipsis: true },
        { title: '支付方式', width: 100, render: (_: unknown, row: PaymentRow) => paymentMethodText(row.paymentMethod) },
        { title: '有效期', width: 205, render: (_: unknown, row: PaymentRow) => validityText(row) || '—' },
        { title: '备注', dataIndex: 'remark', width: 180, ellipsis: true },
      ]}
    />
  </div>
}

function PieStatPanel({ title, subtitle, rows, onOpen }: { title: string; subtitle: string; rows: Stat[]; onOpen?: (row: Stat) => void }) {
  const totalWeight = rows.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalCount = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const totalHours = rows.reduce((sum, row) => sum + Number(row.hours || 0), 0)
  let cursor = 0
  const slices = rows.map((row, index) => {
    const percentage = totalWeight > 0 ? Math.abs(Number(row.amount || 0)) / totalWeight * 100 : 0
    const start = cursor
    cursor += percentage
    return { row, percentage, start, end: cursor, color: PIE_COLORS[index % PIE_COLORS.length] }
  })
  const gradient = slices.length && totalWeight > 0
    ? `conic-gradient(${slices.map((slice) => `${slice.color} ${slice.start}% ${slice.end}%`).join(', ')})`
    : 'conic-gradient(#e9eef6 0% 100%)'
  return <section className="payment-panel payment-stat-panel">
    <div className="payment-panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{rows.length} 项</span></div>
    {rows.length ? <>
      <div className="payment-pie-layout">
        <div className="payment-pie-chart" style={{ background: gradient }} role="img" aria-label={`${title}金额占比饼图`}>
          <div><span>合计金额</span><strong>¥{money(totalAmount)}</strong><em>{totalWeight > 0 ? '100%' : '0%'}</em></div>
        </div>
        <div className="payment-pie-legend">
          {slices.map((slice) => {
            const content = <>
              <i style={{ background: slice.color }} />
              <span className="payment-pie-legend-name"><strong>{slice.row.label || '未命名'}</strong><em>{slice.row.count || 0} 笔 · {money(slice.row.hours)} 课时</em></span>
              <span className="payment-pie-legend-value"><strong>{slice.percentage.toFixed(1)}%</strong><em>¥{money(slice.row.amount)}</em></span>
            </>
            return onOpen ? <button key={String(slice.row.key || slice.row.label)} type="button" onClick={() => onOpen(slice.row)}>{content}</button> : <div key={String(slice.row.key || slice.row.label)}>{content}</div>
          })}
        </div>
      </div>
      <div className="payment-pie-footer"><span>合计 <strong>{totalCount}</strong> 笔</span><span>净课时 <strong>{money(totalHours)}</strong></span><span>金额占比 <strong>{totalWeight > 0 ? '100%' : '0%'}</strong></span></div>
    </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无统计数据" />}
  </section>
}

const PIE_COLORS = ['#4f73f2', '#20a27e', '#e4a13d', '#8a67d5', '#de6f79', '#2e9fc1', '#6683b8', '#c779b2', '#58a96f', '#d47c47']

function courseDisplayName(raw: string | undefined, groups: Named[], services: Named[]): string {
  const text = String(raw || '').trim()
  if (!text) return '未命名课程'
  if (text === 'ONE_TO_ONE' || text === 'one_to_one') return '一对一'
  const service = /^service:(\d+)$/.exec(text)
  if (service) return services.find((item) => item.id === Number(service[1]))?.serviceName || services.find((item) => item.id === Number(service[1]))?.name || '未命名课程'
  if (/^\d+$/.test(text)) return groups.find((item) => item.id === Number(text))?.name || '未命名课程'
  return text
}

function localIso(date: Date): string { return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}` }
function today(): string { return localIso(new Date()) }
function monthRange(): [string, string] { const now = new Date(); return [localIso(new Date(now.getFullYear(), now.getMonth(), 1)), localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0))] }
function addMonthsMinusDay(start: string, months: number): string { const [year, month, day] = start.split('-').map(Number); const date = new Date(year, month - 1 + months, day); date.setDate(date.getDate() - 1); return localIso(date) }

const TREND_METRICS = [{ key: 'income', label: '收入', tone: 'revenue' }, { key: 'refund', label: '退费', tone: 'expense' }, { key: 'net', label: '净收', tone: 'profit' }]
function bucketTrends(rows: TrendPoint[], grain: 'day' | 'week' | 'month') {
  const map = new Map<string, { label: string; income: number; refund: number; net: number }>()
  rows.forEach((row) => {
    const date = String(row.date || '').slice(0, 10)
    if (!date) return
    const key = grain === 'month' ? date.slice(0, 7) : grain === 'week' ? mondayOf(date) : date
    const current = map.get(key) || { label: grain === 'day' ? date.slice(5) : key, income: 0, refund: 0, net: 0 }
    current.income += Number(row.incomeAmount || 0); current.refund += Number(row.refundAmount || 0); current.net += Number(row.netAmount || 0); map.set(key, current)
  })
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([id, item]) => ({ id, label: item.label, sub: grain === 'day' ? weekdayLabel(id) : '', values: { income: item.income, refund: item.refund, net: item.net } }))
}
function mondayOf(iso: string): string { const date = new Date(`${iso}T00:00:00`); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return localIso(date) }
function weekdayLabel(iso: string): string { const date = new Date(`${iso}T00:00:00`); return Number.isNaN(date.getTime()) ? '' : `周${'日一二三四五六'[date.getDay()]}` }
function amountPrefix(type: unknown): string { return type === 'refund' ? '-' : type === 'adjustment' ? '±' : '+' }
function recordHoursText(hours: unknown, giftHours: unknown): string { const regular = Number(hours || 0); const gift = Number(giftHours || 0); const main = money(regular); return gift ? `正课 ${main} + 赠课 ${money(gift)}` : regular ? `${main} 课时` : '' }
function validityText(row: PaymentRow): string { const start = String(row.validStartDate || '').slice(0, 10); const end = String(row.validEndDate || '').slice(0, 10); return start && end ? `${start} 至 ${end}` : '' }
function typeLabel(value: string): string { return ({ new: '新增', renew: '续费', supplement: '补缴', adjustment: '课时调整', refund: '退费' } as Record<string, string>)[value] || value }
function paymentMethodText(value: unknown): string { return ({ 1: '支付宝', 2: '微信', 3: '银行卡', 4: '公户', 5: '现金' } as Record<number, string>)[Number(value)] || '—' }
