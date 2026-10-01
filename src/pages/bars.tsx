import { useState } from 'react'
import { money } from './kit'

export interface BarMetric {
  key: string
  label: string
  tone: string
}

export function MetricBars(props: {
  metrics: BarMetric[]
  groups: Array<{ id: string; label: string; sub?: string; values: Record<string, number> }>
  onSelect?: (id: string) => void
  emptyText?: string
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState('')
  const visible = props.metrics.filter((item) => !hidden[item.key])
  const picked = props.groups.find((item) => item.id === selected) || null
  const peak = Math.max(1, ...props.groups.flatMap((group) => visible.map((item) => Math.abs(group.values[item.key] || 0))))
  const hasNegative = props.groups.some((group) => visible.some((item) => (group.values[item.key] || 0) < 0))
  const zero = hasNegative ? 58 : 0
  if (!props.groups.length) return <p>{props.emptyText || '当前周期暂无数据'}</p>
  return (
    <div className="profit-chart">
      <div className="profit-chart-legend">
        {props.metrics.map((item) => (
          <button
            key={item.key}
            type="button"
            className={hidden[item.key] ? 'is-off' : ''}
            onClick={() => setHidden({ ...hidden, [item.key]: !hidden[item.key] })}
          >
            <i className={`tone-${item.tone}`} />
            <span>{item.label}</span>
            {picked && !hidden[item.key] ? <b className={(picked.values[item.key] || 0) < 0 ? 'is-down' : ''}>{money(picked.values[item.key])}</b> : null}
          </button>
        ))}
      </div>
      <div className="profit-chart-scroll">
        {props.groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === selected ? 'profit-chart-group is-on' : 'profit-chart-group'}
            onClick={() => {
              const next = group.id === selected ? '' : group.id
              setSelected(next)
              if (props.onSelect && next) props.onSelect(group.id)
            }}
          >
            <span className="profit-chart-plot">
              <em style={{ bottom: `${zero}%` }} />
              {visible.map((item) => {
                const value = group.values[item.key] || 0
                const span = hasNegative ? 40 : 92
                const height = `${Math.abs(value) / peak * span}%`
                const bottom = value < 0 ? `calc(${zero}% - ${height})` : `${zero}%`
                return <i key={item.key} className={`tone-${item.tone}${value < 0 ? ' is-down' : ''}${value === 0 ? ' is-empty' : ''}`} style={{ height: value === 0 ? '2px' : height, bottom }} />
              })}
            </span>
            <strong>{group.label}</strong>
            {group.sub ? <small>{group.sub}</small> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
