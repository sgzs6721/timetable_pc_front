export interface PlatformTicket { ticket: string; expiresAt: string }
export interface PlatformOverview {
  totalUsers: number
  todayNewUsers: number
  organizationOwners: number
  organizationCount: number
  campusCount: number
  trialUsers: number
  paidUsers: number
  expiredUsers: number
  recordedMembershipRevenue: string | number
  membershipOrderCount: number
}
export interface PlatformPage<T> { total: number; current: number; size: number; pages: number; records: T[] }
export interface PlatformUser {
  id: number; nickname?: string; phone?: string; platformAdmin?: boolean; createTime?: string
  hasCreatedOrganization?: boolean; organizationCount?: number; organizationNames?: string[]; campusCount?: number
  subscriptionStatus?: string; trialStartDate?: string; trialExpireDate?: string; subscriptionExpireDate?: string
  paid?: boolean; paidAmount?: string | number; membershipOrderCount?: number; lastPaidAt?: string
}
export interface PlatformCampus { id: number; name?: string; address?: string; contactPerson?: string; contactPhone?: string; status?: number; visibleInList?: boolean; createTime?: string }
export interface PlatformOrganization { id: number; name?: string; address?: string; phone?: string; contactPerson?: string; status?: number; dissolved?: boolean; createTime?: string; campuses?: PlatformCampus[] }
export interface PlatformOrder { id: number; orderNo?: string; userId?: number; userName?: string; userPhone?: string; planName?: string; amount?: string | number; months?: number; payStatus?: number; accessExpireDate?: string; payTime?: string; createTime?: string }
export interface PlatformFeedback {
  id: number; userId?: number; userName?: string; userPhone?: string; membershipType?: string; membershipTypeText?: string
  source?: string; sourceText?: string; category?: string; categoryText?: string; title?: string; content?: string
  contact?: string; status?: number; statusText?: string; resolutionType?: string; resolutionText?: string
  replyContent?: string; replyTime?: string; createTime?: string
}
export interface PlatformPlan {
  id: number; planCode: string; planName: string; tag?: string; highlighted?: boolean; description?: string
  averagePriceText?: string; benefitText?: string; cycleMonths?: number; priceOneYear?: number | string
  priceTwoYear?: number | string; priceThreeYear?: number | string; organizationLimit?: number; campusLimit?: number
  studentLimitPerCampus?: number; addon40Price?: number | string; addon80Price?: number | string
  sortOrder?: number; planRank?: number; enabled?: boolean
}
export interface PlatformSettlement { orgId: number; organizationName?: string; pendingCredit?: number | string; pendingDeduction?: number | string; pendingNet?: number | string }
