import { delJson, postJson, putJson } from '../api/biz'
import { todayIso } from './kit'
import { clockText } from './schedule-board-helpers'
import type { Schedule, Timetable } from './schedule-model'

export interface ScheduleMutationTarget {
  day: number
  date: string
  start: string
  end: string
}

export function isTemplateLinkedInstance(schedule: Schedule, timetable: Timetable | null): boolean {
  return Number(timetable?.isWeekly || 0) === 1
    && !!schedule.scheduleDate
    && Number(schedule.templateScheduleId || 0) > 0
}

export function isVirtualTemplateInstance(schedule: Schedule, timetable: Timetable | null): boolean {
  return isTemplateLinkedInstance(schedule, timetable)
    && Number(schedule.templateScheduleId) === Number(schedule.id)
}

function instanceCell(
  schedule: Schedule,
  timetable: Timetable,
  campusId: number,
  overrides: Record<string, unknown> = {},
) {
  const templateScheduleId = Number(schedule.templateScheduleId || schedule.id || 0)
  const virtual = templateScheduleId === Number(schedule.id || 0)
  return {
    scheduleId: virtual ? undefined : schedule.id,
    timetableId: timetable.id,
    templateScheduleId,
    instanceMode: true,
    dayOfWeek: schedule.dayOfWeek,
    scheduleDate: schedule.scheduleDate,
    startTime: clockText(schedule.startTime),
    endTime: clockText(schedule.endTime),
    courseName: String(schedule.courseName || schedule.displayName || '排课').trim(),
    targetType: schedule.targetType,
    targetId: schedule.targetId,
    coachIds: schedule.coachIds,
    note: schedule.note || '',
    campusId: schedule.campusId || campusId,
    pricingStudentGroupId: schedule.pricingStudentGroupId,
    pricingCourseType: schedule.pricingCourseType,
    serviceQuantity: schedule.serviceQuantity,
    excludedStudentIds: schedule.excludedStudentIds,
    memberCardBindings: schedule.memberCardBindings,
    ...overrides,
  }
}

export async function leaveScheduleItem(schedule: Schedule, timetable: Timetable, campusId: number) {
  if (isVirtualTemplateInstance(schedule, timetable)) {
    return postJson<Schedule>('/schedules/cell', instanceCell(schedule, timetable, campusId, { uiChangeStatus: 3 }))
  }
  return postJson<Schedule>(`/schedules/${schedule.id}/leave`, {})
}

export async function removeScheduleItem(schedule: Schedule, timetable: Timetable, campusId: number, templateMode: boolean) {
  if (isTemplateLinkedInstance(schedule, timetable)) {
    await postJson('/schedules/cell', instanceCell(schedule, timetable, campusId, { uiChangeStatus: 3 }))
    const templateId = Number(schedule.templateScheduleId || 0)
    if (templateId && schedule.scheduleDate) {
      await delJson(`/schedules/${templateId}/auto-checkin`, { scheduleDate: schedule.scheduleDate }).catch(() => undefined)
    }
    return
  }
  if (templateMode && !schedule.scheduleDate) {
    await postJson('/schedules/cell', {
      scheduleId: schedule.id,
      timetableId: timetable.id,
      dayOfWeek: schedule.dayOfWeek,
      effectiveStartDate: todayIso(),
      startTime: clockText(schedule.startTime),
      endTime: clockText(schedule.endTime),
      courseName: String(schedule.courseName || schedule.displayName || '排课').trim(),
      targetType: schedule.targetType,
      targetId: schedule.targetId,
      coachIds: schedule.coachIds,
      note: schedule.note || '',
      uiChangeStatus: 3,
      campusId: schedule.campusId || campusId,
      pricingStudentGroupId: schedule.pricingStudentGroupId,
      pricingCourseType: schedule.pricingCourseType,
      serviceQuantity: schedule.serviceQuantity,
      excludedStudentIds: schedule.excludedStudentIds,
      memberCardBindings: schedule.memberCardBindings,
    })
    return
  }
  await delJson(`/schedules/${schedule.id}`)
}

export async function moveScheduleItem(schedule: Schedule, timetable: Timetable, target: ScheduleMutationTarget, templateMode: boolean) {
  if (templateMode && !schedule.scheduleDate) {
    const startTime = clockText(target.start)
    const endTime = clockText(target.end)
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    await putJson(`/schedules/${schedule.id}`, {
      dayOfWeek: target.day,
      startTime,
      endTime,
      duration: (endHour * 60 + endMinute) - (startHour * 60 + startMinute),
      courseName: String(schedule.courseName || schedule.displayName || '排课').trim(),
      targetType: schedule.targetType,
      targetId: schedule.targetId,
      pricingStudentGroupId: schedule.pricingStudentGroupId,
      pricingCourseType: schedule.pricingCourseType,
      serviceQuantity: schedule.serviceQuantity,
      note: schedule.note || '',
      campusId: schedule.campusId,
      uiChangeStatus: Number(schedule.uiChangeStatus || 0) === 4 ? 4 : undefined,
    })
    return
  }
  await postJson(`/schedules/${schedule.id}/move`, {
    scheduleDate: isVirtualTemplateInstance(schedule, timetable) ? undefined : (target.date || undefined),
    dayOfWeek: target.day,
    startTime: target.start,
    endTime: target.end,
  })
}

export async function copyScheduleItem(
  schedule: Schedule,
  timetable: Timetable,
  campusId: number,
  templateMode: boolean,
  targets: ScheduleMutationTarget[],
) {
  if (isTemplateLinkedInstance(schedule, timetable) || templateMode) {
    await postJson('/schedules/cell/batch', {
      cells: targets.map((target) => ({
        timetableId: timetable.id,
        instanceMode: templateMode ? undefined : true,
        dayOfWeek: target.day,
        scheduleDate: templateMode ? undefined : target.date,
        effectiveStartDate: templateMode ? todayIso() : undefined,
        startTime: target.start,
        endTime: target.end,
        courseName: String(schedule.courseName || schedule.displayName || '排课').trim(),
        targetType: schedule.targetType,
        targetId: schedule.targetId,
        coachIds: schedule.coachIds,
        note: schedule.note || '',
        campusId: schedule.campusId || campusId,
        pricingStudentGroupId: schedule.pricingStudentGroupId,
        pricingCourseType: schedule.pricingCourseType,
        serviceQuantity: schedule.serviceQuantity,
        uiChangeStatus: Number(schedule.uiChangeStatus || 0) === 4 ? 4 : undefined,
      })),
    })
    return
  }
  await postJson(`/schedules/${schedule.id}/copy`, {
    targets: targets.map((target) => ({
      scheduleDate: target.date || undefined,
      dayOfWeek: target.day,
      startTime: target.start,
      endTime: target.end,
    })),
  })
}
