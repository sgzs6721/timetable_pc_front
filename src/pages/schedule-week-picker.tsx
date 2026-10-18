import { Dropdown } from 'antd'
import { weekChipLabel } from './schedule-board-helpers'
import type { InstantiatedWeekOption } from './schedule-policy'

export function ScheduleWeekPicker(props: {
  mode: 'instance' | 'template'
  weekStart: string
  weeks: InstantiatedWeekOption[]
  loading: boolean
  showTemplate?: boolean
  onModeChange: (mode: 'instance' | 'template') => void
  onWeekChange: (weekStart: string) => void
}) {
  return (
    <div className="tt-modes tt-toolbar-modes">
      {props.mode === 'instance' ? (
        <Dropdown
          trigger={['click']}
          menu={{
            items: props.weeks.length
              ? props.weeks.map((item) => ({ key: item.weekStart, label: `${item.label}${item.current ? ' · 本周' : ''} · ${item.instanceCount}课时` }))
              : [{ key: 'empty', label: props.loading ? '正在加载...' : '暂无已实例化的日期区间', disabled: true }],
            onClick: ({ key }) => { if (key !== 'empty') props.onWeekChange(key) },
          }}
        >
          <button type="button" className="is-on" aria-label="选择已实例化日期区间">{weekChipLabel(props.weekStart)} <span aria-hidden="true">⌄</span></button>
        </Dropdown>
      ) : <button type="button" onClick={() => props.onModeChange('instance')}>{weekChipLabel(props.weekStart)}</button>}
      {props.showTemplate ? <button type="button" className={props.mode === 'template' ? 'is-on' : ''} onClick={() => props.onModeChange('template')}>固定课表</button> : null}
    </div>
  )
}
