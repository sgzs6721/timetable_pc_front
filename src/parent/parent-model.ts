export type ParentSource = 'PRIVATE' | 'INSTITUTION'

export interface ParentChild {
  source: ParentSource
  childId?: number
  studentId?: number
  timetableId?: number
  name: string
  officialName?: string
  orgName?: string
  campusName?: string
  timetableConfigured?: boolean
  timetableType?: 'CYCLE' | 'PERIOD'
}

export interface ParentHome {
  phone?: string
  privateTimetableLimit?: number
  privateChildCount?: number
  limitApplies?: boolean
  children: ParentChild[]
}

export interface ParentLesson {
  source?: ParentSource
  slotId?: number
  courseId?: number
  courseName?: string
  orgId?: number
  orgName?: string
  courseEntry?: boolean
  entryType?: 'COURSE' | 'SCHEDULE'
  remark?: string
  autoCheckIn?: boolean
  checkedIn?: boolean
  scheduleDate?: string
  dayOfWeek?: number
  repeatWeekly?: number
  startTime?: string
  endTime?: string
  campusName?: string
  coachName?: string
  timetableId?: number
  compareStatus?: 'added' | 'modified' | 'cancelled'
}

export interface ParentCourse {
  id: number
  name: string
  orgName?: string
  campusName?: string
  entryType?: 'COURSE' | 'SCHEDULE'
  remark?: string
  autoCheckIn?: boolean
  slots?: ParentSlot[]
}

export interface ParentSlot {
  id: number
  courseId?: number
  courseName?: string
  entryType?: 'COURSE' | 'SCHEDULE'
  autoCheckIn?: boolean
  repeatWeekly?: number
  dayOfWeek?: number
  scheduleDate?: string
  startTime?: string
  endTime?: string
  remark?: string
}

export interface ParentBoard {
  source: ParentSource
  name: string
  officialName?: string
  orgName?: string
  campusName?: string
  childId?: number
  studentId?: number
  timetableId?: number
  timetableName?: string
  timetableType?: 'CYCLE' | 'PERIOD'
  timetableStartDate?: string
  timetableEndDate?: string
  boardStartTime?: string
  boardEndTime?: string
  weekDays?: number[]
  timeIntervalMinutes?: number
  configured?: boolean
  needsSetup?: boolean
  autoCheckIn?: boolean
  requiredTimetableType?: 'CYCLE' | 'PERIOD'
  timetableTypeConflict?: boolean
  cardCategory?: string
  remainingHours?: number
  totalHours?: number
  remainingAmount?: number
  institutionLessons?: ParentLesson[]
  institutionTemplateLessons?: ParentLesson[]
  privateLessons?: ParentLesson[]
  courses?: ParentCourse[]
}

export interface ParentCourseCatalogItem {
  source: ParentSource
  courseId?: number
  childId?: number
  studentId?: number
  timetableId?: number
  memberName?: string
  courseName?: string
  officialCourseName?: string
  institutionRefKey?: string
  courseType?: string
  orgId?: number
  orgName?: string
  campusName?: string
  editable?: boolean
  timetableConfigured?: boolean
  autoCheckIn?: boolean
  scheduleCount?: number
  service?: boolean
  studentCardId?: number
  cardCategory?: string
  periodType?: string
  remainingHours?: number
  totalHours?: number
  remainingAmount?: number
  totalAmount?: number
  validStartDate?: string
  validEndDate?: string
}

export interface ParentPayment {
  id: number
  courseId?: number
  courseName?: string
  orgName?: string
  campusName?: string
  amount?: number
  hours?: number
  giftHours?: number
  paymentDate?: string
  payDate?: string
  typeText?: string
  cardName?: string
  cardCategory?: string
  courseType?: string
  remark?: string
  eventTime?: string
}

export interface ParentClassRecord {
  id: number
  courseId?: number
  courseName?: string
  orgName?: string
  campusName?: string
  classDate?: string
  startTime?: string
  endTime?: string
  hours?: number
  amount?: number
  coachName?: string
  autoCheckIn?: boolean
  remark?: string
  eventTime?: string
}

export interface ParentCourseDetail {
  course: ParentCourse
  payments: ParentPayment[]
  classDates: ParentClassRecord[]
}

export interface ParentCourseStats {
  memberName?: string
  totalAmount?: number
  remainingHours?: number
  hoursTracked?: boolean
  checkInCount?: number
  leaveCount?: number
  attendanceRate?: number
  courses?: Array<{
    courseName?: string
    orgName?: string
    cardLabel?: string
    totalAmount?: number
    remainingHours?: number
    hoursTracked?: boolean
    remainingAmount?: number
    amountTracked?: boolean
    periodTracked?: boolean
    periodOpenEnded?: boolean
    progressKind?: string
    progressPercent?: number
    checkInCount?: number
    leaveCount?: number
    attendanceRate?: number
  }>
  weeks?: Array<{ label: string; counts: number[] }>
  months?: Array<{ label: string; counts: number[] }>
}

export interface ParentFeeItem {
  id: number
  name: string
  amount: number
  enabled?: boolean
  chargeSnapshot?: string
}
