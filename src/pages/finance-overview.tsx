import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  PieChartOutlined,
  UnorderedListOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Skeleton, Table } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

type DetailMode = 'all' | 'income' | 'paid' | 'pending'
type SingleDetailMode = Exclude<DetailMode, 'all'>

interface CampusFinanceRow {
  campusId?: number
  campusName?: string
  overview?: Record<string, unknown>
}

export function FinanceOverviewDashboard(props: {
  loading: boolean
  rows: CampusFinanceRow[]
  fallbackOverview: Record<string, unknown> | null
  activeCampusId: number | null
  activeCampusName: string
  periodLabel: string
  filter: ReactNode
}) {
  const [selectedCampusId, setSelectedCampusId] = useState<number | null>(props.activeCampusId)
  const [detailMode, setDetailMode] = useState<DetailMode>('all')
  const [breakdown, setBreakdown] = useState('__ALL__')

  useEffect(() => {
    setSelectedCampusId(props.activeCampusId)
    setBreakdown('__ALL__')
  }, [props.activeCampusId])

  const selectedRow = props.rows.find((row) => Number(row.campusId) === Number(selectedCampusId))
  const overview = selectedRow?.overview || props.fallbackOverview || {}
  const campusName = selectedRow?.campusName || props.activeCampusName
  const income = numberOf(overview.income)
  const paid = numberOf(overview.paidExpense)
  const pending = numberOf(overview.pendingExpense)
  const expected = numberOf(overview.expectedExpense) || paid + pending
  const projectedBalance = income - expected
  const coverage = expected > 0 ? Math.min(100, paid / expected * 100) : 0
  const pendingDetails = detailRows(overview, 'pending')

  const switchDetail = (mode: DetailMode) => {
    setDetailMode(mode)
    setBreakdown('__ALL__')
  }

  return (
    <div className="finance-overview-dashboard" aria-busy={props.loading}>
      <section className="finance-overview-hero" aria-labelledby="finance-overview-title">
        <div className="finance-overview-topline">
          {props.filter}
        </div>
        <header className="finance-overview-head">
          <div>
            <h2 id="finance-overview-title">财务收支总览</h2>
            <p>{campusName} · {props.periodLabel}</p>
          </div>
          {props.loading ? <Skeleton.Input className="finance-balance-loading" active size="small" /> : (
            <div className={`finance-balance-badge ${projectedBalance >= 0 ? 'is-positive' : 'is-negative'}`}>
              <span>预计结余</span>
              <strong>{projectedBalance >= 0 ? '有盈余' : '有缺口'}</strong>
            </div>
          )}
        </header>

        <div className="finance-summary-grid">
          {props.loading ? Array.from({ length: 4 }, (_, index) => (
            <div className="finance-summary-card finance-summary-loading" key={index} aria-label="财务指标加载中">
              <Skeleton active title={{ width: '38%' }} paragraph={{ rows: 2, width: ['68%', '50%'] }} />
            </div>
          )) : <><SummaryCard
            tone="income"
            icon={<ArrowDownOutlined />}
            label="总收入"
            value={currency(income)}
            note={`${detailRows(overview, 'income').length} 笔收入记录`}
            active={detailMode === 'income'}
            onClick={() => switchDetail('income')}
          />
          <SummaryCard
            tone="expense"
            icon={<ArrowUpOutlined />}
            label="已支出"
            value={currency(paid)}
            note={expected > 0 ? `已完成应支出的 ${formatPercent(coverage)}` : '本期暂无应支出'}
            active={detailMode === 'paid'}
            onClick={() => switchDetail('paid')}
          />
          <SummaryCard
            tone={projectedBalance >= 0 ? 'balance' : 'deficit'}
            icon={<WalletOutlined />}
            label="预计结余"
            value={currency(projectedBalance)}
            note={`收入 ${currency(income)} − 应支出 ${currency(expected)}`}
          />
          <SummaryCard
            tone="pending"
            icon={<ClockCircleOutlined />}
            label="待支出"
            value={currency(pending)}
            note={`${pendingDetails.length} 笔待处理`}
            active={detailMode === 'pending'}
            onClick={() => switchDetail('pending')}
          /></>}
        </div>

        {props.loading ? <div className="finance-payment-progress finance-payment-loading" aria-label="支出支付进度加载中">
          <Skeleton.Input active block />
        </div> : <div className="finance-payment-progress">
          <div>
            <span>支出支付进度</span>
            <b>{formatPercent(coverage)}</b>
          </div>
          <span className="finance-progress-track"><i style={{ width: `${coverage}%` }} /></span>
          <small>本期应支出 {currency(expected)}，其中待支出 {currency(pending)}</small>
        </div>}
      </section>

      <div className="finance-analysis-grid">
        <CampusComparison
          loading={props.loading}
          rows={props.rows}
          selectedCampusId={selectedCampusId}
          onSelect={(campusId) => {
            setSelectedCampusId(campusId)
            setBreakdown('__ALL__')
          }}
        />
        <ExpenseStructure loading={props.loading} overview={overview} expected={expected} />
      </div>

      <FinanceDetails
        loading={props.loading}
        overview={overview}
        campusName={campusName}
        periodLabel={props.periodLabel}
        mode={detailMode}
        breakdown={breakdown}
        onMode={switchDetail}
        onBreakdown={setBreakdown}
      />
    </div>
  )
}

function SummaryCard(props: {
  tone: string
  icon: ReactNode
  label: string
  value: string
  note: string
  active?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <span className="finance-summary-icon">{props.icon}</span>
      <span className="finance-summary-label">{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.note}</small>
    </>
  )
  if (!props.onClick) return <div className={`finance-summary-card is-${props.tone}`}>{content}</div>
  return (
    <button
      type="button"
      className={`finance-summary-card is-${props.tone}${props.active ? ' is-active' : ''}`}
      onClick={props.onClick}
      aria-pressed={props.active}
    >
      {content}
    </button>
  )
}

function CampusComparison(props: {
  loading: boolean
  rows: CampusFinanceRow[]
  selectedCampusId: number | null
  onSelect: (campusId: number) => void
}) {
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list')
  const rows = useMemo(() => props.rows.map((row) => {
    const income = numberOf(row.overview?.income)
    const paid = numberOf(row.overview?.paidExpense)
    const pending = numberOf(row.overview?.pendingExpense)
    const expected = numberOf(row.overview?.expectedExpense) || paid + pending
    return { ...row, income, paid, pending, expected, balance: income - expected }
  }), [props.rows])
  const metrics = [
    { key: 'income', label: '收入', color: '#0c9b6c' },
    { key: 'paid', label: '已支出', color: '#4f6ff5' },
    { key: 'pending', label: '待支出', color: '#f0a03a' },
    { key: 'balance', label: '预计结余', color: '#805ad5' },
  ] as const
  const values = rows.flatMap((row) => metrics.map((metric) => row[metric.key]))
  const maximum = Math.max(0, ...values)
  const minimum = Math.min(0, ...values)
  const span = maximum - minimum || 1
  const zeroPosition = -minimum / span * 100
  const plotHeight = 210
  const zeroTop = plotHeight - zeroPosition / 100 * plotHeight

  return (
    <section className="finance-analysis-card finance-campus-comparison">
      <header className="finance-card-head">
        <div className="finance-campus-comparison__heading">
          <div><h3>校区收支对比</h3><p>{viewMode === 'chart' ? '点击柱组切换上方概览与下方明细' : '点击校区切换上方概览与下方明细'}</p></div>
        </div>
        <div className="finance-campus-comparison__actions">
          <span>{rows.length} 个校区</span>
          <div className="finance-campus-view-switch" role="group" aria-label="校区收支展示方式">
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><UnorderedListOutlined />列表</button>
            <button type="button" className={viewMode === 'chart' ? 'is-active' : ''} aria-pressed={viewMode === 'chart'} onClick={() => setViewMode('chart')}><BarChartOutlined />图表</button>
          </div>
        </div>
      </header>
      {props.loading ? <div className="finance-chart-loading" aria-label="校区收支对比加载中">
        <Skeleton active title={{ width: '24%' }} paragraph={{ rows: 5, width: ['100%', '100%', '96%', '100%', '72%'] }} />
      </div> : null}
      {!props.loading && !rows.length ? <div className="finance-empty-inline">当前范围内暂无校区数据</div> : null}
      {!props.loading && rows.length && viewMode === 'list' ? (
        <div className="finance-campus-compact-table">
          <table>
            <thead><tr><th>校区</th><th>收入</th><th>已支出</th><th>待支出</th><th>预计结余</th></tr></thead>
            <tbody>{rows.map((row) => {
              const selected = Number(row.campusId) === Number(props.selectedCampusId)
              return <tr key={row.campusId} className={selected ? 'is-active' : ''}>
                <th scope="row"><button type="button" aria-pressed={selected} onClick={() => props.onSelect(Number(row.campusId))}><strong>{row.campusName || '未命名校区'}</strong><small>{selected ? '当前查看' : '点击查看'}</small></button></th>
                <td className="is-income">{currency(row.income)}</td>
                <td>{currency(row.paid)}</td>
                <td className="is-pending">{currency(row.pending)}</td>
                <td className={row.balance >= 0 ? 'is-balance' : 'is-deficit'}>{currency(row.balance)}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      ) : null}
      {!props.loading && rows.length && viewMode === 'chart' ? (
        <div className="finance-campus-chart">
          <div className="finance-campus-chart__scroll">
            <div className="finance-campus-chart__canvas" style={{ minWidth: `${Math.max(560, rows.length * 142)}px` }}>
              <div className="finance-campus-chart__grid" aria-hidden="true" />
              {maximum > 0 ? <span className="finance-campus-chart__axis-label is-max" aria-hidden="true">{compactCurrency(maximum)}</span> : null}
              <span className="finance-campus-chart__axis-label is-zero" style={{ top: `${zeroTop}px` }} aria-hidden="true">¥0</span>
              {minimum < 0 ? <span className="finance-campus-chart__axis-label is-min" aria-hidden="true">{compactCurrency(minimum)}</span> : null}
              <span className="finance-campus-chart__zero-line" style={{ top: `${zeroTop}px` }} aria-hidden="true" />
              <div className="finance-campus-chart__groups">
                {rows.map((row) => (
                  <button
                    type="button"
                    key={row.campusId}
                    className={`finance-campus-chart__group${Number(row.campusId) === Number(props.selectedCampusId) ? ' is-active' : ''}`}
                    aria-label={`${row.campusName || '未命名校区'}：收入${currency(row.income)}，已支出${currency(row.paid)}，待支出${currency(row.pending)}，预计结余${currency(row.balance)}`}
                    onClick={() => props.onSelect(Number(row.campusId))}
                  >
                    <span className="finance-campus-chart__bars" aria-hidden="true">
                      {metrics.map((metric) => {
                        const value = row[metric.key]
                        const height = Math.abs(value) / span * 100
                        const bottom = value >= 0 ? zeroPosition : zeroPosition - height
                        return <i key={metric.key} title={`${metric.label} ${currency(value)}`} className={value === 0 ? 'is-zero' : ''} style={{ height: `${height}%`, bottom: `${bottom}%`, background: metric.color }} />
                      })}
                    </span>
                    <span className="finance-campus-chart__campus"><b>{row.campusName || '未命名校区'}</b><small>{Number(row.campusId) === Number(props.selectedCampusId) ? '当前查看' : '点击查看'}</small></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="finance-campus-chart__legend" aria-hidden="true">
            {metrics.map((metric) => <span key={metric.key}><i style={{ background: metric.color }} />{metric.label}</span>)}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ExpenseStructure(props: { loading: boolean; overview: Record<string, unknown>; expected: number }) {
  const items = [
    { key: 'manual', label: '日常运营', value: numberOf(props.overview.manualExpense), color: '#4f6ff5' },
    { key: 'recurring', label: '周期支出', value: numberOf(props.overview.recurringExpense), color: '#f2a23a' },
    { key: 'salary', label: '老师成本', value: numberOf(props.overview.salaryExpense), color: '#8b6be8' },
  ]
  const total = props.expected || items.reduce((sum, item) => sum + item.value, 0)
  let cursor = 0
  const stops = items.map((item) => {
    const start = cursor
    cursor += total > 0 ? item.value / total * 100 : 0
    return `${item.color} ${start}% ${cursor}%`
  })
  const background = total > 0 ? `conic-gradient(${stops.join(', ')})` : '#edf1f6'
  return (
    <section className="finance-analysis-card finance-expense-structure">
      <header className="finance-card-head">
        <div><h3>应支出构成</h3><p>了解本期资金主要流向</p></div>
        <PieChartOutlined />
      </header>
      {props.loading ? <div className="finance-structure-loading" aria-label="应支出构成加载中">
        <Skeleton.Avatar active shape="circle" size={132} />
        <Skeleton active title={false} paragraph={{ rows: 3, width: ['100%', '100%', '100%'] }} />
      </div> : <><div className="finance-donut-wrap">
        <div className="finance-donut" style={{ background }}>
          <div><span>应支出</span><strong>{currency(total)}</strong></div>
        </div>
      </div>
      <div className="finance-structure-list">
        {items.map((item) => (
          <div key={item.key}>
            <i style={{ background: item.color }} />
            <span>{item.label}<small>{formatPercent(total > 0 ? item.value / total * 100 : 0)}</small></span>
            <strong>{currency(item.value)}</strong>
          </div>
        ))}
      </div></>}
    </section>
  )
}

function FinanceDetails(props: {
  loading: boolean
  overview: Record<string, unknown>
  campusName: string
  periodLabel: string
  mode: DetailMode
  breakdown: string
  onMode: (mode: DetailMode) => void
  onBreakdown: (value: string) => void
}) {
  const source = detailRows(props.overview, props.mode)
  const chips = Array.from(new Set(source.map((item) => detailLabel(item))))
  const shown = props.breakdown === '__ALL__' ? source : source.filter((item) => detailLabel(item) === props.breakdown)
  const total = shown.reduce((sum, item) => sum + (props.mode === 'all' ? signedDetailAmount(item) : detailAmount(item, props.mode)), 0)
  const allRows = detailRows(props.overview, 'all')
  const tabs: Array<{ key: DetailMode; label: string; value: string }> = [
    { key: 'all', label: '全部', value: `${allRows.length} 笔` },
    { key: 'income', label: '收入', value: currency(numberOf(props.overview.income)) },
    { key: 'paid', label: '已支出', value: currency(numberOf(props.overview.paidExpense)) },
    { key: 'pending', label: '待支出', value: currency(numberOf(props.overview.pendingExpense)) },
  ]
  return (
    <section className="finance-detail-card">
      <header className="finance-card-head">
        <div><h3>收支明细</h3><p>{props.campusName} · {props.periodLabel} · 逐笔查看本统计周期内的收入与支出</p></div>
        {props.loading ? <Skeleton.Input active size="small" /> : <span>{props.mode === 'all' ? '收支净额' : '当前合计'} <b>{currency(total)}</b></span>}
      </header>
      {props.loading ? <div className="finance-detail-loading" aria-label="收支明细加载中">
        <div className="finance-detail-loading__tabs">
          {Array.from({ length: 4 }, (_, index) => <Skeleton.Input active block key={index} />)}
        </div>
        <Skeleton active title={false} paragraph={{ rows: 5, width: ['100%', '96%', '100%', '92%', '74%'] }} />
      </div> : <><div className="finance-detail-tabs">
        {tabs.map((tab) => (
          <button type="button" key={tab.key} className={props.mode === tab.key ? 'is-active' : ''} onClick={() => props.onMode(tab.key)} aria-pressed={props.mode === tab.key}>
            <span>{tab.label}</span><strong>{tab.value}</strong>
          </button>
        ))}
      </div>
      {chips.length > 1 ? (
        <div className="finance-chips">
          <button type="button" className={props.breakdown === '__ALL__' ? 'is-on' : ''} onClick={() => props.onBreakdown('__ALL__')}>全部</button>
          {chips.map((label) => <button type="button" key={label} className={props.breakdown === label ? 'is-on' : ''} onClick={() => props.onBreakdown(label)}>{label}</button>)}
        </div>
      ) : null}
      <Table
        rowKey={(item, index) => String(item.__detailMode || props.mode) + String(item.title) + String(item.bizDate) + String(index)}
        dataSource={shown}
        pagination={shown.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
        scroll={{ x: 720 }}
        locale={{ emptyText: '当前筛选范围内还没有对应记录' }}
        columns={[
          { title: '项目', render: (_: unknown, item: Record<string, unknown>) => <strong>{String(item.title || detailLabel(item))}</strong> },
          { title: '类型', width: 100, render: (_: unknown, item: Record<string, unknown>) => { const rowMode = detailRowMode(item, props.mode); return <span className={`finance-status is-${rowMode}`}>{detailModeText(rowMode)}</span> } },
          { title: '说明', dataIndex: 'subtitle', render: (value: unknown) => <span className="finance-table-muted">{String(value || '—')}</span> },
          { title: '日期', dataIndex: 'bizDate', width: 120 },
          { title: '金额', align: 'right', width: 140, render: (_: unknown, item: Record<string, unknown>) => { const rowMode = detailRowMode(item, props.mode); const value = detailAmount(item, rowMode); return <b className={`finance-table-amount is-${rowMode}`}>{props.mode === 'all' && rowMode !== 'income' ? `-${currency(value)}` : currency(value)}</b> } },
          { title: '状态', dataIndex: 'statusLabel', width: 100, render: (value: unknown, item: Record<string, unknown>) => { const rowMode = detailRowMode(item, props.mode); return value ? <span className={`finance-status is-${rowMode}`}>{String(value)}</span> : '—' } },
        ]}
      /></>}
    </section>
  )
}

function detailRows(overview: Record<string, unknown>, mode: DetailMode): Array<Record<string, unknown>> {
  if (mode === 'all') {
    const rows: Array<Record<string, unknown>> = [
      ...detailRows(overview, 'income').map((item) => ({ ...item, __detailMode: 'income' })),
      ...detailRows(overview, 'paid').map((item) => ({ ...item, __detailMode: 'paid' })),
      ...detailRows(overview, 'pending').map((item) => ({ ...item, __detailMode: 'pending' })),
    ]
    return rows.sort((left, right) => String(right.bizDate || '').localeCompare(String(left.bizDate || '')))
  }
  if (mode === 'income') return overview.incomeDetails as Array<Record<string, unknown>> || []
  if (mode === 'paid') return overview.paidExpenseDetails as Array<Record<string, unknown>> || []
  return overview.pendingExpenseDetails as Array<Record<string, unknown>> || []
}

function detailAmount(item: Record<string, unknown>, mode: SingleDetailMode): number {
  return numberOf(mode === 'pending' ? item.pendingAmount || item.amount : item.amount)
}

function detailRowMode(item: Record<string, unknown>, fallback: DetailMode): SingleDetailMode {
  const mode = String(item.__detailMode || fallback)
  return mode === 'paid' || mode === 'pending' ? mode : 'income'
}

function signedDetailAmount(item: Record<string, unknown>): number {
  const mode = detailRowMode(item, 'all')
  const amount = detailAmount(item, mode)
  return mode === 'income' ? amount : -amount
}

function detailModeText(mode: SingleDetailMode): string {
  if (mode === 'income') return '收入'
  if (mode === 'paid') return '已支出'
  return '待支出'
}

function detailLabel(item: Record<string, unknown>): string {
  if (String(item.detailType || '').trim().toLowerCase() === 'salary') return '工资'
  return String(item.categoryName || item.paymentTypeLabel || item.title || '其他')
}

function numberOf(value: unknown): number {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function currency(value: number): string {
  return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}`
}

function compactCurrency(value: number): string {
  const amount = Math.abs(value)
  const compact = amount >= 10000 ? `${trimNumber(amount / 10000)}万` : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(amount)
  return `${value < 0 ? '-' : ''}¥${compact}`
}

function trimNumber(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '')
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}
