import type { Organization, UserInfo } from './api/types'

const OPEN_WHEN_EXPIRED = new Set(['/home', '/account', '/membership', '/guide', '/feedback'])

export function isOrganizationOwner(user: UserInfo | null, org?: Organization | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase()
  if (role === 'owner') return true
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  return userId > 0 && ownerId > 0 && userId === ownerId
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
