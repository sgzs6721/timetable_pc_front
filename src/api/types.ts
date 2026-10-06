export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface LoginVO {
  token: string
  id: number
  nickname?: string
  realName?: string
  avatarUrl?: string
  phone?: string
  role?: string
  positionName?: string
  positionCampusName?: string
  campusAdmin?: boolean
  isSubstituteTeacher?: boolean
  subscriptionActive?: boolean
}

export interface UserInfo {
  id: number
  nickname?: string
  nickName?: string
  realName?: string
  avatarUrl?: string
  phone?: string
  role?: string
  positionName?: string
  positionCampusName?: string
  positionCampusId?: number
  campusAdmin?: boolean
  campusAdminCampusIds?: number[]
  canViewAllLeads?: boolean
  leadCampusIds?: number[]
  isSubstituteTeacher?: boolean
  webPasswordSet?: boolean
  orgMemberId?: number
  subscriptionActive?: boolean
  subscriptionStatus?: string
  accessExpireDate?: string
}

export interface Organization {
  id: number
  name: string
  ownerId?: number
  campusAdminManageSalary?: number
}

export interface Campus {
  id: number
  name: string
  address?: string
  contactPerson?: string
  contactPhone?: string
}

export interface ScheduleItem {
  id: number
  timetableId?: number
  courseName?: string
  displayName?: string
  coachId?: number
  coachName?: string
  coachGender?: string
  startTime?: string
  endTime?: string
  location?: string
  currentStudents?: number
  campusId?: number
  scheduleDate?: string
  displayDateStr?: string
  uiChangeStatus?: number
  targetType?: string
  targetId?: number
  primaryStudentId?: number
  studentGroupId?: number
  studentIds?: number[]
  studentInstances?: Array<{ studentId?: number; studentName?: string; status?: number }>
}

export interface HomeDashboard {
  todayScheduleCount?: number
  todayStudentCount?: number
  todayConsumptionAmount?: number | string
  todayCoachCount?: number
  todaySchedules?: ScheduleItem[]
  tomorrowConsumptionAmount?: number | string
  tomorrowSchedules?: ScheduleItem[]
}

export interface HomeBootstrap {
  user?: UserInfo
  organizations?: Organization[]
  currentOrgId?: number | null
  campuses?: Campus[]
  resolvedCampusId?: number | null
  dashboard?: HomeDashboard | null
  memberTimetables?: Array<{ id: number; isDefault?: number; status?: number }>
  memberWeekSchedules?: ScheduleItem[]
}

export interface WechatWebConfig {
  enabled: boolean
  appId: string
}
