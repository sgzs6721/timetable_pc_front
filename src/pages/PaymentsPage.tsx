import { Button, Input, Select, Table, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { BusinessDateRangePicker } from '../components/BusinessDatePicker'
import { MetricBars } from './bars'
import { NeedCampus, PageHead, money, tell, useShell } from './kit'

interface StatTag {
  label?: string
  tone?: string
  date?: string
}

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

interface Overview {
  summary?: { netAmount?: number; netHours?: number; incomeAmount?: number; incomeCount?: number; refundAmount?: number; refundCount?: number; recordCount?: number; studentCount?: number }
  typeStats?: Array<{ type?: string; count?: number }>
  campusStats?: Stat[]
  coachStats?: Stat[]
  courseStats?: Stat[]
  studentStats?: Stat[]
}

export function PaymentsPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [timeRange, setTimeRange] = useState('all')
  const [custom, setCustom] = useState<[string, string]>(['', ''])
  const [type, setType] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [campusStats, setCampusStats] = useState<Stat[]>([])
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [openKey, setOpenKey] = useState('')
  const [details, setDetails] = useState<Array<Record<string, unknown>>>([])
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [grain, setGrain] = useState<'day' | 'week' | 'month'>('day')
  const [statTab, setStatTab] = useState('student')
  const [groups, setGroups] = useState<Named[]>([])
  const [services, setServices] = useState<Named[]>([])
  const [scopeReady, setScopeReady] = useState(false)
  const [allCampuses, setAllCampuses] = useState(false)
  const [scopeCampuses, setScopeCampuses] = useState<Array<{ id: number; name?: string }>>([])
  const [scopeId, setScopeId] = useState<number | null>(null)
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
    if (timeRange === 'custom') return { startDate: custom[0], endDate: custom[1] }
    return {}
  }

  function rangeError() {
    if (timeRange !== 'custom') return ''
    if (!custom[0] || !custom[1]) return ''
    if (custom[0] > custom[1]) return '开始日期不能晚于结束日期'
    const maxEnd = addMonthsMinusDay(custom[0], 6)
    if (custom[1] > maxEnd) return '自定义时间段最多只能选择6个月'
    return ''
  }

  async function load(nextPage = page, nextKeyword = keyword) {
    if (!shell.campusId || scopeId == null) return
    const error = rangeError()
    if (error) {
      message.warning(error)
      return
    }
    const query = {
      campusId: scopeId > 0 ? scopeId : undefined,
      keyword: nextKeyword.trim() || undefined,
      type: type === 'all' ? undefined : type,
      ...dates(),
    }
    const [summary, list, trendRows, campusRows] = await Promise.all([
      getJson<Overview>('/payment-records/overview', query),
      getJson<{ records?: Array<Record<string, unknown>>; total?: number }>('/payment-records/list', {
        ...query,
        sortField: sort.startsWith('amount') ? 'amount' : 'paymentDate',
        sortOrder: sort.endsWith('_asc') ? 'asc' : 'desc',
        page: nextPage,
        pageSize: 20,
      }),
      getJson<TrendPoint[]>('/payment-records/overview/trends', query),
      scopeId === 0 ? getJson<Stat[]>('/payment-records/overview/campus-stats', query) : Promise.resolve([]),
    ])
    setOverview(summary)
    setCampusStats(campusRows || [])
    setRecords(list.records || [])
    setTotal(Number(list.total || 0))
    setTrends(trendRows || [])
  }

  useEffect(() => {
    setPage(1)
    load(1).catch((error) => message.error(tell(error, '缴费加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.campusId, scopeId, timeRange, custom, type, sort])

  useEffect(() => {
    let cancelled = false
    getJson<PaymentCampusScope>('/payment-records/campuses').then((scope) => {
      if (cancelled) return
      const rows = (scope?.campuses || []).filter((item) => item.id)
      const accessible = scope?.allCampusesAccessible === true
      const next = accessible
        ? 0
        : (rows.some((item) => item.id === shell.campusId) ? shell.campusId : rows[0]?.id) ?? null
      setAllCampuses(accessible)
      setScopeCampuses(rows)
      setScopeId(next)
      setStatTab(next === 0 ? 'campus' : 'student')
      setScopeReady(true)
    }).catch(() => {
      if (cancelled) return
      setAllCampuses(false)
      setScopeId(shell.campusId)
      setStatTab('student')
      setScopeReady(true)
    })
    return () => { cancelled = true }
    // 校区范围按机构权限初始化；具体校区切换由下面的 effect 跟随顶栏。
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

  function chooseScope(next: number) {
    setScopeId(next)
    setStatTab(next === 0 ? 'campus' : 'student')
    setOpenKey('')
    setPage(1)
  }

  async function expand(stat: Stat, asCampus = false) {
    const key = String(stat.key || stat.label)
    if (asCampus && timeRange === 'all') return
    if (openKey === key) {
      setOpenKey('')
      return
    }
    const error = rangeError()
    if (error) {
      message.warning(error)
      return
    }
    const campusId = asCampus ? Number(stat.key) : (scopeId && scopeId > 0 ? scopeId : undefined)
    if (asCampus && !(Number(campusId) > 0)) {
      message.warning('缺少校区信息')
      return
    }
    try {
      const pageData = await getJson<{ records?: Array<Record<string, unknown>> }>('/payment-records/list', {
        campusId,
        keyword: asCampus ? (keyword.trim() || undefined) : stat.label,
        type: type === 'all' ? undefined : type,
        ...dates(),
        page: 1,
        pageSize: 50,
      })
      setDetails(pageData.records || [])
      setOpenKey(key)
    } catch (error) {
      message.error(tell(error, '加载缴费明细失败，请稍后重试'))
    }
  }

  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead title="缴费管理" extra={allMode ? '正在汇总全部校区。自定义时间最多 6 个月。' : '按所选校区汇总。自定义时间最多 6 个月。'}>
        {allCampuses || scopeCampuses.length > 1 ? (
          <Select
            style={{ width: 180 }}
            value={scopeId ?? undefined}
            onChange={chooseScope}
            options={[
              ...(allCampuses ? [{ value: 0, label: '全部校区' }] : []),
              ...scopeCampuses.map((item) => ({ value: item.id, label: item.name || '未命名校区' })),
            ]}
          />
        ) : null}
        <Select style={{ width: 120 }} value={timeRange} onChange={(value) => {
          if (value === 'custom' && (!custom[0] || !custom[1])) {
            const day = today()
            setCustom([day, day])
          }
          setTimeRange(value)
        }} options={[{ value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: 'month', label: '本月' }, { value: 'custom', label: '自定义' }]} />
        {timeRange === 'custom' ? <DateSpan range={custom} onChange={setCustom} /> : null}
        <Select style={{ width: 120 }} value={type} onChange={setType} options={[{ value: 'all', label: '全部类型' }, { value: 'new', label: '新增' }, { value: 'renew', label: '续费' }, { value: 'supplement', label: '补缴' }, { value: 'adjustment', label: '课时调整' }, { value: 'refund', label: '退费' }]} />
        <Select style={{ width: 140 }} value={sort} onChange={setSort} options={[{ value: 'date_desc', label: '日期最新' }, { value: 'date_asc', label: '日期最早' }, { value: 'amount_desc', label: '金额从高到低' }, { value: 'amount_asc', label: '金额从低到高' }]} />
        <Input.Search allowClear placeholder="搜索学员/课程" style={{ width: 200 }} onSearch={(value) => { setKeyword(value); setPage(1); load(1, value).catch((error) => message.error(tell(error, '缴费加载失败'))) }} />
        <Button onClick={() => load()}>刷新</Button>
      </PageHead>
      <section className="work-card">
        <h2>汇总</h2>
        <div className="stat-line is-metrics is-four">
          <span>净收金额<strong>¥{money(overview?.summary?.netAmount)}</strong><em>筛选后净课时 {money(overview?.summary?.netHours)}</em></span>
          <span>收款总额<strong>¥{money(overview?.summary?.incomeAmount)}</strong><em>新增/续费/补缴 {overview?.summary?.incomeCount || 0} 笔</em></span>
          <span>退费金额<strong>¥{money(overview?.summary?.refundAmount)}</strong><em>退费 {overview?.summary?.refundCount || 0} 笔</em></span>
          <span>记录总数<strong>{overview?.summary?.recordCount || 0}</strong><em>覆盖 {overview?.summary?.studentCount || 0} 位学员</em></span>
        </div>
        <div className="stat-line">
          {['new', 'renew', 'supplement', 'refund'].map((item) => (
            <span key={item}>{typeLabel(item)}<strong>{(overview?.typeStats || []).find((stat) => stat.type === item)?.count || 0} 笔</strong></span>
          ))}
        </div>
      </section>
      <Tabs activeKey={statTab} onChange={(key) => { setStatTab(key); setOpenKey('') }} items={[
        ...(allMode ? [{ key: 'campus', label: '按校区', children: <StatTable title="按校区统计" rows={campusStats} openKey={openKey} details={details} canExpand={timeRange !== 'all'} emptyText={`${campusStats.find((row) => String(row.key || row.label) === openKey)?.label || '当前校区'}当前周期暂无缴费明细`} onExpand={(stat) => { expand(stat, true).catch(() => undefined) }} onStudent={(id) => navigate(`/students?studentId=${id}`)} /> }] : [{ key: 'student', label: '按学员', children: <StatTable title="按学员统计" subtitle="完整记录" rows={overview?.studentStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}&tab=payment`)} studentKey showTagDate={timeRange !== 'all'} /> }]),
        { key: 'coach', label: '按老师', children: <StatTable title="按老师统计" subtitle="金额排名前 6" rows={overview?.coachStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} /> },
        { key: 'course', label: '按课程', children: <StatTable title="按课程类型统计" subtitle="金额排名前 6" rows={(overview?.courseStats || []).map((row) => ({ ...row, label: courseDisplayName(row.label, groups, services) }))} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} /> },
        { key: 'trend', label: '趋势', children: (
          <section className="work-card">
            <div className="work-toolbar">
              <h2>缴费趋势</h2>
              <Select style={{ width: 120 }} value={grain} onChange={setGrain} options={[{ value: 'day', label: '按日' }, { value: 'week', label: '按周' }, { value: 'month', label: '按月' }]} />
            </div>
            <MetricBars
              metrics={TREND_METRICS}
              emptyText="暂无趋势数据"
              groups={bucketTrends(trends, grain)}
            />
          </section>
        ) },
        { key: 'records', label: '缴费记录', children: (
      <section className="work-card">
        <Table
          rowKey={(row) => String(row.id)}
          dataSource={records}
          locale={{ emptyText: keyword.trim() || type !== 'all' ? '没有匹配的缴费记录' : '暂无缴费记录' }}
          pagination={{ current: page, pageSize: 20, total, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
          columns={[
            { title: '日期', dataIndex: 'paymentDate' },
            { title: '学员', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => navigate(`/students?studentId=${row.studentId}`)}>{String(row.studentName || '')}</Button> : String(row.studentName || '') },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => String(row.typeText || typeLabel(String(row.type || ''))) },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => `${amountPrefix(row.type)}${money(row.amount)}` },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => recordHoursText(row.hours, row.giftHours) },
            { title: '课程', dataIndex: 'courseTypeLabel' },
            { title: '老师', dataIndex: 'coachMemberName' },
            { title: '有效期', render: (_: unknown, row: Record<string, unknown>) => validityText(row) },
            { title: '截止', render: (_: unknown, row: Record<string, unknown>) => String(row.consumeDeadline || '').slice(0, 10) },
            { title: '备注', dataIndex: 'remark' },
          ]}
        />
      </section>
        ) },
      ]} />
    </NeedCampus>
  )
}

interface PaymentCampusScope {
  allCampusesAccessible?: boolean
  campuses?: Array<{ id: number; name?: string }>
}

interface Named {
  id: number
  name?: string
  serviceName?: string
}

function courseDisplayName(raw: string | undefined, groups: Named[], services: Named[]): string {
  const text = String(raw || '').trim()
  if (!text) return '未命名课程'
  if (text === 'ONE_TO_ONE' || text === 'one_to_one') return '一对一'
  const service = /^service:(\d+)$/.exec(text)
  if (service) {
    const found = services.find((item) => item.id === Number(service[1]))
    return found?.serviceName || found?.name || '未命名课程'
  }
  if (/^\d+$/.test(text)) {
    const found = groups.find((item) => item.id === Number(text))
    return found?.name || '未命名课程'
  }
  return text
}

function StatTable(props: {
  title: string
  subtitle?: string
  rows: Stat[]
  openKey: string
  details: Array<Record<string, unknown>>
  canExpand?: boolean
  emptyText?: string
  onExpand: (stat: Stat) => void
  onStudent: (id: number) => void
  studentKey?: boolean
  showTagDate?: boolean
}) {
  const expandable = props.canExpand !== false
  return (
    <section className="work-card">
      <h2>{props.title}</h2>
      {props.subtitle ? <p className="range-label">{props.subtitle}</p> : null}
      {!props.rows.length ? <p>暂无统计</p> : (
      <>
      <Table
        rowKey={(row) => String(row.key || row.label)}
        dataSource={props.rows}
        pagination={false}
        columns={[
          { title: '名称', render: (_: unknown, row: Stat) => props.studentKey && row.key ? <Button type="link" onClick={() => props.onStudent(Number(row.key))}>{row.label}</Button> : row.label },
          { title: '金额', render: (_: unknown, row: Stat) => money(row.amount) },
          { title: '笔数', dataIndex: 'count' },
          { title: '课时', dataIndex: 'hours' },
          { title: '说明', dataIndex: 'detailText' },
          ...(props.studentKey ? [{
            title: '课程标签',
            render: (_: unknown, row: Stat) => studentTagText(row, !!props.showTagDate),
          }] : []),
          {
            title: '操作',
            render: (_: unknown, row: Stat) => (
              <>
                {expandable ? <Button type="link" onClick={() => props.onExpand(row)}>{String(row.key || row.label) === props.openKey ? '收起' : '展开'}</Button> : null}
                {props.studentKey && row.key ? <Button type="link" onClick={() => props.onStudent(Number(row.key))}>缴费记录</Button> : null}
              </>
            ),
          },
        ]}
      />
      {expandable && props.rows.some((row) => String(row.key || row.label) === props.openKey) ? (
        <Table
          style={{ marginTop: 8 }}
          rowKey={(row) => String(row.id)}
          dataSource={props.details}
          pagination={false}
          locale={{ emptyText: props.emptyText || '暂无明细' }}
          columns={[
            { title: '日期', dataIndex: 'paymentDate' },
            { title: '学员', dataIndex: 'studentName' },
            { title: '类型', dataIndex: 'typeText' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => `${amountPrefix(row.type)}${money(row.amount)}` },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => recordHoursText(row.hours, row.giftHours) },
            { title: '老师', dataIndex: 'coachMemberName' },
            { title: '课程', dataIndex: 'courseTypeLabel' },
            { title: '有效期', render: (_: unknown, row: Record<string, unknown>) => validityText(row) },
            { title: '截止', render: (_: unknown, row: Record<string, unknown>) => String(row.consumeDeadline || '').slice(0, 10) },
            { title: '备注', dataIndex: 'remark' },
            { title: '', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => props.onStudent(Number(row.studentId))}>进入学员</Button> : null },
          ]}
        />
      ) : null}
      </>
      )}
    </section>
  )
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function today(): string {
  return localIso(new Date())
}

function monthRange(): [string, string] {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return [localIso(start), localIso(end)]
}

function addMonthsMinusDay(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number)
  const date = new Date(year, month - 1 + months, day)
  date.setDate(date.getDate() - 1)
  return localIso(date)
}

interface TrendPoint {
  date?: string
  incomeAmount?: number
  refundAmount?: number
  netAmount?: number
}

const TREND_METRICS = [
  { key: 'income', label: '收入', tone: 'revenue' },
  { key: 'refund', label: '退费', tone: 'expense' },
  { key: 'net', label: '净收', tone: 'profit' },
]

function bucketTrends(rows: TrendPoint[], grain: 'day' | 'week' | 'month') {
  const map = new Map<string, { label: string; income: number; refund: number; net: number }>()
  rows.forEach((row) => {
    const date = String(row.date || '').slice(0, 10)
    if (!date) return
    const key = grain === 'month' ? date.slice(0, 7) : grain === 'week' ? mondayOf(date) : date
    const current = map.get(key) || { label: grain === 'day' ? date.slice(5) : key, income: 0, refund: 0, net: 0 }
    current.income += Number(row.incomeAmount || 0)
    current.refund += Number(row.refundAmount || 0)
    current.net += Number(row.netAmount || 0)
    map.set(key, current)
  })
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([id, item]) => ({
    id,
    label: item.label,
    sub: grain === 'day' ? weekdayLabel(id) : '',
    values: { income: item.income, refund: item.refund, net: item.net },
  }))
}

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const delta = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - delta)
  return localIso(date)
}

function weekdayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `周${'日一二三四五六'[date.getDay()]}`
}

function amountPrefix(type: unknown): string {
  if (type === 'refund') return '-'
  if (type === 'adjustment') return '±'
  return '+'
}

function recordHoursText(hours: unknown, giftHours: unknown): string {
  const regular = Number(hours || 0)
  const gift = Number(giftHours || 0)
  const regularText = Number.isInteger(regular) ? String(regular) : String(Number(regular.toFixed(2)))
  if (gift) {
    const giftText = Number.isInteger(gift) ? String(gift) : String(Number(gift.toFixed(2)))
    return `正课${regularText}，赠课${giftText}课时`
  }
  return regular ? `${regularText}课时` : ''
}

function validityText(row: Record<string, unknown>): string {
  const start = String(row.validStartDate || '').slice(0, 10)
  const end = String(row.validEndDate || '').slice(0, 10)
  return start && end ? `${start} ~ ${end}` : ''
}

function studentTagText(stat: Stat, showDate: boolean): string {
  const counts = String(stat.detailText || '').split(/\s*·\s*/).reduce<Record<string, number>>((result, part) => {
    const matched = part.trim().match(/^(.+?)(\d+)\s*笔/)
    if (matched) result[matched[1].trim()] = Number(matched[2] || 0)
    return result
  }, {})
  return (stat.tags || []).map((tag) => {
    const label = String(tag.label || '').trim()
    if (!label) return ''
    const count = counts[label] || 0
    const text = count > 0 ? `${label}${count}笔` : label
    const date = showDate ? String(tag.date || '').trim() : ''
    return date ? `${text} ${date}` : text
  }).filter(Boolean).join(' · ')
}

function typeLabel(value: string): string {
  return ({ new: '新增', renew: '续费', supplement: '补缴', adjustment: '课时调整', refund: '退费' } as Record<string, string>)[value] || value
}

function DateSpan(props: { range: [string, string]; onChange: (value: [string, string]) => void }) {
  return <BusinessDateRangePicker value={props.range} onChange={props.onChange} style={{ width: 286 }} />
}
