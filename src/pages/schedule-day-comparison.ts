import type { CSSProperties } from 'react'
import type { Schedule, Timetable } from './schedule-model'
import { cancelledCompareSegments, clockText, compareDetail, latestTemplateSchedules, toMinutes } from './schedule-board-helpers'
import { isOutsideTimetableDateRange } from './schedule-policy'

/** 比较基准是当天的全部最新固定课程，不按历史生效日、原模板 ID 或校区筛选缩小。 */
export function buildDayComparison(
  timetable: Timetable,
  templateMode: boolean,
  day: number,
  date: string,
  weekSchedules: Schedule[],
  templateSchedules: Schedule[],
) {
  const enabled = Number(timetable.isWeekly) === 1 && !templateMode && !isOutsideTimetableDateRange(timetable, date)
  // 保留请假记录参与取消判定和销假操作；显示课程仍由 /week 返回的实际实例决定。
  const schedules = weekSchedules.filter((item) => item.scheduleDate ? item.scheduleDate === date : Number(item.dayOfWeek) === day)
  const templates = enabled ? latestTemplateSchedules(templateSchedules).filter((item) => Number(item.dayOfWeek) === day) : []
  return {
    enabled,
    schedules,
    templates,
    cancelled: enabled ? cancelledCompareSegments(day, date, schedules, templates) : [],
    detail: (lesson: Schedule): ReturnType<typeof compareDetail> => enabled
      ? compareDetail(lesson, templates)
      : { mark: '', added: [], modified: [] },
  }
}

/** 相邻绿／橙分段共用外轮廓，不在内部连接处画横线。 */
export function compareSegmentStyle(lesson: Schedule, range: { start: number; end: number }): CSSProperties {
  const start = toMinutes(clockText(lesson.startTime))
  const end = toMinutes(clockText(lesson.endTime))
  const span = Math.max(end - start, 1)
  return {
    top: `${((range.start - start) / span) * 100}%`,
    height: `${((range.end - range.start) / span) * 100}%`,
    ...(range.start > start ? { borderTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
    ...(range.end < end ? { borderBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
  }
}
