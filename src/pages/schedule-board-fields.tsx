import { Button, Form, Select, message } from 'antd'
import { todayIso } from './kit'
import type { TimetableGroup, Schedule } from './schedule-model'
import { DAY_LABELS, clockText, fromMinutes, timetableName, toMinutes } from './schedule-board-helpers'

export function WeekDaySelect(props: { value?: number[]; onChange?: (value: number[]) => void; disabled?: boolean }) {
  return (
    <Select
      mode="multiple"
      disabled={props.disabled}
      value={props.value}
      options={DAY_LABELS.map((label, index) => ({ value: index + 1, label: `周${label}` }))}
      onChange={(next) => {
        if (props.disabled) return
        if (!next.length) {
          message.warning('至少选择一天')
          return
        }
        props.onChange?.(next)
      }}
    />
  )
}

export function TimetableKindSelect(props: { value?: number; onChange?: (value: number) => void; disabled?: boolean }) {
  const form = Form.useFormInstance()
  const weekly = Number(props.value ?? 1) === 1
  function choose(next: number) {
    if (props.disabled || next === Number(props.value ?? 1)) return
    props.onChange?.(next)
    if (next !== 0) return
    if (!form.getFieldValue('startDate')) form.setFieldValue('startDate', todayIso())
    if (!form.getFieldValue('endDate')) form.setFieldValue('endDate', todayIso())
  }
  return (
    <div>
      <div className="work-toolbar">
        <Button htmlType="button" type={weekly ? 'primary' : 'default'} disabled={props.disabled} onClick={() => choose(1)}>周固定</Button>
        <Button htmlType="button" type={!weekly ? 'primary' : 'default'} disabled={props.disabled} onClick={() => choose(0)}>日期范围</Button>
        {props.disabled ? <span>已排课，不可修改</span> : null}
      </div>
      <p>{weekly ? '适合常规班次' : '适合短期课程'}</p>
    </div>
  )
}

export function timetableFormError(values: {
  name?: string
  createByMemberId?: number
  weekDays?: number[]
  startTime?: string
  endTime?: string
  isWeekly?: number
  startDate?: string
  endDate?: string
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
}, locked = false): string {
  const validTime = (value?: string) => /^(?:0[6-9]|1\d|2[0-2]):(?:00|30)$/.test(clockText(value)) || clockText(value) === '23:00'
  if (!timetableName(values.name)) return '请输入课表名称'
  if (locked) return ''
  if (!values.createByMemberId) return '请选择所属人员'
  if (!(values.weekDays || []).length) return '至少选择一天'
  if (!validTime(values.startTime) || !validTime(values.endTime)) return '课表时间只能选择06:00至23:00内的整点或半点'
  if (clockText(values.startTime) >= clockText(values.endTime)) return '结束时间必须晚于开始时间'
  if (Number(values.splitWeekend) === 1) {
    if (!validTime(values.weekendStartTime) || !validTime(values.weekendEndTime)) return '周末时间只能选择06:00至23:00内的整点或半点'
    if (clockText(values.weekendStartTime) >= clockText(values.weekendEndTime)) return '结束时间必须晚于开始时间'
  }
  if (Number(values.isWeekly) !== 1) {
    if (!values.startDate) return '请选择开始日期'
    if (!values.endDate) return '请选择结束日期'
    if (String(values.startDate) > String(values.endDate)) return '结束日期不能早于开始日期'
  }
  return ''
}

export function timetableBody(values: {
  name?: string
  createByMemberId?: number
  weekDays?: number[]
  startTime?: string
  endTime?: string
  isWeekly?: number
  startDate?: string
  endDate?: string
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
}, campusId: number, locked = false) {
  if (locked) return { name: timetableName(values.name) }
  const weekly = Number(values.isWeekly) === 1
  const split = Number(values.splitWeekend) === 1
  return {
    name: timetableName(values.name),
    campusId,
    createByMemberId: values.createByMemberId,
    isWeekly: weekly ? 1 : 0,
    startDate: weekly ? undefined : values.startDate,
    endDate: weekly ? undefined : values.endDate,
    startTime: clockText(values.startTime),
    endTime: clockText(values.endTime),
    timeIntervalMinutes: 60,
    weekDays: values.weekDays,
    splitWeekend: split ? 1 : 0,
    weekendStartTime: split ? clockText(values.weekendStartTime) : undefined,
    weekendEndTime: split ? clockText(values.weekendEndTime) : undefined,
    weekendTimeIntervalMinutes: split ? 60 : undefined,
    status: 1,
  }
}

export function lessonOverlaps(lesson: Schedule, day: number, date: string, start: string, end: string): boolean {
  const sameDay = lesson.scheduleDate ? lesson.scheduleDate === date : lesson.dayOfWeek === day
  if (!sameDay) return false
  return clockText(lesson.startTime) < end && start < clockText(lesson.endTime)
}

export function blankSegments(slot: { start: string; end: string }, lessons: Schedule[]): Array<{ start: string; end: string }> {
  const slotStart = toMinutes(slot.start)
  const slotEnd = toMinutes(slot.end)
  if (!(slotEnd > slotStart)) return []
  const covered = lessons
    .map((lesson) => ({
      start: Math.max(toMinutes(clockText(lesson.startTime)), slotStart),
      end: Math.min(toMinutes(clockText(lesson.endTime)), slotEnd),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start)
  const merged: Array<{ start: number; end: number }> = []
  covered.forEach((range) => {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) merged.push({ ...range })
    else last.end = Math.max(last.end, range.end)
  })
  const segments: Array<{ start: string; end: string }> = []
  let cursor = slotStart
  merged.forEach((range) => {
    if (range.start > cursor) segments.push({ start: fromMinutes(cursor), end: fromMinutes(range.start) })
    cursor = Math.max(cursor, range.end)
  })
  if (cursor < slotEnd) segments.push({ start: fromMinutes(cursor), end: fromMinutes(slotEnd) })
  return segments.filter((segment) => !(segment.start === slot.start && segment.end === slot.end))
}

export function pointerStart(clientY: number, element: HTMLElement, slot: { start: string; end: string }): string {
  const rect = element.getBoundingClientRect()
  const minutes = toMinutes(slot.end) - toMinutes(slot.start)
  if (minutes < 60 || rect.height <= 0) return slot.start
  const ratio = (clientY - rect.top) / rect.height
  if (ratio < 0.5) return slot.start
  return fromMinutes(toMinutes(slot.start) + Math.floor(minutes / 2))
}

export function dragPlacement(
  lesson: Schedule,
  target: { day: number; date: string; start: string; end: string },
  slots: Array<{ start: string; end: string }>,
  rows: Schedule[],
): { problem: string; endTime: string; canCopy: boolean } {
  if (lesson.uiChangeStatus === 4) return { problem: '占用时段不能拖动', endTime: target.end, canCopy: false }
  const duration = toMinutes(clockText(lesson.endTime)) - toMinutes(clockText(lesson.startTime))
  const endTime = duration > 0 ? fromMinutes(toMinutes(target.start) + duration) : target.end
  if (duration <= 0) return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  const covered = slots.filter((slot) => slot.start >= target.start && slot.start < endTime)
  const last = covered[covered.length - 1]
  if (!last || last.end < endTime) return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  const sameDay = lesson.scheduleDate ? lesson.scheduleDate === target.date : lesson.dayOfWeek === target.day
  if (sameDay && clockText(lesson.startTime) === target.start) return { problem: '请拖动到空白单元格', endTime, canCopy: false }
  if (rows.some((item) => lessonOverlaps(item, target.day, target.date, target.start, covered[0].end))) {
    return { problem: '请拖动到空白单元格', endTime, canCopy: false }
  }
  if (covered.slice(1).some((slot) => rows.some((item) => lessonOverlaps(item, target.day, target.date, slot.start, slot.end)))) {
    return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  }
  const overlapsSelf = sameDay && clockText(lesson.startTime) < endTime && target.start < clockText(lesson.endTime)
  return { problem: '', endTime, canCopy: !overlapsSelf }
}

export const SLOT_HEIGHT = 72

export function rangeFrame(start: string, end: string, slots: Array<{ start: string; end: string }>) {
  const origin = toMinutes(slots[0]?.start || '08:00')
  const step = Math.max(15, toMinutes(slots[0]?.end || '09:00') - origin)
  const startMin = toMinutes(start)
  const endMin = toMinutes(end)
  const top = ((startMin - origin) / step) * SLOT_HEIGHT + 2
  const height = Math.max(16, ((endMin - startMin) / step) * SLOT_HEIGHT - 4)
  return { top, height }
}

export function cardFrame(lesson: Schedule, slots: Array<{ start: string; end: string }>) {
  const origin = toMinutes(slots[0]?.start || '08:00')
  const step = Math.max(15, toMinutes(slots[0]?.end || '09:00') - origin)
  const start = toMinutes(clockText(lesson.startTime || slots[0]?.start))
  const end = toMinutes(clockText(lesson.endTime || slots[0]?.end))
  const top = ((start - origin) / step) * SLOT_HEIGHT
  const height = Math.max(36, ((Math.max(end, start + 15) - start) / step) * SLOT_HEIGHT - 4)
  return { top: Math.max(2, top + 2), height }
}

export function lessonClass(lesson: Schedule, extra = ''): string {
  const tone = Number(lesson.targetId || lesson.id || 0) % 5
  const status = lesson.uiChangeStatus === 3 ? ' is-leave' : lesson.uiChangeStatus === 4 ? ' is-occupy' : ` is-tone-${tone}`
  return `tt-card${status}${extra}`
}

export function batchKey(date: string, start: string, end: string): string {
  return `${date}|${start}|${end}`
}

export function parseBatchKey(key: string): { date: string; start: string; end: string } {
  const [date, start, end] = key.split('|')
  if (end) return { date, start, end }
  const [legacyDate, legacyStart] = key.split(' ')
  return { date: legacyDate, start: legacyStart, end: '' }
}

export function toggleBatchRange(batch: string[], date: string, start: string, end: string): string[] {
  const key = batchKey(date, start, end)
  if (batch.includes(key)) return batch.filter((item) => item !== key)
  const startMin = toMinutes(start)
  const endMin = toMinutes(end)
  return [
    ...batch.filter((item) => {
      const parsed = parseBatchKey(item)
      if (parsed.date !== date || !parsed.end) return false
      return toMinutes(parsed.end) <= startMin || toMinutes(parsed.start) >= endMin
    }),
    key,
  ]
}

export function mergeRanges(items: Array<{ day: number; date: string; start: string; end: string }>) {
  const grouped = new Map<string, Array<{ day: number; date: string; start: string; end: string }>>()
  items.forEach((item) => {
    const key = `${item.date}`
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  const merged: typeof items = []
  grouped.forEach((list) => {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    let current = { ...sorted[0] }
    sorted.slice(1).forEach((item) => {
      if (current.end === item.start) current = { ...current, end: item.end }
      else {
        merged.push(current)
        current = { ...item }
      }
    })
    merged.push(current)
  })
  return merged
}

export function timetableOwner(groups: TimetableGroup[], timetableId: number): TimetableGroup | undefined {
  return groups.find((group) => [...(group.activeTimetables || []), ...(group.archivedTimetables || [])].some((item) => item.id === timetableId))
}
