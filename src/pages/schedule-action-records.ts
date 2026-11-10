import type { Schedule } from './schedule-model'
import { clockText, scheduleName } from './schedule-board-helpers'

export function scheduleSlotKey(schedule: Schedule): string {
  return clockText(schedule.startTime).slice(0, 5)
}

export function normalizeScheduleDisplayName(name?: string): string {
  return String(name || '').replace(/^[>\s]+/, '').trim().toLowerCase()
}

export function getScheduleComparableName(schedule: Schedule): string {
  return normalizeScheduleDisplayName(scheduleName(schedule))
}

function parseLocalDate(value: string): Date | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function dayOfWeekFromDate(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function recordAnchorDate(schedule: Schedule): string {
  return String(schedule.scheduleDate || (schedule as { displayDate?: string }).displayDate || (schedule as { displayDateStr?: string }).displayDateStr || '').trim()
}

function effectiveTime(schedule: Schedule): number {
  const date = parseLocalDate(String(schedule.effectiveStartDate || ''))
  return date ? date.getTime() : Number.MIN_SAFE_INTEGER
}

function templateIdentity(schedule: Schedule): string {
  return [
    String(schedule.targetType || ''),
    String(schedule.targetId || ''),
    getScheduleComparableName(schedule),
  ].join('|')
}

function pickEffectiveTemplateVersion(versions: Schedule[], targetDate: Date): Schedule | null {
  let active: Schedule | null = null
  for (const version of versions) {
    const effective = parseLocalDate(String(version.effectiveStartDate || ''))
    if (effective && effective.getTime() > targetDate.getTime()) continue
    if (!active) {
      active = version
      continue
    }
    const nextTime = effectiveTime(version)
    const currentTime = effectiveTime(active)
    if (nextTime > currentTime || (nextTime === currentTime && Number(version.id || 0) > Number(active.id || 0))) {
      active = version
    }
  }
  return active
}

/** Group same-day templates by slot (+ identity), then keep the version effective on targetDate. */
export function resolveEffectiveTemplateSchedulesForDay(
  templateSchedules: Schedule[],
  dayOfWeek: number,
  targetDate: Date,
): Schedule[] {
  const grouped = new Map<string, Schedule[]>()
  for (const schedule of templateSchedules || []) {
    if (Number(schedule.dayOfWeek || 0) !== dayOfWeek) continue
    const key = `${scheduleSlotKey(schedule)}|${templateIdentity(schedule)}`
    const list = grouped.get(key) || []
    list.push(schedule)
    grouped.set(key, list)
  }
  return Array.from(grouped.values())
    .map((versions) => pickEffectiveTemplateVersion(versions, targetDate))
    .filter((item): item is Schedule => !!item)
}

/**
 * Match a by-name record to a still-active fixed-course template on the same slot.
 * Removed/occupied template versions (uiChangeStatus 3/4) never count as active.
 */
export function findMatchingTemplateScheduleForRecord(
  templateSchedules: Schedule[],
  schedule: Schedule,
  courseName: string,
): Schedule | null {
  const dateValue = recordAnchorDate(schedule)
  const targetDate = parseLocalDate(dateValue)
  if (!targetDate) return null
  const dayOfWeek = schedule.dayOfWeek != null ? Number(schedule.dayOfWeek) : dayOfWeekFromDate(targetDate)
  if (!dayOfWeek) return null
  const slotKey = scheduleSlotKey(schedule)
  if (!slotKey) return null
  const normalizedCourseName = normalizeScheduleDisplayName(courseName)
  return resolveEffectiveTemplateSchedulesForDay(templateSchedules, dayOfWeek, targetDate).find((item) => {
    const status = Number(item.uiChangeStatus || 0)
    if (status === 3 || status === 4) return false
    return scheduleSlotKey(item) === slotKey && getScheduleComparableName(item) === normalizedCourseName
  }) || null
}

/**
 * Whether a by-name "本周/所有排课" row should be shown.
 * After a time-slot change, by-name still returns obsolete template rows and status=3 removals;
 * only real dated leaves that match an active template, or real dated instances, stay visible.
 */
export function shouldIncludeActionScheduleRecord(
  record: Schedule,
  templateSchedules: Schedule[],
  courseName: string,
): boolean {
  const uiChangeStatus = Number(record.uiChangeStatus || 0)
  if (uiChangeStatus === 4) return false

  const hasScheduleDate = !!String(record.scheduleDate || '').trim()
  const matchesActiveTemplate = !!findMatchingTemplateScheduleForRecord(templateSchedules, record, courseName)

  if (uiChangeStatus === 3) return hasScheduleDate && matchesActiveTemplate
  if (!hasScheduleDate) return matchesActiveTemplate
  return true
}

export function filterActionScheduleRecords(
  records: Schedule[],
  templateSchedules: Schedule[],
  courseName: string,
): Schedule[] {
  return (records || []).filter((row) => shouldIncludeActionScheduleRecord(row, templateSchedules, courseName))
}
