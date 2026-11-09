import type { Schedule, TargetOption } from './schedule-model'
import { clockText, freeUntil, fromMinutes, toMinutes } from './schedule-board-helpers'
import { scheduleCardLabel } from './schedule-targets'

export interface ServiceGroup {
  start: string
  end: string
  campusId: number
  schedules: Schedule[]
  names: string[]
  count: number
  standalone: boolean
}

export function serviceBlockers(schedules: Schedule[], service: boolean): Schedule[] {
  return service ? schedules.filter((row) => Number(row.uiChangeStatus) === 4) : schedules
}

export function serviceStartOptions(start: string, end: string, duration: number, dayEnd: string, schedules: Schedule[], id?: number, current = ''): string[] {
  const candidates = new Set<string>()
  for (let minute = toMinutes(start); minute < toMinutes(end); minute += 30) candidates.add(fromMinutes(minute))
  if (current) candidates.add(current)
  return [...candidates].sort().filter((time) => time >= start && time < end
    && toMinutes(time) + duration <= freeUntil(time, serviceBlockers(schedules, true), id, dayEnd))
}

export function groupServiceSchedules(schedules: Schedule[]): ServiceGroup[] {
  const scopes = new Map<string, Schedule[]>()
  for (const row of schedules) {
    if ([4, 5].includes(Number(row.uiChangeStatus))) continue
    const key = `${row.campusId || 0}|${row.scheduleDate || ''}|${row.dayOfWeek || 0}`
    scopes.set(key, [...(scopes.get(key) || []), row])
  }
  const groups: ServiceGroup[] = []
  for (const rows of scopes.values()) {
    let group: ServiceGroup | undefined
    for (const row of rows.slice().sort((a, b) => clockText(a.startTime).localeCompare(clockText(b.startTime)) || Number(a.id) - Number(b.id))) {
      const start = clockText(row.startTime)
      const end = clockText(row.endTime)
      if (!start || end <= start) continue
      if (!group || start >= group.end) {
        group = { start, end, campusId: Number(row.campusId || 0), schedules: [], names: [], count: 0, standalone: false }
        groups.push(group)
      }
      group.schedules.push(row)
      if (end > group.end) group.end = end
    }
  }
  return groups.sort((a, b) => a.start.localeCompare(b.start)).map((group) => {
    const active = group.schedules.filter((row) => Number(row.uiChangeStatus) !== 3)
    const display = active.length ? active : group.schedules
    const people = new Map(display.map((row) => [row.targetType === 'service' ? `service:${row.id}` : String(row.primaryStudentId || row.targetId || row.id), row.displayName || row.courseName || '服务']))
    return { ...group, names: [...people.values()], count: active.length ? people.size : 0, standalone: display.every((row) => row.targetType === 'service') }
  })
}

export function serviceAccount(schedule: Schedule, options?: TargetOption[]): { label: string; primary: string; secondary: string } {
  const blank = { label: '', primary: '', secondary: '' }
  if (schedule.targetType === 'service') return blank
  if (options === undefined) return { ...blank, primary: '账户加载中…' }
  const unavailable = { ...blank, primary: '账户信息暂不可用' }
  const studentId = Number(schedule.primaryStudentId || schedule.targetId)
  const option = options.find((item) => item.targetType === 'student' && item.targetId === studentId)
  if (!option) return unavailable
  const [serviceType, suffix] = String(schedule.pricingCourseType || '').split('#card:')
  const boundId = Number(suffix || 0)
    || Number(schedule.memberCardBindings?.find((row) => row.studentId === studentId)?.studentCardId || 0)
    || Number(schedule.studentInstances?.find((row) => row.studentId === studentId)?.studentCardId || 0)
  const services = (option.serviceOptions || []).filter((row) => row.courseType === serviceType)
  const cards = (option.cardOptions || []).filter((card) => boundId ? card.id === boundId : services.some((row) => row.studentCardIds?.includes(Number(card.id))))
  if (cards.length !== 1) return unavailable
  const card = cards[0]
  const amount = (value?: number) => value == null || !Number.isFinite(Number(value)) ? '—' : `¥${Number(value).toFixed(2)}`
  if (card.cardCategory === 'STORED_VALUE') return { label: '储值卡', primary: `余额 ${amount(card.remainingAmount)}`, secondary: `单价 ${amount(services.find((row) => row.studentCardIds?.includes(Number(card.id)))?.unitPrice)}` }
  if (card.cardCategory === 'PERIOD') {
    const end = card.validEndDate || card.consumeDeadline
    return { label: scheduleCardLabel(card.cardCategory, card.periodType), primary: '', secondary: end ? card.validStartDate ? `${card.validStartDate} 至 ${end}` : `有效至 ${end}` : '有效期未设置' }
  }
  return unavailable
}
