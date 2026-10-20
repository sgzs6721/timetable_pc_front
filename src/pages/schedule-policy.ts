import { todayIso } from './kit'
import type { Schedule, Timetable } from './schedule-model'

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const ALL_WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7]

export interface InstantiatedWeek {
  weekStart?: string
  weekEnd?: string
  instanceCount?: number
}

export interface InstantiatedWeekOption {
  key: string
  weekStart: string
  weekEnd: string
  label: string
  instanceCount: number
  current: boolean
}

export interface TimetableSummary {
  dateRangeText: string
  weekCountText: string
  scheduleRanges: Array<{ label: string; text: string }>
}

function isoDate(value?: string | null): string {
  const normalized = String(value || '').trim().slice(0, 10).replace(/\./g, '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function dateObject(value: string): Date | null {
  const normalized = isoDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function monday(value: string): string {
  const parsed = dateObject(value)
  if (!parsed) return ''
  const day = parsed.getDay() || 7
  parsed.setDate(parsed.getDate() - day + 1)
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const date = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${date}`
}

function addDays(value: string, count: number): string {
  const parsed = dateObject(value)
  if (!parsed) return ''
  parsed.setDate(parsed.getDate() + count)
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const date = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${date}`
}

export function latestIsoDate(...values: Array<string | undefined | null>): string {
  return values.map(isoDate).filter(Boolean).sort().pop() || ''
}

export function timetableDateRangeError(
  values: Pick<Timetable, 'startDate' | 'endDate'>,
  original?: Pick<Timetable, 'startDate' | 'endDate'> | null,
  today = todayIso(),
): string {
  const start = isoDate(values.startDate)
  const end = isoDate(values.endDate)
  const originalStart = isoDate(original?.startDate)
  const originalEnd = isoDate(original?.endDate)
  if (!start || !end) return '请选择开始日期和结束日期'
  if (original && originalStart && originalStart < today && start !== originalStart) return '已生效的开始日期不可修改'
  if ((!original || start !== originalStart) && start < today) return '开始日期不能早于今天'
  if ((!original || end !== originalEnd) && end < today) return '结束日期不能早于今天'
  if (original && originalEnd && end !== originalEnd && end < originalEnd) return '结束日期只能往后延长'
  if (start > end) return '结束日期不能早于开始日期'
  return ''
}

export function isOutsideTimetableDateRange(timetable: Timetable | null | undefined, date?: string | null): boolean {
  const target = isoDate(date)
  if (!target) return false
  const start = isoDate(timetable?.startDate)
  const end = isoDate(timetable?.endDate)
  return (!!start && target < start) || (!!end && target > end)
}

/** 固定课表的有效期内是否至少实际出现过目标星期；旧数据缺少边界时保持可编辑。 */
export function dateRangeIncludesDayOfWeek(
  startDate?: string | null,
  endDate?: string | null,
  dayOfWeek?: number | null,
): boolean {
  const targetDay = Number(dayOfWeek || 0)
  if (targetDay < 1 || targetDay > 7) return true
  const start = dateObject(isoDate(startDate))
  const end = dateObject(isoDate(endDate))
  if (!start || !end) return true
  if (end < start) return false
  const startDay = start.getDay() || 7
  const first = new Date(start)
  first.setDate(start.getDate() + ((targetDay - startDay + 7) % 7))
  return first <= end
}

export function scheduleDateIssue(
  timetable: Timetable | null | undefined,
  date: string | null | undefined,
  teacherPastScheduleEditable: boolean,
  manager: boolean,
): string {
  const target = isoDate(date)
  if (!target) return ''
  const start = isoDate(timetable?.startDate)
  const end = isoDate(timetable?.endDate)
  if (start && target < start) return '排课日期不能早于课表开始日期'
  if (end && target > end) return '排课日期不能晚于课表结束日期'
  if (!manager && !teacherPastScheduleEditable && target < todayIso()) return '管理员未开启老师修改历史课表权限'
  return ''
}

export function buildInstantiatedWeekOptions(rows?: InstantiatedWeek[] | null): InstantiatedWeekOption[] {
  const currentMonday = monday(todayIso())
  return (rows || []).flatMap((row) => {
    const weekStart = isoDate(row.weekStart)
    const weekEnd = isoDate(row.weekEnd) || addDays(weekStart, 6)
    if (!weekStart || !weekEnd) return []
    return [{
      key: weekStart,
      weekStart,
      weekEnd,
      label: `${weekStart.slice(5).replace('-', '.')}～${weekEnd.slice(5).replace('-', '.')}`,
      instanceCount: Math.max(0, Number(row.instanceCount || 0)),
      current: weekStart === currentMonday,
    }]
  }).sort((left, right) => right.weekStart.localeCompare(left.weekStart))
}

function normalizedWeekDays(value?: number[]): number[] {
  const days = (value || []).map(Number).filter((day, index, rows) => day >= 1 && day <= 7 && rows.indexOf(day) === index).sort((a, b) => a - b)
  return days.length ? days : ALL_WEEK_DAYS
}

function timeText(value?: string): string {
  return String(value || '').slice(0, 5)
}

function timeRange(start?: string, end?: string): string {
  const first = timeText(start)
  const last = timeText(end)
  if (first && last) return `${first} ~ ${last}`
  if (first) return `${first} 起`
  return last ? `至 ${last}` : ''
}

function weekdayRange(days: number[]): string {
  const normalized = normalizedWeekDays(days)
  const labels = normalized.map((day) => `周${DAY_LABELS[day - 1]}`)
  const contiguous = normalized.every((day, index) => index === 0 || day === normalized[index - 1] + 1)
  if (labels.length <= 1) return labels[0] || ''
  return contiguous ? `${labels[0]} ~ ${labels[labels.length - 1]}` : labels.join('、')
}

function weeksBetween(start?: string, end?: string): number {
  const first = dateObject(isoDate(start))
  const last = dateObject(isoDate(end))
  if (!first || !last || last < first) return 0
  return Math.ceil((last.getTime() - first.getTime() + 86400000) / (7 * 86400000))
}

export function buildTimetableSummary(timetable?: Timetable | null): TimetableSummary {
  if (!timetable) return { dateRangeText: '', weekCountText: '', scheduleRanges: [] }
  const start = isoDate(timetable.startDate).replace(/-/g, '.')
  const end = isoDate(timetable.endDate).replace(/-/g, '.')
  const dateRangeText = start && end ? `${start} ~ ${end}` : start ? `${start} 起` : end ? `至 ${end}` : ''
  const days = normalizedWeekDays(timetable.weekDays)
  const weekday = days.filter((day) => day <= 5)
  const weekend = days.filter((day) => day >= 6)
  const main = timeRange(timetable.startTime, timetable.endTime)
  const weekendTime = timeRange(timetable.weekendStartTime || timetable.startTime, timetable.weekendEndTime || timetable.endTime)
  const split = Number(timetable.splitWeekend || 0) === 1 && weekday.length > 0 && weekend.length > 0 && main !== weekendTime
  const scheduleRanges = split
    ? [
        { label: '周中时间', text: `${weekdayRange(weekday)} · ${main}` },
        { label: '周末时间', text: `${weekdayRange(weekend)} · ${weekendTime}` },
      ]
    : [{ label: '上课时间', text: `${weekdayRange(days)} · ${Number(timetable.splitWeekend || 0) === 1 && !weekday.length ? weekendTime : main}` }]
  const totalWeeks = weeksBetween(timetable.startDate, timetable.endDate)
  return {
    dateRangeText,
    weekCountText: totalWeeks > 0 ? `共 ${totalWeeks} 周` : '',
    scheduleRanges: scheduleRanges.filter((item) => item.text.replace(/[·\s]/g, '')),
  }
}

function directStudentSchedule(row: Schedule): boolean {
  const type = String(row.targetType || '').trim().toLowerCase()
  return type === 'student' || type === '学员' || (!type && (Number(row.primaryStudentId || 0) > 0 || Number(row.targetId || 0) > 0))
}

export function scheduleGenderTone(row: Schedule): 'male' | 'female' | 'neutral' {
  if (!directStudentSchedule(row)) return 'neutral'
  const targetId = Number(row.targetId || row.primaryStudentId || 0)
  const instance = (row.studentInstances || []).find((item) => Number(item.studentId || 0) === targetId) || row.studentInstances?.[0]
  const gender = String(instance?.gender ?? '').trim().toLowerCase()
  if (['1', 'male', 'm', '男'].includes(gender)) return 'male'
  if (['2', 'female', 'f', '女'].includes(gender)) return 'female'
  return 'neutral'
}

export function isDirectStudentSchedule(row: Schedule): boolean {
  return directStudentSchedule(row)
}

export function isScheduleConflictMessage(value?: string | null): boolean {
  const text = String(value || '')
  return text.includes('排课时间冲突') || text.includes('时间冲突') || text.includes('冲突') || text.includes('重叠')
}
