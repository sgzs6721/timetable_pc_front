export type JsonMap = Record<string, unknown>

export interface ReferralTier {
  threshold?: number | string
  rewardType?: string
  rewardName?: string
  rewardValue?: unknown
}

export interface MarketingTemplate {
  id: number
  templateName?: string
  playType?: string
  headline?: string
  subHeadline?: string
  coverImageUrl?: string
  sellingPoints?: string
  detailText?: string
  noticeText?: string
  enrollmentFields?: string
  signupModeDefault?: string
  payModeDefault?: string
  referralEnabledDefault?: number
  referralRewardTiersDefault?: string
  posterTheme?: string
  enabled?: number
  sortOrder?: number
}

export interface Campaign {
  id: number
  templateId?: number
  shareCode?: string
  campusNameText?: string
  address?: string
  signupMode?: string
  payMode?: string
  price?: number
  originalPrice?: number
  quotaTotal?: number
  quotaUsed?: number
  enrollStartTime?: string
  enrollEndTime?: string
  activityStartDate?: string
  activityEndDate?: string
  contactName?: string
  contactPhone?: string
  referralEnabled?: number
  referralRewardTiers?: string
  status?: string
}

export interface CampaignContent {
  playType?: string
  headline?: string
  subHeadline?: string
  coverImageUrl?: string
  sellingPoints?: string
  detailText?: string
  noticeText?: string
  posterTheme?: string
}

export interface CampaignDto {
  campaign?: Campaign
  content?: CampaignContent
  displayStatus?: string
  remainingQuota?: number | null
}

export interface CampaignSession {
  id: number
  sessionDate?: string
  startTime?: string
  endTime?: string
  classroomText?: string
  coachNameText?: string
  quotaTotal?: number
  quotaUsed?: number
  status?: string
  sortOrder?: number
}

export interface Enrollment {
  id: number
  studentName?: string
  contactPhone?: string
  customerType?: string
  enrollStatus?: string
  payStatus?: string
  payAmount?: number
  source?: string
  createTime?: string
}

export interface SettlementCampaign {
  campaignId?: number
  headline?: string
  pendingCredit?: number
  pendingDeduction?: number
  pendingNet?: number
  totalCredit?: number
  creditCount?: number
  lastTime?: string
}

export const PLAY_TYPES = [
  { value: 'TRIAL_CLASS', label: '体验课' },
  { value: 'OPEN_DAY', label: '开放日' },
  { value: 'DISCOUNT_PACKAGE', label: '优惠课包' },
]
export const SIGNUP_MODES = [
  { value: 'INTENT', label: '登记意向时段' },
  { value: 'SESSION', label: '选择具体场次' },
]
export const PAY_MODES = [{ value: 'FREE', label: '免费' }, { value: 'PAID', label: '付费' }]
export const THEMES = [
  { value: 'BLUE', label: '经典蓝' },
  { value: 'ORANGE', label: '暖阳橙' },
  { value: 'GREEN', label: '活力绿' },
  { value: 'PURPLE', label: '典雅紫' },
]
export const STATUS_TEXT: Record<string, string> = {
  DRAFT: '草稿', NOT_STARTED: '未开始', ONGOING: '进行中', QUOTA_FULL: '名额已满', PAUSED: '已暂停', ENDED: '已结束',
}
export const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default', NOT_STARTED: 'blue', ONGOING: 'green', QUOTA_FULL: 'orange', PAUSED: 'gold', ENDED: 'default',
}
export const FIELD_OPTIONS = [
  { value: 'gender', label: '学员性别（必填）' },
  { value: 'birthDate', label: '出生日期（必填）' },
  { value: 'levelText', label: '已有基础（必填）' },
  { value: 'intentSlots', label: '意向时段（意向模式必填）' },
  { value: 'remark', label: '备注（选填）' },
]

export function enumText(options: Array<{ value: string; label: string }>, value?: string): string {
  return options.find((item) => item.value === value)?.label || value || '—'
}

export function parseStringList(value?: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function parseEnabledFields(value?: string): string[] {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>
    return FIELD_OPTIONS.map((item) => item.value).filter((key) => parsed[key] === true || parsed[key] === 1 || parsed[key] === '1')
  } catch {
    return []
  }
}

export function parseReferralTiers(value?: string): ReferralTier[] {
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 4).map((item) => ({
      threshold: Number(item?.threshold || 0) || undefined,
      rewardType: ['GIFT', 'DISCOUNT', 'COURSE_HOURS'].includes(String(item?.rewardType || '')) ? String(item.rewardType) : 'GIFT',
      rewardName: String(item?.rewardName || ''),
    }))
  } catch {
    return []
  }
}

export function serializeReferralTiers(value: unknown): string {
  const rows = Array.isArray(value) ? value : []
  return JSON.stringify(rows.slice(0, 4).map((item) => ({
    threshold: Number(item?.threshold || 0),
    rewardType: String(item?.rewardType || 'GIFT'),
    rewardName: String(item?.rewardName || '').trim(),
    rewardValue: null,
  })))
}
