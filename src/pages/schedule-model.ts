

export interface Timetable {
  id: number
  name: string
  campusId?: number
  ownerType?: 'TEACHER' | 'SERVICE' | string
  serviceItemId?: number
  serviceItemName?: string
  description?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  timeIntervalMinutes?: number
  isWeekly?: number
  weekDays?: number[]
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
  weekendTimeIntervalMinutes?: number
  createByMemberId?: number
  createByMemberName?: string
  createByMemberGender?: string
  createByMemberJobTitle?: string
  createByMemberCampusIds?: number[]
  createByMemberCampusPositionNames?: Record<string, string>
  scheduleCampusIds?: number[]
  createTime?: string
  status?: number
  isDefault?: number
  scheduleCount?: number
}

export interface TimetableGroup {
  memberId?: number
  memberName?: string
  memberGender?: string
  positionName?: string
  ownerType?: 'TEACHER' | 'SERVICE' | string
  serviceItemId?: number
  activeTimetables?: Timetable[]
  archivedTimetables?: Timetable[]
}

export interface Schedule {
  id?: number
  timetableId?: number
  courseName?: string
  displayName?: string
  coachName?: string
  coachId?: number
  coachIds?: number[]
  dayOfWeek?: number
  scheduleDate?: string
  startTime?: string
  endTime?: string
  note?: string
  status?: number
  uiChangeStatus?: number
  targetType?: string
  targetId?: number
  pricingCourseType?: string
  pricingStudentGroupId?: number
  serviceQuantity?: number
  excludedStudentIds?: number[]
  currentStudents?: number
  studentIds?: number[]
  studentInstances?: Array<{ studentId: number; studentName?: string; status?: number; studentCardId?: number; remainingHours?: number; gender?: number; cardCategory?: string; periodType?: string; courseCategory?: boolean }>
  createTime?: string
  updateTime?: string
  leaveReason?: string
  memberCardBindings?: Array<{ studentId: number; studentCardId: number }>
  campusId?: number
  effectiveStartDate?: string
  studentGroupId?: number
  primaryStudentId?: number
  templateScheduleId?: number
}

export interface DayCourse {
  id?: number
  start: string
  end: string
  name: string
  statusText: string
  coachLabel: string
  sourceTitle: string
}

export interface DayDialog {
  date: string
  dayLabel: string
  teacherName: string
  own: DayCourse[]
  others: DayCourse[]
  showOthers: boolean
  copyOthers: boolean
  collapsed: string[]
}

export interface CardChoice {
  id?: number
  studentGroupId?: number
  studentGroupName?: string
  cardTypeLabel?: string
  cardCategory?: string
  periodType?: string
  courseCategory?: boolean
  totalHours?: number
  remainingHours?: number
  expiredHours?: number
  remainingAmount?: number
  validEndDate?: string
  available?: boolean
  unavailableReason?: string
}

export interface TargetOption {
  targetType: string
  targetId: number
  name: string
  displayName?: string
  typeLabel?: string
  cardCategory?: string
  courseCategory?: boolean
  pricingCourseType?: string
  pricingStudentGroupId?: number
  serviceQuantity?: number
  cardOptions?: CardChoice[]
  courseOptions?: Array<{ id?: number; name?: string; courseType?: string }>
  serviceOptions?: Array<{ id?: number; courseType?: string; name?: string; unitPrice?: number; studentCardIds?: number[] }>
  selectionBlockedReason?: string
  studentCount?: number
  oneToOne?: boolean
  gender?: number
  remainingHours?: number
  remainingAmount?: number
  storedValueUnitPrice?: number
  expiredHours?: number
  totalHours?: number
  cardTypeLabels?: string[]
  coachIds?: number[]
  coachNames?: string[]
  hoursExpired?: boolean
}

export interface PricingChoice {
  key: string
  label: string
  pricingStudentGroupId?: number
  pricingCourseType: string
  service: boolean
  cardCategory?: string
  remainingAmount?: number
  unitPrice?: number
  disabled?: boolean
}

export interface CourseMember {
  studentId: number
  studentName?: string
  gender?: number
  defaultStudentCardId?: number
  cardOptions?: CardChoice[]
  cardCategory?: string
  remainingHours?: number
}
