import type { CheckInRight } from './checkin-options'

export interface Student {
  id: number
  name: string
  gender?: number
  phone?: string
  birthDate?: string
  status?: number
  remark?: string
  campusId?: number
  campusName?: string
  sourceCampusId?: number
  sourceCampusName?: string
  createTime?: string
  coachMemberName?: string
  coachMemberIds?: number[]
  remainingHours?: number
  totalHours?: number
  regularHours?: number
  bonusHours?: number
  remainingAmount?: number
  totalAmount?: number
  expiredHours?: number
  cardCategory?: string
  periodType?: string
  courseCategory?: boolean
  coachMemberNames?: string[]
  serviceItemNames?: string[]
  serviceNames?: string[]
  studentGroupId?: number
  studentGroupIds?: number[]
  periodValidStartDate?: string
  periodValidEndDate?: string
  canDelete?: boolean
  deleteBlockedReason?: string
  cards?: Card[]
}

export interface Card {
  id?: number
  cardName?: string
  cardCategory?: string
  periodType?: string
  studentGroupId?: number
  studentGroupName?: string
  remainingHours?: number
  totalHours?: number
  regularHours?: number
  bonusHours?: number
  remainingAmount?: number
  totalAmount?: number
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
  serviceItemIds?: number[]
  serviceItemNames?: string[]
  coachMemberIds?: number[]
  coachMemberNames?: string[]
  courseCategory?: boolean
  periodTypeEditable?: boolean
  canClose?: boolean
  closeBlockedReason?: string
  serviceRights?: ServiceRight[]
  status?: number
  deleted?: number
  lastCourseDate?: string
  expiredHours?: number
}

export interface ServiceRight {
  courseType?: string
  courseTypeLabel?: string
  discount?: number
  unitPrice?: number
}

export interface Named {
  id: number
  name?: string
  nickname?: string
  displayName?: string
  phone?: string
  serviceName?: string
  shortName?: string
  unitPrice?: number
  enabled?: number | boolean
  status?: number
  userId?: number
  gender?: string | number
  isSubstituteTeacher?: boolean | number | string
  coachId?: number
  coachIds?: number[]
  coachName?: string
  coachNames?: string[]
  internal?: boolean
  invalid?: boolean
  inactiveReason?: string
  price?: number
  durationMinutes?: number
}

export interface PayRecord {
  id: number
  type?: string
  typeText?: string
  amount?: number
  hours?: number
  giftHours?: number
  remainingHours?: number
  courseType?: string
  courseTypeLabel?: string
  paymentDate?: string
  createTime?: string
  paymentMethod?: number
  validStartDate?: string
  validEndDate?: string
  consumeDeadline?: string
  remark?: string
  studentCardId?: number
  mainRecordId?: number
  adjustmentReason?: string
  commissionEnabled?: boolean
  commissionMemberId?: number
  commissionRate?: number
  commissionAmount?: number
  coachMemberId?: number
  commissionMemberName?: string
  commissionAllocations?: Array<{ memberId?: number; memberName?: string; commissionRate?: number; commissionAmount?: number }>
  transferTargetStudentId?: number
  transferTargetStudentName?: string
  transferDirection?: string
  displayMode?: string
  totalHours?: number
  serviceRights?: CheckInRight[]
  storedValueRights?: Array<{ courseType?: string; discount?: number; unitPrice?: number }>
  supplements?: PayRecord[]
}

export type PayLaunch = 'new' | PayRecord | { adjust: PayRecord }

export interface CheckRecord {
  id: number
  consumeDate?: string
  courseName?: string
  courseType?: string
  courseTypeLabel?: string
  coachName?: string
  coachId?: number
  hours?: number
  amount?: number
  remark?: string
  studentCardId?: number
  paymentRecordId?: number
  autoCheckIn?: number
  unitPrice?: number
  createTime?: string
  scheduleTimeText?: string
  cardTypeLabel?: string
}
