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
  campusAdmin?: boolean
  isSubstituteTeacher?: boolean
  webPasswordSet?: boolean
  subscriptionActive?: boolean
}

export interface Organization {
  id: number
  name: string
}

export interface Campus {
  id: number
  name: string
}

export interface ScheduleItem {
  id: number
  timetableId?: number
  courseName?: string
  displayName?: string
  coachName?: string
  startTime?: string
  endTime?: string
  location?: string
  currentStudents?: number
}

export interface HomeDashboard {
  todayScheduleCount?: number
  todayStudentCount?: number
  todayConsumptionAmount?: number | string
  todayCoachCount?: number
  todaySchedules?: ScheduleItem[]
}

export interface HomeBootstrap {
  user?: UserInfo
  organizations?: Organization[]
  currentOrgId?: number | null
  campuses?: Campus[]
  resolvedCampusId?: number | null
  dashboard?: HomeDashboard | null
}

export interface WechatWebConfig {
  enabled: boolean
  appId: string
}
