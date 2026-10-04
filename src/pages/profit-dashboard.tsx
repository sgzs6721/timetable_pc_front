import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  LineChartOutlined,
  PieChartOutlined,
  RightOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { Table } from 'antd'
import { useMemo, useState, type CSSProperties } from 'react'
import {
  currency,
  dailyMetricAmount,
  metricAmount,
  numberOf,
  weekdayLabel,
  type DetailMetricKey,
  type ProfitCampusSection,
} from './profit-model'

type ComparisonMetric = 'profit' | 'revenue' | 'margin'
type TrendMetric = 'revenue' | 'cost' | 'profit'

interface CampusPerformanceRow {
  id: number
  name: string
  revenue: number
  teacherCost: number
  operatingExpense: number
  totalCost: number
  profit: number
  margin: number | null
  costRate: number | null
  revenueShare: number | null
  profitDelta: number | null
  rank: number
}

interface DailyPerformanceRow {
  date: string
  revenue: number
  teacherCost: number
  operatingExpense: number
  totalCost: number
  profit: number
  margin: number | null
}

export function ProfitDashboard(props: {
  sections: ProfitCampusSection[]
  comparisonSections: ProfitCampusSection[]
  previousSections: ProfitCampusSection[]
  selectedCampusId: number
  periodLabel: string
  previousPeriodLabel: string
  onCampusSelect: (campusId: number) => void
  onDetail: (metric: DetailMetricKey, section: ProfitCampusSection, startDate: string, endDate: string) => void
}) {
  const totals = useMemo(() => summarize(props.sections), [props.sections])
  const previousScope = useMemo(
    () => props.selectedCampusId > 0
      ? props.previousSections.filter((section) => section.campusId === props.selectedCampusId)
      : props.previousSections,
    [props.previousSections, props.selectedCampusId],
  )
  const previousTotals = useMemo(() => summarize(previousScope), [previousScope])
  const dailyRows = useMemo(() => aggregateDaily(props.sections), [props.sections])
  const campusRows = useMemo(
    () => buildCampusRows(props.comparisonSections, props.previousSections),
    [props.comparisonSections, props.previousSections],
  )
  const detailSection = props.sections.length === 1 ? props.sections[0] : null
  const totalDays = dailyRows.length
  const profitableDays = dailyRows.filter((item) => item.profit > 0).length
  const bestCampus = [...campusRows].sort((left, right) => right.profit - left.profit)[0] || null
  const pressureCampus = [...campusRows]
    .filter((item) => item.costRate !== null)
    .sort((left, right) => numberOf(right.costRate) - numberOf(left.costRate))[0] || null
  const scopeName = props.selectedCampusId > 0 ? props.sections[0]?.campusName || '当前校区' : '全部校区'

  return (
    <div className="executive-dashboard">
      <section className="executive-overview" aria-labelledby="executive-overview-title">
        <header className="executive-section-head">
          <div>
            <span className="executive-eyebrow">BUSINESS OVERVIEW</span>
            <h2 id="executive-overview-title">经营结果总览</h2>
            <p>{scopeName} · {props.periodLabel}</p>
          </div>
          <div className={`executive-result-badge ${totals.profit > 0 ? 'is-positive' : totals.profit < 0 ? 'is-negative' : 'is-neutral'}`}>
            <span>经营结果</span>
            <strong>{totals.profit > 0 ? '盈利' : totals.profit < 0 ? '亏损' : '持平'}</strong>
          </div>
        </header>

        <div className="executive-kpi-grid">
          <KpiCard
            tone="revenue"
            label="销课收入"
            value={currency(totals.revenue)}
            note={`日均 ${currency(totalDays ? totals.revenue / totalDays : 0)}`}
            delta={changeRate(totals.revenue, previousTotals.revenue)}
            compareLabel={props.previousPeriodLabel}
            clickable={!!detailSection && totals.revenue > 0}
            onClick={() => detailSection && props.onDetail('revenue', detailSection, detailSection.daily.startDate || '', detailSection.daily.endDate || '')}
          />
          <KpiCard
            tone="cost"
            label="经营总成本"
            value={currency(totals.totalCost)}
            note={`课时 ${formatPercent(ratio(totals.teacherCost, totals.totalCost))} · 运营 ${formatPercent(ratio(totals.operatingExpense, totals.totalCost))}`}
            delta={changeRate(totals.totalCost, previousTotals.totalCost)}
            compareLabel={props.previousPeriodLabel}
            inverseDelta
          />
          <KpiCard
            tone={totals.profit < 0 ? 'loss' : 'profit'}
            label="经营利润"
            value={currency(totals.profit)}
            note="销课收入 − 课时成本 − 经营支出"
            delta={changeRate(totals.profit, previousTotals.profit)}
            compareLabel={props.previousPeriodLabel}
            inverseDelta={false}
          />
          <KpiCard
            tone="margin"
            label="利润率"
            value={formatPercent(totals.margin)}
            note={`成本率 ${formatPercent(totals.costRate)}`}
            delta={pointChange(totals.margin, previousTotals.margin)}
            compareLabel={props.previousPeriodLabel}
            deltaUnit="个百分点"
            inverseDelta={false}
          />
        </div>

        <div className="executive-insights" aria-label="经营洞察">
          <InsightItem
            icon={<TrophyOutlined />}
            label="利润贡献最高"
            value={bestCampus ? bestCampus.name : '暂无数据'}
            detail={bestCampus ? currency(bestCampus.profit) : '—'}
          />
          <InsightItem
            icon={<LineChartOutlined />}
            label="盈利天数"
            value={`${profitableDays} / ${totalDays} 天`}
            detail={totalDays ? `盈利天数占比 ${formatPercent(profitableDays / totalDays * 100)}` : '暂无每日数据'}
          />
          <InsightItem
            icon={<PieChartOutlined />}
            label="成本压力最高"
            value={pressureCampus ? pressureCampus.name : '暂无数据'}
            detail={pressureCampus ? `成本率 ${formatPercent(pressureCampus.costRate)}` : '—'}
          />
        </div>
      </section>

      <div className="executive-analysis-grid">
        <section className="executive-card executive-trend-card">
          <header className="executive-card-head">
            <div><h3>经营趋势</h3><p>收入、总成本与利润的每日变化</p></div>
            <LineChartOutlined />
          </header>
          <OperatingTrendChart rows={dailyRows} />
        </section>

        <section className="executive-card executive-cost-card">
          <header className="executive-card-head">
            <div><h3>成本构成</h3><p>总成本 {currency(totals.totalCost)}</p></div>
            <PieChartOutlined />
          </header>
          <CostStructure
            teacherCost={totals.teacherCost}
            operatingExpense={totals.operatingExpense}
            detailSection={detailSection}
            startDate={detailSection?.daily.startDate || ''}
            endDate={detailSection?.daily.endDate || ''}
            onDetail={props.onDetail}
          />
        </section>
      </div>

      <CampusComparison
        rows={campusRows}
        selectedCampusId={props.selectedCampusId}
        periodLabel={props.periodLabel}
        onCampusSelect={props.onCampusSelect}
      />

      <DailyPerformanceTable
        rows={dailyRows}
        scopeName={scopeName}
        periodLabel={props.periodLabel}
        detailSection={detailSection}
        onDetail={props.onDetail}
      />
    </div>
  )
}

function KpiCard(props: {
  tone: string
  label: string
  value: string
  note: string
  delta: number | null
  compareLabel: string
  deltaUnit?: string
  inverseDelta?: boolean
  clickable?: boolean
  onClick?: () => void
}) {
  const deltaPositive = numberOf(props.delta) >= 0
  const favorable = props.inverseDelta ? !deltaPositive : deltaPositive
  const content = (
    <>
      <span className="executive-kpi-label">{props.label}</span>
      <strong className="executive-kpi-value">{props.value}</strong>
      <span className="executive-kpi-note">{props.note}</span>
      <span className="executive-kpi-compare">
        {props.delta === null ? (
          <>较上期 <b className="is-neutral">—</b></>
        ) : (
          <>
            较上期
            <b className={favorable ? 'is-good' : 'is-bad'}>
              {deltaPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              {Math.abs(props.delta).toFixed(1)}{props.deltaUnit || '%'}
            </b>
          </>
        )}
        <small>{props.compareLabel ? `对比 ${props.compareLabel}` : ''}</small>
      </span>
      {props.clickable ? <span className="executive-kpi-action">查看明细 <RightOutlined /></span> : null}
    </>
  )
  return props.clickable ? (
    <button type="button" className={`executive-kpi is-${props.tone} is-clickable`} onClick={props.onClick}>{content}</button>
  ) : (
    <article className={`executive-kpi is-${props.tone}`}>{content}</article>
  )
}

function InsightItem(props: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="executive-insight-item">
      <span className="executive-insight-icon">{props.icon}</span>
      <div><span>{props.label}</span><strong>{props.value}</strong><small>{props.detail}</small></div>
    </div>
  )
}

function OperatingTrendChart(props: { rows: DailyPerformanceRow[] }) {
  const [visible, setVisible] = useState<Record<TrendMetric, boolean>>({ revenue: true, cost: true, profit: true })
  const series: Array<{ key: TrendMetric; label: string; color: string }> = [
    { key: 'revenue', label: '销课收入', color: '#14a67a' },
    { key: 'cost', label: '总成本', color: '#f59e0b' },
    { key: 'profit', label: '利润', color: '#4f6ff5' },
  ]
  const activeSeries = series.filter((item) => visible[item.key])
  const values = props.rows.flatMap((row) => activeSeries.map((item) => trendValue(row, item.key)))
  const domainMin = Math.min(0, ...values)
  const domainMax = Math.max(0, ...values)
  const range = domainMax - domainMin || 1
  const width = 760
  const height = 246
  const left = 58
  const right = 20
  const top = 18
  const bottom = 38
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const x = (index: number) => left + (props.rows.length <= 1 ? plotWidth / 2 : index / (props.rows.length - 1) * plotWidth)
  const y = (value: number) => top + (domainMax - value) / range * plotHeight
  const tickIndexes = chartTickIndexes(props.rows.length)
  const canToggle = (key: TrendMetric) => !visible[key] || activeSeries.length > 1

  return (
    <div className="executive-trend">
      <div className="executive-trend-legends">
        {series.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${visible[item.key] ? 'is-active' : ''} is-${item.key}`}
            aria-pressed={visible[item.key]}
            onClick={() => canToggle(item.key) && setVisible((current) => ({ ...current, [item.key]: !current[item.key] }))}
          >
            <i />{item.label}
          </button>
        ))}
      </div>
      {!props.rows.length || !props.rows.some((row) => row.revenue || row.totalCost || row.profit) ? (
        <div className="executive-chart-empty">当前周期暂无趋势数据</div>
      ) : (
        <div className="executive-chart-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每日收入、成本和利润趋势图">
            {[0, 1, 2, 3, 4].map((index) => {
              const value = domainMax - range * index / 4
              const position = y(value)
              return (
                <g key={index}>
                  <line x1={left} x2={width - right} y1={position} y2={position} className={Math.abs(value) < range / 1000 ? 'is-zero' : ''} />
                  <text x={left - 10} y={position + 4} textAnchor="end">{compactAmount(value)}</text>
                </g>
              )
            })}
            {tickIndexes.map((index) => (
              <text key={index} x={x(index)} y={height - 10} textAnchor="middle">
                {props.rows[index].date.slice(5).replace('-', '/')}
              </text>
            ))}
            {activeSeries.map((item) => {
              const points = props.rows.map((row, index) => `${x(index)},${y(trendValue(row, item.key))}`).join(' ')
              return (
                <g key={item.key} className={`executive-series is-${item.key}`}>
                  <polyline points={points} fill="none" stroke={item.color} vectorEffect="non-scaling-stroke" />
                  {props.rows.map((row, index) => (
                    <circle key={row.date} cx={x(index)} cy={y(trendValue(row, item.key))} r="3.4" fill={item.color}>
                      <title>{`${row.date} ${item.label} ${currency(trendValue(row, item.key))}`}</title>
                    </circle>
                  ))}
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}

function CostStructure(props: {
  teacherCost: number
  operatingExpense: number
  detailSection: ProfitCampusSection | null
  startDate: string
  endDate: string
  onDetail: (metric: DetailMetricKey, section: ProfitCampusSection, startDate: string, endDate: string) => void
}) {
  const total = props.teacherCost + props.operatingExpense
  const teacherShare = total > 0 ? props.teacherCost / total * 100 : 0
  const style = { '--teacher-stop': `${teacherShare}%` } as CSSProperties
  const entries: Array<{ key: DetailMetricKey; label: string; value: number; share: number }> = [
    { key: 'teacherCost', label: '课时成本', value: props.teacherCost, share: teacherShare },
    { key: 'operatingExpense', label: '经营支出', value: props.operatingExpense, share: total > 0 ? props.operatingExpense / total * 100 : 0 },
  ]
  return (
    <div className="executive-cost-structure">
      <div className={`executive-donut${total ? '' : ' is-empty'}`} style={style}>
        <div><span>总成本</span><strong>{compactCurrency(total)}</strong></div>
      </div>
      <div className="executive-cost-list">
        {entries.map((entry) => {
          const clickable = !!props.detailSection && entry.value > 0
          return (
            <button
              key={entry.key}
              type="button"
              disabled={!clickable}
              className={`is-${entry.key}`}
              onClick={() => props.detailSection && props.onDetail(entry.key, props.detailSection, props.startDate, props.endDate)}
            >
              <i />
              <span><b>{entry.label}</b><small>{formatPercent(entry.share)}</small></span>
              <strong>{currency(entry.value)}</strong>
              {clickable ? <RightOutlined /> : null}
            </button>
          )
        })}
        {!props.detailSection ? <p>选择单个校区后可下钻查看成本明细</p> : null}
      </div>
    </div>
  )
}

function CampusComparison(props: {
  rows: CampusPerformanceRow[]
  selectedCampusId: number
  periodLabel: string
  onCampusSelect: (campusId: number) => void
}) {
  const [metric, setMetric] = useState<ComparisonMetric>('profit')
  const ranked = [...props.rows].sort((left, right) => comparisonValue(right, metric) - comparisonValue(left, metric))
  const maxValue = Math.max(1, ...ranked.map((item) => Math.max(0, comparisonValue(item, metric))))
  const columns = [
    {
      title: '排名', dataIndex: 'rank', width: 72,
      render: (_: unknown, row: CampusPerformanceRow) => <span className={`executive-rank is-${Math.min(row.rank, 3)}`}>{row.rank}</span>,
    },
    {
      title: '校区', dataIndex: 'name', width: 160,
      render: (name: string, row: CampusPerformanceRow) => <span className="executive-campus-name"><strong>{name}</strong>{row.id === props.selectedCampusId ? <small>当前筛选</small> : null}</span>,
    },
    { title: '销课收入', dataIndex: 'revenue', width: 135, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => a.revenue - b.revenue, render: currency },
    { title: '课时成本', dataIndex: 'teacherCost', width: 125, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => a.teacherCost - b.teacherCost, render: currency },
    { title: '经营支出', dataIndex: 'operatingExpense', width: 125, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => a.operatingExpense - b.operatingExpense, render: currency },
    { title: '总成本', dataIndex: 'totalCost', width: 125, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => a.totalCost - b.totalCost, render: currency },
    {
      title: '利润', dataIndex: 'profit', width: 130,
      sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => a.profit - b.profit,
      defaultSortOrder: 'descend' as const,
      render: (value: number) => <strong className={value < 0 ? 'profit-negative' : 'profit-positive'}>{currency(value)}</strong>,
    },
    { title: '利润率', dataIndex: 'margin', width: 105, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => numberOf(a.margin) - numberOf(b.margin), render: formatPercent },
    { title: '成本率', dataIndex: 'costRate', width: 105, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => numberOf(a.costRate) - numberOf(b.costRate), render: formatPercent },
    { title: '收入贡献', dataIndex: 'revenueShare', width: 105, sorter: (a: CampusPerformanceRow, b: CampusPerformanceRow) => numberOf(a.revenueShare) - numberOf(b.revenueShare), render: formatPercent },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right' as const,
      render: (_: unknown, row: CampusPerformanceRow) => (
        <button type="button" className="executive-table-action" onClick={() => props.onCampusSelect(row.id)}>看校区 <RightOutlined /></button>
      ),
    },
  ]
  return (
    <section className="executive-card executive-campus-card">
      <header className="executive-card-head executive-campus-card-head">
        <div><h3>校区经营对比</h3><p>{props.periodLabel} · 可点击表头排序，快速识别高贡献与高成本校区</p></div>
        <div className="executive-metric-switch" aria-label="校区排名指标">
          {([
            ['profit', '按利润'],
            ['revenue', '按收入'],
            ['margin', '按利润率'],
          ] as Array<[ComparisonMetric, string]>).map(([key, label]) => (
            <button key={key} type="button" className={metric === key ? 'is-active' : ''} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>
          ))}
        </div>
      </header>

      {ranked.length ? (
        <div className="executive-campus-ranking">
          {ranked.map((row, index) => {
            const value = comparisonValue(row, metric)
            return (
              <button key={row.id} type="button" className={row.id === props.selectedCampusId ? 'is-selected' : ''} onClick={() => props.onCampusSelect(row.id)}>
                <span className="executive-ranking-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="executive-ranking-name">{row.name}</span>
                <span className="executive-ranking-track"><i style={{ width: `${Math.max(value > 0 ? 5 : 0, Math.max(0, value) / maxValue * 100)}%` }} /></span>
                <strong className={value < 0 ? 'profit-negative' : ''}>{metric === 'margin' ? formatPercent(value) : compactCurrency(value)}</strong>
              </button>
            )
          })}
        </div>
      ) : <div className="executive-chart-empty">暂无校区经营数据</div>}

      <div className="executive-table-wrap">
        <Table<CampusPerformanceRow>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={props.rows}
          pagination={false}
          scroll={{ x: 1350 }}
          locale={{ emptyText: '当前周期暂无校区经营数据' }}
          rowClassName={(row) => row.id === props.selectedCampusId ? 'is-selected' : ''}
        />
      </div>
    </section>
  )
}

function DailyPerformanceTable(props: {
  rows: DailyPerformanceRow[]
  scopeName: string
  periodLabel: string
  detailSection: ProfitCampusSection | null
  onDetail: (metric: DetailMetricKey, section: ProfitCampusSection, startDate: string, endDate: string) => void
}) {
  const metricCell = (metric: DetailMetricKey, row: DailyPerformanceRow, value: number) => {
    const clickable = !!props.detailSection && value > 0
    return clickable ? (
      <button type="button" className="executive-table-link" onClick={() => props.detailSection && props.onDetail(metric, props.detailSection, row.date, row.date)}>{currency(value)}</button>
    ) : currency(value)
  }
  const columns = [
    { title: '日期', dataIndex: 'date', width: 138, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.date.localeCompare(b.date), render: (date: string) => <span className="executive-date-cell"><strong>{date}</strong><small>{weekdayLabel(date)}</small></span> },
    { title: '销课收入', dataIndex: 'revenue', width: 145, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.revenue - b.revenue, render: (value: number, row: DailyPerformanceRow) => metricCell('revenue', row, value) },
    { title: '课时成本', dataIndex: 'teacherCost', width: 140, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.teacherCost - b.teacherCost, render: (value: number, row: DailyPerformanceRow) => metricCell('teacherCost', row, value) },
    { title: '经营支出', dataIndex: 'operatingExpense', width: 140, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.operatingExpense - b.operatingExpense, render: (value: number, row: DailyPerformanceRow) => metricCell('operatingExpense', row, value) },
    { title: '总成本', dataIndex: 'totalCost', width: 140, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.totalCost - b.totalCost, render: currency },
    { title: '利润', dataIndex: 'profit', width: 145, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => a.profit - b.profit, render: (value: number) => <strong className={value < 0 ? 'profit-negative' : 'profit-positive'}>{currency(value)}</strong> },
    { title: '利润率', dataIndex: 'margin', width: 120, sorter: (a: DailyPerformanceRow, b: DailyPerformanceRow) => numberOf(a.margin) - numberOf(b.margin), render: formatPercent },
    { title: '经营状态', key: 'status', width: 120, render: (_: unknown, row: DailyPerformanceRow) => <span className={`executive-status ${row.profit > 0 ? 'is-positive' : row.profit < 0 ? 'is-negative' : 'is-neutral'}`}>{row.profit > 0 ? '盈利' : row.profit < 0 ? '亏损' : '持平'}</span> },
  ]
  return (
    <section className="executive-card executive-daily-card">
      <header className="executive-card-head">
        <div><h3>每日经营明细</h3><p>{props.scopeName} · {props.periodLabel}{props.detailSection ? ' · 蓝色金额可下钻' : ' · 选择单个校区后可下钻'}</p></div>
        <span className="executive-row-count">共 {props.rows.length} 天</span>
      </header>
      <div className="executive-table-wrap">
        <Table<DailyPerformanceRow>
          rowKey="date"
          size="middle"
          columns={columns}
          dataSource={props.rows}
          pagination={props.rows.length > 12 ? { pageSize: 12, showSizeChanger: false } : false}
          scroll={{ x: 1088 }}
          locale={{ emptyText: '当前周期暂无每日经营数据' }}
        />
      </div>
    </section>
  )
}

function summarize(sections: ProfitCampusSection[]) {
  const revenue = sections.reduce((sum, section) => sum + metricAmount(section.daily, 'revenue'), 0)
  const teacherCost = sections.reduce((sum, section) => sum + metricAmount(section.daily, 'teacherCost'), 0)
  const operatingExpense = sections.reduce((sum, section) => sum + metricAmount(section.daily, 'operatingExpense'), 0)
  const profit = sections.reduce((sum, section) => sum + metricAmount(section.daily, 'profit'), 0)
  const totalCost = teacherCost + operatingExpense
  return {
    revenue,
    teacherCost,
    operatingExpense,
    totalCost,
    profit,
    margin: ratio(profit, revenue),
    costRate: ratio(totalCost, revenue),
  }
}

function aggregateDaily(sections: ProfitCampusSection[]): DailyPerformanceRow[] {
  const dates = new Map<string, DailyPerformanceRow>()
  sections.forEach((section) => section.items.forEach((item) => {
    if (!item.date) return
    const row = dates.get(item.date) || { date: item.date, revenue: 0, teacherCost: 0, operatingExpense: 0, totalCost: 0, profit: 0, margin: null }
    row.revenue += dailyMetricAmount(item, 'revenue')
    row.teacherCost += dailyMetricAmount(item, 'teacherCost')
    row.operatingExpense += dailyMetricAmount(item, 'operatingExpense')
    row.profit += dailyMetricAmount(item, 'profit')
    row.totalCost = row.teacherCost + row.operatingExpense
    row.margin = ratio(row.profit, row.revenue)
    dates.set(item.date, row)
  }))
  return [...dates.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function buildCampusRows(sections: ProfitCampusSection[], previousSections: ProfitCampusSection[]): CampusPerformanceRow[] {
  const institutionRevenue = sections.reduce((sum, section) => sum + metricAmount(section.daily, 'revenue'), 0)
  const previousByCampus = new Map(previousSections.map((section) => [section.campusId, section]))
  const rows = sections.map((section) => {
    const current = summarize([section])
    const previous = summarize(previousByCampus.has(section.campusId) ? [previousByCampus.get(section.campusId)!] : [])
    return {
      id: section.campusId,
      name: section.campusName,
      ...current,
      revenueShare: ratio(current.revenue, institutionRevenue),
      profitDelta: changeRate(current.profit, previous.profit),
      rank: 0,
    }
  })
  const rank = new Map([...rows].sort((left, right) => right.profit - left.profit).map((row, index) => [row.id, index + 1]))
  return rows.map((row) => ({ ...row, rank: rank.get(row.id) || rows.length }))
}

function trendValue(row: DailyPerformanceRow, metric: TrendMetric): number {
  if (metric === 'cost') return row.totalCost
  return row[metric]
}

function comparisonValue(row: CampusPerformanceRow, metric: ComparisonMetric): number {
  return metric === 'margin' ? numberOf(row.margin) : row[metric]
}

function ratio(value: number, base: number): number | null {
  return base === 0 ? null : value / base * 100
}

function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous) * 100
}

function pointChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  return current - previous
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
}

function compactCurrency(value: number): string {
  const absolute = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (absolute >= 100000000) return `${sign}¥${(absolute / 100000000).toFixed(1)}亿`
  if (absolute >= 10000) return `${sign}¥${(absolute / 10000).toFixed(1)}万`
  return currency(value)
}

function compactAmount(value: number): string {
  const absolute = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (absolute >= 10000) return `${sign}${(absolute / 10000).toFixed(1)}万`
  if (absolute >= 1000) return `${sign}${(absolute / 1000).toFixed(1)}k`
  return `${Math.round(value)}`
}

function chartTickIndexes(length: number): number[] {
  if (length <= 0) return []
  if (length <= 6) return Array.from({ length }, (_, index) => index)
  const indexes = new Set<number>()
  for (let index = 0; index < 6; index += 1) indexes.add(Math.round(index * (length - 1) / 5))
  return [...indexes]
}
