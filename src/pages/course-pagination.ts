export const COURSE_PAGE_SIZE = 20

export interface CoursePage<T> {
  records: T[]
  total: number
  offset: number
  nextOffset: number
  pageSize: number
  hasMore: boolean
  campusCourseCount: number
  campusOneToOneCourseCount: number
  campusOtherCourseCount: number
}

export function coursePageQuery(campusId: number, page: number, keyword: string, type: string, coachId?: number | null) {
  return {
    campusId,
    offset: (Math.max(1, page) - 1) * COURSE_PAGE_SIZE,
    pageSize: COURSE_PAGE_SIZE,
    keyword: keyword.trim() || undefined,
    type: type === 'one' ? 'oneToOne' : type === 'other' ? 'other' : undefined,
    coachId: coachId || undefined,
  }
}

export function lastCoursePage(total: number): number {
  return Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE))
}
