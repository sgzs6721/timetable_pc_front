import { useState } from 'react'
import { currency, PROFIT_METRICS, type ProfitChartGroup, type ProfitMetricKey } from './profit-model'

export function ProfitAnalysisChart(props: {
  groups: ProfitChartGroup[]
  selectedId?: string
  variant?: 'campus' | 'daily'
  emptyText?: string
  onSelect: (id: string) => void
}) {
  const [hidden, setHidden] = useState<Partial<Record<ProfitMetricKey, boolean>>>({})
  const visibleMetrics = PROFIT_METRICS.filter((metric) => !hidden[metric.key])
  const selected = props.groups.find((group) => group.id === props.selectedId) || null
  const hasData = props.groups.some((group) => PROFIT_METRICS.some((metric) => Number(group.values[metric.key] || 0) !== 0))
  const values = props.groups.flatMap((group) => visibleMetrics.map((metric) => group.values[metric.key] || 0))
  const positivePeak = Math.max(0, ...values.filter((value) => value > 0))
  const negativePeak = Math.max(0, ...values.filter((value) => value < 0).map(Math.abs))
  const hasNegative = negativePeak > 0
  const totalPeak = positivePeak + negativePeak
  const zeroLine = hasNegative && totalPeak > 0 ? 6 + negativePeak / totalPeak * 88 : 6
  const positiveSpace = 94 - zeroLine
  const negativeSpace = Math.max(1, zeroLine - 6)

  function toggleMetric(key: ProfitMetricKey) {
    if (!hidden[key] && visibleMetrics.length <= 1) return
    setHidden((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className={`profit-analysis-chart is-${props.variant || 'campus'}`}>
      <div className="profit-chart-legends">
        {PROFIT_METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={`profit-chart-legend is-${metric.key}${hidden[metric.key] ? ' is-hidden' : ''}`}
            aria-pressed={!hidden[metric.key]}
            onClick={() => toggleMetric(metric.key)}
          >
            <span className={`profit-chart-legend-dot is-${metric.key}`} />
            <span>{metric.label}</span>
            {selected && !hidden[metric.key] ? (
              <strong className={`profit-chart-legend-value${(selected.values[metric.key] || 0) < 0 ? ' profit-negative' : ''}`}>
                {currency(selected.values[metric.key])}
              </strong>
            ) : null}
          </button>
        ))}
      </div>

      {!props.groups.length || !hasData ? (
        <div className="profit-empty">{props.emptyText || '当前周期暂无数据'}</div>
      ) : (
        <div className="profit-chart-scroller">
          <div className={`profit-chart-groups${props.groups.length <= 4 ? ' is-sparse' : ''}`}>
            <span className="profit-chart-zero-axis-layer" aria-hidden="true">
              <i className="profit-chart-zero-axis" style={{ bottom: `${zeroLine}%` }} />
            </span>
            {props.groups.map((group) => {
              const active = group.id === props.selectedId
              const groupHasData = visibleMetrics.some((metric) => Number(group.values[metric.key] || 0) !== 0)
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`profit-chart-group${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => props.onSelect(active ? '' : group.id)}
                >
                  <span className="profit-chart-plot-area">
                    {groupHasData ? (
                      <span className="profit-chart-bars">
                        {visibleMetrics.map((metric) => {
                          const value = group.values[metric.key] || 0
                          const height = value >= 0
                            ? (positivePeak ? Math.max(value ? 5 : 0, value / positivePeak * positiveSpace) : 0)
                            : (negativePeak ? Math.max(5, Math.abs(value) / negativePeak * negativeSpace) : 0)
                          const bottom = value >= 0 ? zeroLine : zeroLine - height
                          return (
                            <span key={metric.key} className="profit-chart-bar-slot">
                              {value !== 0 ? (
                                <i
                                  title={`${metric.label} ${currency(value)}`}
                                  className={`profit-chart-bar is-${metric.key}${value < 0 ? ' is-negative' : ''}`}
                                  style={{ height: `${height}%`, bottom: `${Math.max(0, bottom)}%` }}
                                />
                              ) : null}
                            </span>
                          )
                        })}
                      </span>
                    ) : <span className="profit-chart-no-data">暂无数据</span>}
                  </span>
                  <strong className="profit-chart-group-label">{group.label}</strong>
                  {group.sub ? <small className="profit-chart-group-sub">{group.sub}</small> : null}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
