import type { Organization, UserInfo } from './api/types'

export type FeatureAccessMode = 'developing' | 'members' | 'all'

const OPEN_WHEN_EXPIRED = new Set(['/home', '/account', '/membership', '/guide', '/feedback'])

export function isOrganizationOwner(user: UserInfo | null, org?: Organization | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  if (role === 'owner') return true
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  return userId > 0 && ownerId > 0 && userId === ownerId
}

export function isOrganizationManager(user: UserInfo | null, org?: Organization | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'admin' || isOrganizationOwner(user, org)
}

export function campusAdminIds(user: UserInfo | null): number[] {
  const ids = (user?.campusAdminCampusIds || [])
    .map((id) => Number(id || 0))
    .filter((id, index, rows) => id > 0 && rows.indexOf(id) === index)
  if (ids.length) return ids
  const legacyCampusId = Number(user?.positionCampusId || 0)
  return user?.campusAdmin === true && legacyCampusId > 0 ? [legacyCampusId] : []
}

export function canManageCampus(user: UserInfo | null, campusId?: number | null, org?: Organization | null): boolean {
  if (isOrganizationManager(user, org)) return true
  const targetCampusId = Number(campusId || 0)
  return targetCampusId > 0 && campusAdminIds(user).includes(targetCampusId)
}

export function canViewLeads(user: UserInfo | null, _org?: Organization | null): boolean {
  if (!user) return false
  if (user.canViewAllLeads === true) return true
  return (user.leadCampusIds || []).some((id) => Number(id) > 0)
}

export function canViewLeadCampus(user: UserInfo | null, campusId?: number | null): boolean {
  if (!user) return false
  if (user.canViewAllLeads === true) return true
  const targetCampusId = Number(campusId || 0)
  return targetCampusId > 0 && (user.leadCampusIds || []).some((id) => Number(id) === targetCampusId)
}

/** 纯销售岗位可跨本人授课范围查看学员与课程，但不能执行管理操作。 */
export function isSalesReadOnlyUser(user: UserInfo | null, org?: Organization | null): boolean {
  return canViewLeads(user)
    && !isOrganizationManager(user, org)
    && campusAdminIds(user).length === 0
    && user?.isSubstituteTeacher !== true
}

export function canFilterLeadSalespeople(user: UserInfo | null, org?: Organization | null): boolean {
  return user?.canViewAllLeads === true
    || isOrganizationManager(user, org)
    || campusAdminIds(user).length > 0
}

export function normalizeFeatureAccessMode(value?: string | null): FeatureAccessMode {
  return value === 'developing' || value === 'members' ? value : 'all'
}

export function isPaidMember(user: UserInfo | null): boolean {
  return String(user?.subscriptionStatus || '').trim().toLowerCase() === 'active'
    && user?.subscriptionActive !== false
}

export function marketingAccessProblem(user: UserInfo | null, enabled: boolean, mode: FeatureAccessMode): string {
  if (!enabled) return '营销活动当前未开放'
  if (mode === 'developing') return '营销活动正在加紧开发中，敬请期待。'
  if (mode === 'members' && !isPaidMember(user)) return '营销活动仅面向正式会员开放，请联系机构主理人开通会员。'
  return ''
}

function isAssociatedMember(user: UserInfo, org?: Organization | null): boolean {
  if (Number(user.orgMemberId || 0) <= 0) return false
  return !isOrganizationOwner(user, org)
}

export function isSubscriptionExpired(user: UserInfo | null, org?: Organization | null): boolean {
  if (!user || isAssociatedMember(user, org)) return false
  const status = String(user.subscriptionStatus || '').trim().toLowerCase()
  return status === 'expired' || user.subscriptionActive === false
}

export function subscriptionBlocksPath(user: UserInfo | null, path: string, org?: Organization | null): boolean {
  if (!isSubscriptionExpired(user, org)) return false
  return !OPEN_WHEN_EXPIRED.has(path)
}

export function subscriptionExpiredText(user: UserInfo | null): string {
  const date = String(user?.accessExpireDate || '').slice(0, 10)
  if (date) return `试用期于${date}结束，成为会员后可继续使用`
  return '试用期已结束，成为会员后可继续使用'
}
