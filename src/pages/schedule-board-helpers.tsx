import { todayIso } from './kit'
import type { Timetable, Schedule } from './schedule-model'

export const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export function formatIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return formatIso(date)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return formatIso(date)
}

export function datePart(value?: string): string {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function weekLimits(item: Timetable | null, viewingMonday: string): { min: string; max: string; canPrev: boolean; canNext: boolean } {
  const weekly = Number(item?.isWeekly) === 1
  const min = weekly
    ? (datePart(item?.createTime) ? mondayOf(datePart(item?.createTime)) : '')
    : (datePart(item?.startDate) ? mondayOf(datePart(item?.startDate)) : '')
  const max = weekly
    ? addDays(mondayOf(todayIso()), 7)
    : (datePart(item?.endDate) ? mondayOf(datePart(item?.endDate)) : '')
  return {
    min,
    max,
    canPrev: !min || viewingMonday > min,
    canNext: !max || addDays(viewingMonday, 7) <= max,
  }
}

export function boardHoursText(rows: Schedule[]): string {
  const seen = new Set<string>()
  let minutes = 0
  rows.forEach((row, index) => {
    if (Number(row.uiChangeStatus) === 3) return
    const id = Number(row.id || 0)
    const key = id > 0 ? `id:${id}` : `${row.scheduleDate}|${row.dayOfWeek}|${row.startTime}|${row.endTime}|${row.courseName}|${index}`
    if (seen.has(key)) return
    seen.add(key)
    const start = toMinutes(clockText(row.startTime))
    const end = toMinutes(clockText(row.endTime))
    if (end > start) minutes += end - start
  })
  if (minutes <= 0) return '0'
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '')
}

export function slotsOf(timetable?: Timetable | null): Array<{ start: string; end: string }> {
  const start = timetable?.startTime || '08:00'
  const end = timetable?.endTime || '21:00'
  const step = timetable?.timeIntervalMinutes || 30
  const slots: Array<{ start: string; end: string }> = []
  let cursor = toMinutes(start)
  const last = toMinutes(end)
  while (cursor + step <= last) {
    slots.push({ start: fromMinutes(cursor), end: fromMinutes(cursor + step) })
    cursor += step
  }
  return slots
}

export function parseTrialConfig(value: unknown): { enabled: boolean; half: boolean; hour: boolean } {
  const fallback = { enabled: true, half: true, hour: true }
  let parsed: unknown = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return fallback }
  }
  if (!parsed || typeof parsed !== 'object') return fallback
  const item = parsed as { enabled?: boolean; halfHourEnabled?: boolean; oneHourEnabled?: boolean }
  const half = item.halfHourEnabled !== false
  const hour = item.oneHourEnabled !== false
  if (item.enabled !== false && !half && !hour) return fallback
  return { enabled: item.enabled !== false, half, hour }
}

export function toMinutes(value: string): number {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return hour * 60 + minute
}

export function fromMinutes(value: number): string {
  return `${`${Math.floor(value / 60)}`.padStart(2, '0')}:${`${value % 60}`.padStart(2, '0')}`
}

export function durationLabel(minutes: number): string {
  if (minutes <= 0) return ''
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`
}

export function freeUntil(start: string, lessons: Schedule[], selfId: number | undefined, dayEnd: string): number {
  const startMin = toMinutes(start)
  let limit = toMinutes(dayEnd)
  lessons.forEach((lesson) => {
    if (selfId && lesson.id === selfId) return
    const lessonStart = toMinutes(clockText(lesson.startTime))
    const lessonEnd = toMinutes(clockText(lesson.endTime))
    if (!Number.isFinite(lessonStart) || !Number.isFinite(lessonEnd) || lessonEnd <= startMin) return
    if (lessonStart <= startMin) {
      limit = startMin
      return
    }
    if (lessonStart < limit) limit = lessonStart
  })
  return limit
}

export function genderIconName(gender?: number): string {
  if (Number(gender) === 2) return 'icon-gender-female'
  if (Number(gender) === 1) return 'icon-gender-male'
  return ''
}

export function ownerGenderIcon(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === '1' || normalized === 'male' || normalized === 'm' || normalized === '男') return 'icon-gender-male'
  if (normalized === '2' || normalized === 'female' || normalized === 'f' || normalized === '女') return 'icon-gender-female'
  return ''
}

export function timetablePositionName(item: Timetable, campusId: number | null): string {
  const names = item.createByMemberCampusPositionNames || {}
  const scheduled = (item.scheduleCampusIds || []).map((id) => Number(id)).filter((id) => id > 0)
  const campusIds = scheduled.length
    ? scheduled
    : (Number(item.campusId || 0) > 0 ? [Number(item.campusId)] : (item.createByMemberCampusIds || []).map((id) => Number(id)).filter((id) => id > 0))
  const preferred = campusId && names[String(campusId)]
    ? [names[String(campusId)]]
    : campusIds.map((id) => names[String(id)]).filter(Boolean)
  const unique = Array.from(new Set(preferred.map((name) => String(name).trim()).filter(Boolean)))
  return unique.join('、') || String(item.createByMemberJobTitle || '').trim()
}

export function formatTimetableTime(value?: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const date = new Date(raw.includes('T') || raw.includes(' ') ? raw.replace(' ', 'T') : raw)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function timetableWeeks(start?: string, end?: string): number {
  if (!start || !end) return 0
  const left = new Date(`${start.slice(0, 10)}T00:00:00`)
  const right = new Date(`${end.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return 0
  const days = Math.ceil((right.getTime() - left.getTime()) / 86400000) + 1
  return Math.max(Math.ceil(days / 7), 0)
}

export function weekChipLabel(weekStart: string): string {
  if (weekStart === mondayOf(todayIso())) return '本周'
  const end = addDays(weekStart, 6)
  return `${Number(weekStart.slice(5, 7))}.${Number(weekStart.slice(8))}～${Number(end.slice(5, 7))}.${Number(end.slice(8))}`
}

export function templateIdentity(row: Schedule): string {
  const targetId = Number(row.targetId || 0)
  const groupId = Number(row.studentGroupId || 0)
  const studentId = Number(row.primaryStudentId || 0)
  const identity = targetId > 0
    ? `target:${row.targetType || ''}:${targetId}`
    : groupId > 0
      ? `group:${groupId}`
      : studentId > 0
        ? `student:${studentId}`
        : `name:${String(row.displayName || row.courseName || '').trim().toLowerCase()}`
  return `${identity}|campus:${Number(row.campusId || 0)}`
}

export function templateVersionsConflict(versions: Schedule[]): boolean {
  const seen = new Map<string, Set<string>>()
  for (const row of versions) {
    const date = String(row.effectiveStartDate || '')
    const identities = seen.get(date) || new Set<string>()
    identities.add(templateIdentity(row))
    if (identities.size > 1) return true
    seen.set(date, identities)
  }
  return false
}

export function pickLatestTemplate(versions: Schedule[]): Schedule | null {
  let latest: Schedule | null = null
  for (const row of versions) {
    if (!latest) {
      latest = row
      continue
    }
    const nextDate = String(row.effectiveStartDate || '')
    const currentDate = String(latest.effectiveStartDate || '')
    if (nextDate > currentDate || (nextDate === currentDate && Number(row.id || 0) > Number(latest.id || 0))) latest = row
  }
  return latest
}

export function latestTemplateSchedules(rows: Schedule[]): Schedule[] {
  const buckets = new Map<string, Schedule[]>()
  for (const row of rows) {
    if (row.scheduleDate) continue
    const slot = `${row.dayOfWeek}|${clockText(row.startTime)}|${clockText(row.endTime)}|${row.coachId || 0}`
    const list = buckets.get(slot) || []
    list.push(row)
    buckets.set(slot, list)
  }
  const picked: Schedule[] = []
  buckets.forEach((versions) => {
    if (!templateVersionsConflict(versions)) {
      const latest = pickLatestTemplate(versions)
      if (latest) picked.push(latest)
      return
    }
    const identities = new Map<string, Schedule[]>()
    versions.forEach((row) => {
      const key = templateIdentity(row)
      const list = identities.get(key) || []
      list.push(row)
      identities.set(key, list)
    })
    identities.forEach((list) => {
      const latest = pickLatestTemplate(list)
      if (latest) picked.push(latest)
    })
  })
  return picked.sort((left, right) => clockText(left.startTime).localeCompare(clockText(right.startTime)) || templateIdentity(left).localeCompare(templateIdentity(right)))
}

export function scheduleName(row: Schedule): string {
  return String(row.displayName || row.courseName || '').replace(/^[>\s]+/, '').trim()
}

export function lessonsMatch(template: Schedule, active: Schedule): boolean {
  if (Number(template.uiChangeStatus) === 4 || Number(active.uiChangeStatus) === 4) return false
  return scheduleName(template) === scheduleName(active)
    && clockText(template.startTime) === clockText(active.startTime)
    && clockText(template.endTime) === clockText(active.endTime)
}

export function compareDetail(lesson: Schedule, templates: Schedule[]): { mark: '' | 'added' | 'modified'; added: Array<{ start: number; end: number }>; modified: Array<{ start: number; end: number }> } {
  const empty = { mark: '' as const, added: [], modified: [] }
  if (Number(lesson.uiChangeStatus) === 3 || Number(lesson.uiChangeStatus) === 4) return empty
  const comparable = templates.filter((item) => Number(item.uiChangeStatus) !== 3 && Number(item.uiChangeStatus) !== 4 && scheduleName(item))
  const start = clockText(lesson.startTime)
  if (comparable.some((item) => clockText(item.startTime) === start && lessonsMatch(item, lesson))) return empty
  const lessonStart = toMinutes(start)
  const lessonEnd = toMinutes(clockText(lesson.endTime))
  if (!(lessonEnd > lessonStart)) return { mark: 'added', added: [], modified: [] }
  const named = comparable.filter((item) => scheduleName(item) === scheduleName(lesson))
  const related = named.length ? named : comparable.filter((item) => {
    const left = toMinutes(clockText(item.startTime))
    return clockText(item.startTime) === start || (left >= lessonStart && left < lessonEnd)
  })
  const overlaps = mergeMinuteRanges(related.map((item) => ({
    start: Math.max(toMinutes(clockText(item.startTime)), lessonStart),
    end: Math.min(toMinutes(clockText(item.endTime)), lessonEnd),
  })).filter((range) => range.end > range.start))
  const added = subtractMinuteRange({ start: lessonStart, end: lessonEnd }, overlaps)
  if (added.length && overlaps.length && added.some((range) => range.start > lessonStart || range.end < lessonEnd)) {
    return { mark: 'added', added, modified: overlaps }
  }
  if (!added.length && overlaps.length) return { mark: 'modified', added: [], modified: [] }
  return { mark: 'added', added: [], modified: [] }
}

export function mergeMinuteRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const merged: Array<{ start: number; end: number }> = []
  ;[...ranges].sort((left, right) => left.start - right.start).forEach((range) => {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) merged.push({ ...range })
    else last.end = Math.max(last.end, range.end)
  })
  return merged
}

export function subtractMinuteRange(whole: { start: number; end: number }, blockers: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = []
  let cursor = whole.start
  mergeMinuteRanges(blockers).forEach((range) => {
    if (range.start > cursor) segments.push({ start: cursor, end: range.start })
    cursor = Math.max(cursor, range.end)
  })
  if (cursor < whole.end) segments.push({ start: cursor, end: whole.end })
  return segments
}

export function cancelledTemplates(day: number, date: string, weekLessons: Schedule[], templates: Schedule[]): Schedule[] {
  return templates.filter((item) => {
    if (Number(item.dayOfWeek) !== day || !scheduleName(item)) return false
    const start = toMinutes(clockText(item.startTime))
    const end = toMinutes(clockText(item.endTime))
    return !weekLessons.some((lesson) => {
      if (lesson.scheduleDate && lesson.scheduleDate !== date) return false
      if (Number(lesson.uiChangeStatus) === 3) return false
      const left = toMinutes(clockText(lesson.startTime))
      const right = toMinutes(clockText(lesson.endTime))
      return left < end && start < right
    })
  })
}

export function echoActionTime(row: Schedule | undefined, status: 'leave' | 'delete'): string {
  if (!row) return ''
  const reason = status === 'leave' ? String(row.leaveReason || '').trim() : ''
  if (reason) return reason
  const raw = String(row.updateTime || row.createTime || '').trim()
  if (!raw) return ''
  const text = raw.replace('T', ' ').replace(/-/g, '/').slice(0, 19)
  return `${status === 'leave' ? '请假时间' : '删除时间'}：${text}`
}

export function templateEchoForCell(day: number, date: string, start: string, lesson: Schedule | undefined, weekLessons: Schedule[], templates: Schedule[]) {
  const template = templates.find((item) => Number(item.dayOfWeek) === day && clockText(item.startTime) === start)
  if (!template || !scheduleName(template)) return undefined
  const weekSlot = weekLessons.filter((item) => item.scheduleDate === date && clockText(item.startTime) === start)
  const leave = weekSlot.find((item) => Number(item.uiChangeStatus) === 3)
  const active = lesson && lesson.scheduleDate === date ? lesson : weekSlot.find((item) => Number(item.uiChangeStatus) !== 3)
  const status = leave ? 'leave' as const : 'delete' as const
  if (!active) {
    return { name: scheduleName(template), status, scheduleId: Number(leave?.id || 0), time: echoActionTime(leave || template, status) }
  }
  if (Number(active.uiChangeStatus) === 4 || leave || !lessonsMatch(template, active)) {
    return { name: scheduleName(template), status, scheduleId: Number((leave || active).id || 0), time: echoActionTime(leave || template, status) }
  }
  return undefined
}

export function clockText(value?: string): string {
  return String(value || '').slice(0, 5)
}

export function weekDaysText(days?: number[]): string {
  const weekDays = (days || []).map((day) => Number(day)).filter((day) => day >= 1 && day <= 7).sort((left, right) => left - right)
  if (!weekDays.length || weekDays.length === 7) return '周一至周日'
  const ranges: string[] = []
  let index = 0
  while (index < weekDays.length) {
    const start = index
    while (index + 1 < weekDays.length && weekDays[index + 1] === weekDays[index] + 1) index += 1
    const length = index - start + 1
    if (length >= 3) ranges.push(`周${DAY_LABELS[weekDays[start] - 1]}至周${DAY_LABELS[weekDays[index] - 1]}`)
    else {
      const parts = weekDays.slice(start, index + 1).map((day, offset) => offset === 0 ? `周${DAY_LABELS[day - 1]}` : DAY_LABELS[day - 1])
      ranges.push(parts.join('，'))
    }
    index += 1
  }
  return ranges.join('，')
}

export function isoWeekday(iso: string): number {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export function timetableShowsWeekday(timetable: { weekDays?: number[]; isWeekly?: number } | null | undefined, day: number): boolean {
  if (Number(timetable?.isWeekly || 0) !== 1) return true
  const days = (timetable?.weekDays || []).map(Number).filter((item) => item >= 1 && item <= 7)
  const visible = days.length ? days : [1, 2, 3, 4, 5, 6, 7]
  return day >= 1 && day <= 7 && visible.includes(day)
}

export function monthDayDot(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number)
  if (!month || !day) return ''
  return `${month}.${day}`
}

export function splitBoardHead(template: boolean, weekend: boolean, days: number[], weekStart: string): { title: string; subtitle: string } {
  if (template) {
    return weekend
      ? { title: '固定课表 · 周末', subtitle: '周六 - 周日' }
      : { title: '固定课表 · 周中', subtitle: '周一 - 周五' }
  }
  const shown = [...days].sort((left, right) => left - right)
  const first = shown[0] ? monthDayDot(addDays(weekStart, shown[0] - 1)) : ''
  const last = shown.length > 1 ? monthDayDot(addDays(weekStart, shown[shown.length - 1] - 1)) : ''
  const subtitle = !first ? '' : last && last !== first ? `${first} - ${last}` : first
  return { title: weekend ? '周末课表' : '周中课表', subtitle }
}

export function timetableMeta(item: Timetable): string {
  if (Number(item.isWeekly) === 0) {
    return item.startDate && item.endDate ? `${item.startDate} - ${item.endDate}` : '日期范围'
  }
  const start = clockText(item.startTime) || '09:00'
  const end = clockText(item.endTime) || '21:00'
  return `${weekDaysText(item.weekDays)} · ${start} - ${end}`
}

export function scheduleCampusLegend(lessons: Schedule[], campuses: Array<{ id: number; name: string }>): Array<{ id: number; name: string; tone: number }> {
  const names = new Map(campuses.map((item) => [item.id, item.name]))
  const order = new Map(campuses.map((item, index) => [item.id, index]))
  const counts = new Map<number, number>()
  lessons.forEach((lesson) => {
    if (Number(lesson.uiChangeStatus || 0) === 4) return
    const id = Number(lesson.campusId || 0)
    if (id > 0 && names.has(id)) counts.set(id, (counts.get(id) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((left, right) => {
      const countCompare = right[1] - left[1]
      if (countCompare !== 0) return countCompare
      return (order.get(left[0]) ?? 9999) - (order.get(right[0]) ?? 9999)
    })
    .map(([id], index) => ({
      id,
      name: names.get(id) || '未命名校区',
      tone: index === 0 ? 5 : (index - 1) % 5,
    }))
}

export function timetableName(value?: string): string {
  return Array.from(String(value || '').trim()).slice(0, 12).join('')
}

export function editTimetableSignature(values: Partial<Timetable>, locked: boolean): string {
  const name = timetableName(values.name)
  if (locked) return name
  const days = (values.weekDays || []).map((day) => Number(day)).filter((day) => day >= 1 && day <= 7).sort((left, right) => left - right)
  const weekly = Number(values.isWeekly) === 1 ? 1 : 0
  return JSON.stringify({
    name,
    weekly,
    startDate: weekly === 1 ? '' : String(values.startDate || ''),
    endDate: weekly === 1 ? '' : String(values.endDate || ''),
    start: clockText(values.startTime),
    end: clockText(values.endTime),
    days,
    split: Number(values.splitWeekend) === 1 ? 1 : 0,
    weekendStart: clockText(values.weekendStartTime),
    weekendEnd: clockText(values.weekendEndTime),
  })
}
