import type { ScheduleItem } from '../api/types'

/** 首页课程总览默认先展示 6 节，多出的课程再展开。 */
export const OVERVIEW_SLOT_LIMIT = 6

export function countDistinctStudents(items: ScheduleItem[]): number {
  const keys = new Set<string>()
  let anonymousCount = 0
  items.forEach((item) => {
    const targetType = String(item.targetType || '').toLowerCase()
    if (targetType === 'preset') {
      const presetId = Number(item.targetId || 0)
      if (presetId > 0) keys.add(`preset:${presetId}`)
      else anonymousCount += Math.max(1, Number(item.currentStudents || 0) || 1)
      return
    }
    const studentIds = new Set<number>()
    const instances = item.studentInstances || []
    if (instances.length) {
      instances.forEach((student) => {
        const status = Number(student.status ?? 1)
        if (status === 3 || status === 4) return
        const studentId = Number(student.studentId || 0)
        if (studentId > 0) studentIds.add(studentId)
      })
    } else {
      ;(item.studentIds || []).forEach((id) => {
        const studentId = Number(id || 0)
        if (studentId > 0) studentIds.add(studentId)
      })
      const primaryStudentId = Number(item.primaryStudentId || 0)
      if (primaryStudentId > 0) studentIds.add(primaryStudentId)
      if (targetType === 'student') {
        const targetId = Number(item.targetId || 0)
        if (targetId > 0) studentIds.add(targetId)
      }
    }
    if (studentIds.size) {
      studentIds.forEach((studentId) => keys.add(`student:${studentId}`))
      return
    }
    anonymousCount += Math.max(0, Number(item.currentStudents || 0))
  })
  return keys.size + anonymousCount
}
