interface CourseCapacity {
  id?: number
  name?: string
  oneToOne?: boolean
  internal?: boolean
  maxOpenCount?: number | null
  studentCount?: number
  studentIds?: number[]
  enrolledStudentCount?: number | null
  enrolledStudentIds?: number[] | null
}

export function courseEnrollmentFull(course?: CourseCapacity | null): boolean {
  if (!course || course.oneToOne || (course.internal && String(course.name || '').endsWith('一对一课程'))) return false
  const max = Number(course.maxOpenCount)
  const count = Number(course.enrolledStudentCount ?? course.studentCount ?? 0)
  return Number.isInteger(max) && max >= 2 && count >= max
}

export function courseEnrollmentWarning(course?: CourseCapacity | null, studentId = 0, originalCourseId = 0): string {
  if (!courseEnrollmentFull(course) || !course) return ''
  const enrolledIds = course.enrolledStudentIds ?? course.studentIds
  const alreadyEnrolled = studentId > 0 && (enrolledIds
    ? enrolledIds.some((id) => Number(id) === studentId)
    : Number(course.id) === originalCourseId)
  if (alreadyEnrolled) return ''
  return `课程「${course.name || '所选课程'}」人数已满（最多${course.maxOpenCount}人），不能再添加学员`
}
