import { Button, Checkbox, Modal, message } from 'antd'
import { Fragment } from 'react'
import type { Schedule, DayCourse, DayDialog } from './schedule-model'
import { clockText } from './schedule-board-helpers'

export function toDayCourses(rows: Schedule[], sourceTitle = '', coachLabel = ''): DayCourse[] {
  return rows
    .filter((item) => Number(item.uiChangeStatus || 0) !== 3 && Number(item.uiChangeStatus || 0) !== 4)
    .filter((item) => String(item.courseName || '').trim())
    .map((item) => ({
      id: item.id,
      start: clockText(item.startTime),
      end: clockText(item.endTime),
      name: String(item.displayName || item.courseName || '').replace(/^[>\s]+/, '').trim(),
      statusText: Number(item.uiChangeStatus || 0) === 2 ? '已调整' : '正常',
      coachLabel: sourceTitle ? (String(item.coachName || '').trim() || coachLabel) : '',
      sourceTitle,
    }))
    .sort((left, right) => left.start.localeCompare(right.start) || left.name.localeCompare(right.name))
}

export function mergeDayCourses(own: DayCourse[], others: DayCourse[], includeOthers: boolean): DayCourse[] {
  const merged = includeOthers ? [...own, ...others] : [...own]
  return merged.sort((left, right) => {
    const timeCompare = left.start.localeCompare(right.start)
    if (timeCompare !== 0) return timeCompare
    const sourceCompare = Number(!!left.sourceTitle) - Number(!!right.sourceTitle)
    if (sourceCompare !== 0) return sourceCompare
    return left.coachLabel.localeCompare(right.coachLabel)
  })
}

export async function copyScheduleText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 浏览器未授权剪贴板时，改用选中文本复制。
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  return copied
}

export function dayClipboard(dialog: DayDialog, items: DayCourse[]): string {
  const [year, month, day] = dialog.date.split('-')
  const dateLabel = year && month && day ? `${year}/${month}/${day}` : dialog.date
  const header = [dateLabel, dialog.dayLabel].filter(Boolean).join(' · ')
  const lines = items.map((item) => {
    const time = item.start && item.end ? `${item.start}-${item.end}` : item.start
    const main = [time, item.name].filter(Boolean).join(' ')
    const suffix = [item.statusText !== '正常' ? item.statusText : '', item.coachLabel].filter(Boolean)
    return suffix.length ? `${main}（${suffix.join(' · ')}）` : main
  }).filter(Boolean)
  return [[header ? `${header}课程安排` : '课程安排', dialog.teacherName ? `${dialog.teacherName}：` : ''].filter(Boolean).join('\n'), ...lines].filter(Boolean).join('\n')
}

export function DayScheduleDialog(props: { dialog: DayDialog; timetableName: string; onChange: (next: DayDialog) => void }) {
  const dialog = props.dialog
  const visible = mergeDayCourses(dialog.own, dialog.others, dialog.showOthers)
  const copyItems = mergeDayCourses(dialog.own, dialog.others, dialog.copyOthers && dialog.others.length > 0)
  const pairs = pairDayCourses(visible)
  const otherGroups = new Map<string, DayCourse[]>()
  dialog.others.forEach((item) => {
    const key = item.sourceTitle || '其他老师课程'
    otherGroups.set(key, [...(otherGroups.get(key) || []), item])
  })
  const [year, month, day] = dialog.date.split('-')
  const dateLabel = year && month && day ? `${year}/${month}/${day}` : dialog.date
  return (
    <div>
      <p className="range-label">{props.timetableName} · {dialog.teacherName || '当前课表老师'} · {dateLabel}（{dialog.dayLabel}）</p>
      {dialog.others.length ? (
        <div className="day-other">
          <button type="button" onClick={() => props.onChange({ ...dialog, showOthers: !dialog.showOthers })}>
            其他老师课程（{dialog.date}） {dialog.showOthers ? '收起' : '展开'}
          </button>
          {dialog.showOthers ? Array.from(otherGroups.entries()).map(([title, items]) => {
            const open = !dialog.collapsed.includes(title)
            return (
              <div key={title}>
                <button type="button" onClick={() => props.onChange({ ...dialog, collapsed: open ? [...dialog.collapsed, title] : dialog.collapsed.filter((item) => item !== title) })}>{title} {open ? '⌄' : '›'}</button>
                {open ? items.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="range-label">{item.start}{item.end ? `–${item.end}` : ''} {item.name}{item.statusText !== '正常' ? ` · ${item.statusText}` : ''}</div>
                )) : null}
              </div>
            )
          }) : null}
        </div>
      ) : null}
      {pairs.length ? (
        <div className="day-table is-pairs">
          <div className="is-head">时间</div>
          <div className="is-head">学员</div>
          <div className="is-head">时间</div>
          <div className="is-head">学员</div>
          {pairs.map((row) => (
            <Fragment key={row.key}>
              <div>{row.left.time}</div>
              <div>{row.left.name}</div>
              <div>{row.right?.time || ''}</div>
              <div>{row.right?.name || ''}</div>
            </Fragment>
          ))}
        </div>
      ) : (
        <>
          <p>这一天还没有课程安排</p>
          <p>{dialog.showOthers ? '当前日期下，当前课表和其他老师都还没有可展示的课程。' : '后续新增课程后，会自动在这里列出当天的全部安排。'}</p>
        </>
      )}
      <div className="work-toolbar" style={{ marginTop: 12 }}>
        {dialog.others.length ? (
          <Checkbox checked={dialog.copyOthers} onChange={(event) => props.onChange({ ...dialog, copyOthers: event.target.checked })}>复制其他老师课程</Checkbox>
        ) : null}
        <Button type="primary" disabled={!copyItems.length} onClick={async () => {
          const text = dayClipboard(dialog, copyItems)
          if (!text) {
            message.info('当前没有可复制的课程')
            return
          }
          const copied = await copyScheduleText(text)
          if (copied) {
            message.success('已复制到剪贴板')
            return
          }
          Modal.info({ title: '复制课程', content: text, okText: '知道了' })
        }}>复制课程</Button>
      </div>
    </div>
  )
}

export function pairDayCourses(items: DayCourse[]): Array<{ key: string; left: { time: string; name: string }; right?: { time: string; name: string } }> {
  const grouped = new Map<string, DayCourse[]>()
  items.forEach((item) => {
    const key = `${item.start}|${item.end}`
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  const cells = Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, rows]) => ({
    key,
    time: rows[0].start && rows[0].end ? `${rows[0].start}\n${rows[0].end}` : rows[0].start || '--',
    name: Array.from(new Set(rows.map((item) => item.name).filter(Boolean))).join(' / '),
  }))
  const pairs: Array<{ key: string; left: { time: string; name: string }; right?: { time: string; name: string } }> = []
  for (let index = 0; index < cells.length; index += 2) {
    pairs.push({ key: cells[index].key, left: cells[index], right: cells[index + 1] })
  }
  return pairs
}
