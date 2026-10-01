import { Table } from 'antd'
import type { Schedule } from './schedule-model'
import { DAY_LABELS, clockText } from './schedule-board-helpers'

export function LookupTable(props: { rows: Schedule[] }) {
  return (
    <Table
      rowKey={(row, index) => `${row.id || 'row'}-${index}`}
      dataSource={props.rows}
      pagination={false}
      locale={{ emptyText: '没有排课' }}
      columns={[
        { title: '日期', render: (_: unknown, row: Schedule) => row.scheduleDate || (row.dayOfWeek ? `周${DAY_LABELS[(row.dayOfWeek || 1) - 1]}` : '') },
        { title: '时间', render: (_: unknown, row: Schedule) => `${clockText(row.startTime)}${row.endTime ? `–${clockText(row.endTime)}` : ''}` },
        { title: '课程', render: (_: unknown, row: Schedule) => row.displayName || row.courseName },
        { title: '老师', dataIndex: 'coachName' },
      ]}
    />
  )
}

export function overviewType(targetType?: string): string {
  const normalized = String(targetType || '').trim().toLowerCase()
  if (normalized === 'course' || normalized === '课程' || normalized === '班级') return '班级'
  if (normalized === 'preset' || normalized === '预设') return '预设'
  return '学员'
}

export function overviewWeekday(row: Schedule): string {
  if (!row.dayOfWeek) return ''
  return `周${DAY_LABELS[(row.dayOfWeek || 1) - 1] || ''}`
}

export function overviewDateLabel(value?: string): string {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return ''
  const [year, month, day] = text.slice(0, 10).split('-')
  return `${year}/${month}/${day}`
}

export function overviewName(row: Schedule): string {
  return String(row.displayName || row.courseName || '未命名学员').replace(/^[>\s]+/, '').trim() || '未命名学员'
}

export function overviewTime(row: Schedule): string {
  const start = String(row.startTime || '').slice(0, 5)
  const end = String(row.endTime || '').slice(0, 5)
  return start && end ? `${start}-${end}` : start || '--'
}

export function overviewStudentCount(rows: Schedule[]): number {
  return new Set(rows.map((row) => String(row.displayName || row.courseName || '未命名学员').replace(/^[>\s]+/, '').trim() || '未命名学员')).size
}

export function overviewDateSections(rows: Schedule[]) {
  const sections = new Map<string, { key: string; dateLabel: string; weekdayLabel: string; countText: string; items: Array<{ key: string; name: string; type: string; time: string }> }>()
  rows.forEach((row, index) => {
    const weekdayLabel = overviewWeekday(row)
    const dateLabel = overviewDateLabel(row.scheduleDate)
    const dateKey = row.scheduleDate || `${weekdayLabel}|${overviewTime(row)}`
    const key = `${dateKey}|${weekdayLabel}`
    const item = {
      key: `${row.id || index}|${dateKey}|${overviewTime(row)}|${overviewName(row)}`,
      name: overviewName(row),
      type: overviewType(row.targetType),
      time: overviewTime(row),
    }
    const existing = sections.get(key)
    if (existing) {
      existing.items.push(item)
      existing.countText = `${existing.items.length} 节课`
      return
    }
    sections.set(key, { key, dateLabel, weekdayLabel, countText: '1 节课', items: [item] })
  })
  return Array.from(sections.values())
}

export function overviewStudentSections(rows: Schedule[]) {
  const sections = new Map<string, { key: string; name: string; type: string; countText: string; items: Array<{ key: string; weekdayLabel: string; time: string; dateKey: string }> }>()
  rows.forEach((row, index) => {
    if (!String(row.courseName || '').trim()) return
    const name = overviewName(row)
    const dateKey = row.scheduleDate || `${overviewWeekday(row)}|${overviewTime(row)}`
    const item = {
      key: `${name}|${dateKey}|${overviewTime(row)}|${row.id || index}`,
      weekdayLabel: overviewWeekday(row),
      time: overviewTime(row),
      dateKey,
    }
    const existing = sections.get(name)
    if (existing) {
      existing.items.push(item)
      existing.countText = `${existing.items.length} 节课`
      return
    }
    sections.set(name, { key: name, name, type: overviewType(row.targetType), countText: '1 节课', items: [item] })
  })
  return Array.from(sections.values()).map((section) => ({
    ...section,
    items: section.items.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.time.localeCompare(right.time)),
  }))
}
