export const LEAD_STATUSES = [
  { value: 'NEW', label: '新客源', color: 'blue' },
  { value: 'CONTACTED', label: '已联系', color: 'cyan' },
  { value: 'INTERESTED', label: '有意向', color: 'purple' },
  { value: 'PENDING_SOLD', label: '待成交', color: 'orange' },
  { value: 'SOLD', label: '已成交', color: 'green' },
  { value: 'CLOSED', label: '已结束', color: 'default' },
]
export const LEAD_SOURCES = ['到店咨询', '电话咨询', '微信咨询', '朋友介绍', '线下推广', '线上平台', '其他']
export const FOLLOW_CHANNELS = [
  { value: 'PHONE', label: '电话沟通' }, { value: 'WECHAT', label: '微信沟通' },
  { value: 'VISIT', label: '当面沟通' }, { value: 'OTHER', label: '其他方式' },
]
export interface Lead {
  id: number; name: string; phone: string; contactName: string; wechat: string; gender: string; age: number | null
  source: string; sourceDetail: string; remark: string; status: string; ownerId: number | null; ownerName: string
  campusId: number | null
  nextFollowAt: string | null; lastFollowAt: string | null; followCount: number; version: number; createTime: string; updateTime: string
}
export interface LeadEvent {
  id: number; type: string; channel: string; content: string; fromStatus: string; toStatus: string
  ownerName: string; nextFollowAt: string | null; operatorName: string; createTime: string
}
export interface LeadPage<T> { records: T[]; total: number; current: number; pages: number }
export interface LeadSalesperson { id: number; userId: number | null; name: string }
export interface LeadCampus { id: number; name: string }
export interface LeadSummary { total: number; fresh: number; active: number; won: number; due: number; unassigned: number }
export const statusInfo = (status: string) => LEAD_STATUSES.find((item) => item.value === status) || LEAD_STATUSES[0]
export const leadTime = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '未安排'
export const isLeadClosed = (status: string) => status === 'SOLD' || status === 'CLOSED'
export const isLeadDue = (lead: Lead) => !isLeadClosed(lead.status) && !!lead.nextFollowAt && new Date(`${lead.nextFollowAt.replace(' ', 'T')}+08:00`).getTime() <= Date.now()

const LEAD_MOBILE_PHONE = /^1[3-9]\d{9}$/
const LEAD_LANDLINE_PHONE = /^0\d{2,3}-?\d{7,8}(-\d{1,5})?$/

export function normalizeLeadPhone(value: string): string {
  return String(value || '').replace(/[^\d-]/g, '').slice(0, 20)
}

export function leadPhoneError(value: string): string {
  const phone = String(value || '').trim()
  if (!phone) return ''
  if (LEAD_MOBILE_PHONE.test(phone) || LEAD_LANDLINE_PHONE.test(phone)) return ''
  return '请输入正确的联系电话，手机号或带区号的固定电话'
}
