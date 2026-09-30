import { Button, Input, Select, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { NeedCampus, PageHead, money, tell, useShell } from './kit'

interface Stat {
  key?: string
  studentId?: number
  label?: string
  amount?: number
  count?: number
  hours?: number
  detailText?: string
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
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [openKey, setOpenKey] = useState('')
  const [details, setDetails] = useState<Array<Record<string, unknown>>>([])

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
    if (!shell.campusId) return
    const error = rangeError()
    if (error) {
      message.warning(error)
      return
    }
    const query = {
      campusId: shell.campusId,
      keyword: nextKeyword.trim() || undefined,
      type: type === 'all' ? undefined : type,
      ...dates(),
    }
    const [summary, list] = await Promise.all([
      getJson<Overview>('/payment-records/overview', query),
      getJson<{ records?: Array<Record<string, unknown>>; total?: number }>('/payment-records/list', {
        ...query,
        sortField: sort.startsWith('amount') ? 'amount' : 'paymentDate',
        sortOrder: sort.endsWith('_asc') ? 'asc' : 'desc',
        page: nextPage,
        pageSize: 20,
      }),
    ])
    setOverview(summary)
    setRecords(list.records || [])
    setTotal(Number(list.total || 0))
  }

  useEffect(() => {
    setPage(1)
    load(1).catch((error) => message.error(tell(error, '缴费加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.campusId, timeRange, custom, type, sort])

  async function expand(stat: Stat) {
    const key = String(stat.key || stat.label)
    if (openKey === key) {
      setOpenKey('')
      return
    }
    const error = rangeError()
    if (error) {
      message.warning(error)
      return
    }
    const pageData = await getJson<{ records?: Array<Record<string, unknown>> }>('/payment-records/list', {
      campusId: shell.campusId,
      keyword: stat.label,
      type: type === 'all' ? undefined : type,
      ...dates(),
      page: 1,
      pageSize: 50,
    })
    setDetails(pageData.records || [])
    setOpenKey(key)
  }

  return (
    <NeedCampus campusId={shell.campusId}>
      <PageHead title="缴费管理" extra="按当前校区汇总。自定义时间最多 6 个月。">
        <Select style={{ width: 120 }} value={timeRange} onChange={setTimeRange} options={[{ value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: 'month', label: '本月' }, { value: 'custom', label: '自定义' }]} />
        {timeRange === 'custom' ? <DateSpan range={custom} onChange={setCustom} /> : null}
        <Select style={{ width: 120 }} value={type} onChange={setType} options={[{ value: 'all', label: '全部类型' }, { value: 'new', label: '新增' }, { value: 'renew', label: '续费' }, { value: 'supplement', label: '补缴' }, { value: 'adjustment', label: '课时调整' }, { value: 'refund', label: '退费' }]} />
        <Select style={{ width: 140 }} value={sort} onChange={setSort} options={[{ value: 'date_desc', label: '日期最新' }, { value: 'date_asc', label: '日期最早' }, { value: 'amount_desc', label: '金额从高到低' }, { value: 'amount_asc', label: '金额从低到高' }]} />
        <Input.Search allowClear placeholder="搜索学员/课程" style={{ width: 200 }} onSearch={(value) => { setKeyword(value); setPage(1); load(1, value).catch((error) => message.error(tell(error, '缴费加载失败'))) }} />
        <Button onClick={() => load()}>刷新</Button>
      </PageHead>
      <section className="work-card">
        <div className="stat-line">
          <span>净额<strong>{money(overview?.summary?.netAmount)}</strong></span>
          <span>净课时<strong>{money(overview?.summary?.netHours)}</strong></span>
          <span>收入<strong>{money(overview?.summary?.incomeAmount)}</strong></span>
          <span>退费金额<strong>{money(overview?.summary?.refundAmount)}</strong></span>
          <span>退费笔数<strong>{overview?.summary?.refundCount || 0}</strong></span>
          <span>笔数<strong>{overview?.summary?.recordCount || 0}</strong></span>
          <span>学员<strong>{overview?.summary?.studentCount || 0}</strong></span>
        </div>
        <div className="stat-line">
          {['new', 'renew', 'supplement', 'adjustment', 'refund'].map((item) => (
            <span key={item}>{typeLabel(item)}<strong>{(overview?.typeStats || []).find((stat) => stat.type === item)?.count || 0}</strong></span>
          ))}
        </div>
        <StatTable title="校区" rows={overview?.campusStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} />
        <StatTable title="老师" rows={overview?.coachStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} />
        <StatTable title="课程" rows={overview?.courseStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} />
        <StatTable title="学员" rows={overview?.studentStats || []} openKey={openKey} details={details} onExpand={expand} onStudent={(id) => navigate(`/students?studentId=${id}`)} studentKey />
        <h3 style={{ marginTop: 16 }}>记录</h3>
        <Table
          rowKey={(row) => String(row.id)}
          dataSource={records}
          locale={{ emptyText: keyword.trim() || type !== 'all' ? '没有匹配的缴费记录' : '暂无缴费记录' }}
          pagination={{ current: page, pageSize: 20, total, onChange: (next) => { setPage(next); load(next).catch(() => undefined) } }}
          columns={[
            { title: '日期', dataIndex: 'paymentDate' },
            { title: '学员', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => navigate(`/students?studentId=${row.studentId}`)}>{String(row.studentName || '')}</Button> : String(row.studentName || '') },
            { title: '类型', render: (_: unknown, row: Record<string, unknown>) => String(row.typeText || typeLabel(String(row.type || ''))) },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => `${row.type === 'refund' ? '-' : '+'}${money(row.amount)}` },
            { title: '课时', dataIndex: 'hours' },
            { title: '课程', dataIndex: 'courseTypeLabel' },
            { title: '老师', dataIndex: 'coachMemberName' },
            { title: '备注', dataIndex: 'remark' },
          ]}
        />
      </section>
    </NeedCampus>
  )
}

function StatTable(props: {
  title: string
  rows: Stat[]
  openKey: string
  details: Array<Record<string, unknown>>
  onExpand: (stat: Stat) => void
  onStudent: (id: number) => void
  studentKey?: boolean
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3>{props.title}</h3>
      <Table
        rowKey={(row) => String(row.key || row.label)}
        dataSource={props.rows}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'label' },
          { title: '金额', render: (_: unknown, row: Stat) => money(row.amount) },
          { title: '笔数', dataIndex: 'count' },
          { title: '课时', dataIndex: 'hours' },
          { title: '说明', dataIndex: 'detailText' },
          {
            title: '操作',
            render: (_: unknown, row: Stat) => (
              <>
                <Button type="link" onClick={() => props.onExpand(row)}>明细</Button>
                {props.studentKey && row.key ? <Button type="link" onClick={() => props.onStudent(Number(row.key))}>学员</Button> : null}
              </>
            ),
          },
        ]}
      />
      {props.rows.some((row) => String(row.key || row.label) === props.openKey) ? (
        <Table
          style={{ marginTop: 8 }}
          rowKey={(row) => String(row.id)}
          dataSource={props.details}
          pagination={false}
          columns={[
            { title: '日期', dataIndex: 'paymentDate' },
            { title: '学员', dataIndex: 'studentName' },
            { title: '类型', dataIndex: 'typeText' },
            { title: '金额', render: (_: unknown, row: Record<string, unknown>) => money(row.amount) },
            { title: '课程', dataIndex: 'courseTypeLabel' },
            { title: '', render: (_: unknown, row: Record<string, unknown>) => row.studentId ? <Button type="link" onClick={() => props.onStudent(Number(row.studentId))}>进入学员</Button> : null },
          ]}
        />
      ) : null}
    </div>
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

function typeLabel(value: string): string {
  return ({ new: '新增', renew: '续费', supplement: '补缴', adjustment: '课时调整', refund: '退费' } as Record<string, string>)[value] || value
}

function DateSpan(props: { range: [string, string]; onChange: (value: [string, string]) => void }) {
  return (
    <span>
      <input type="date" value={props.range[0]} onChange={(event) => props.onChange([event.target.value, props.range[1]])} />
      <input type="date" value={props.range[1]} onChange={(event) => props.onChange([props.range[0], event.target.value])} />
    </span>
  )
}
