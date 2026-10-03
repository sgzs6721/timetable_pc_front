const TOKEN_KEY = 'timetable_pc_token'
const ORG_KEY = 'timetable_pc_org_id'
const CAMPUS_KEY = 'timetable_pc_campus_id'
const LOGIN_REDIRECT_KEY = 'timetable_pc_login_redirect'
const LOGIN_REDIRECT_TTL_MS = 30 * 60 * 1000
const WECHAT_OAUTH_STATE_KEY = 'timetable_pc_wechat_oauth_state'
const WECHAT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const MARKETING_TOKEN_KEY = 'timetable_marketing_token'
const MARKETING_PHONE_KEY = 'timetable_marketing_phone_bound'
const MARKETING_OWNER_TOKEN_KEY = 'timetable_marketing_owner_token'

interface SavedLoginRedirect {
  path: string
  savedAt: number
}

interface SavedWechatOAuthState {
  value: string
  savedAt: number
}

function safeLoginRedirect(candidate: string): string {
  if (!candidate) return ''
  try {
    const target = new URL(candidate, window.location.origin)
    if (target.origin !== window.location.origin) return ''
    if (!target.pathname.startsWith('/') || target.pathname.startsWith('/login')) return ''
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return ''
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  clearMarketingAuthentication()
  localStorage.setItem(TOKEN_KEY, token)
}

/** 营销身份独立于主 JWT，但账号切换时必须同步失效，避免跨账号复用。 */
export function clearMarketingAuthentication(): void {
  sessionStorage.removeItem(MARKETING_TOKEN_KEY)
  sessionStorage.removeItem(MARKETING_PHONE_KEY)
  sessionStorage.removeItem(MARKETING_OWNER_TOKEN_KEY)
}

/** 清除持久登录上下文，但保留本次登录流程的深链和 OAuth state。 */
export function clearAuthentication(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ORG_KEY)
  localStorage.removeItem(CAMPUS_KEY)
}

/** 用户显式退出时，同时丢弃所有待处理的登录流程状态。 */
export function clearSession(): void {
  clearAuthentication()
  clearMarketingAuthentication()
  sessionStorage.removeItem(LOGIN_REDIRECT_KEY)
  sessionStorage.removeItem(WECHAT_OAUTH_STATE_KEY)
}

/** 保存受保护深链，供登录成功后一次性回跳。只接受当前站点内的路径。 */
export function rememberLoginRedirect(candidate: string): void {
  const path = safeLoginRedirect(candidate)
  if (!path) return
  const saved: SavedLoginRedirect = { path, savedAt: Date.now() }
  sessionStorage.setItem(LOGIN_REDIRECT_KEY, JSON.stringify(saved))
}

/** 读取并立即清除登录回跳，过期或非同源目标一律丢弃。 */
export function consumeLoginRedirect(): string {
  const raw = sessionStorage.getItem(LOGIN_REDIRECT_KEY)
  sessionStorage.removeItem(LOGIN_REDIRECT_KEY)
  if (!raw) return ''
  try {
    const saved = JSON.parse(raw) as Partial<SavedLoginRedirect>
    const savedAt = Number(saved.savedAt || 0)
    if (!savedAt || Date.now() - savedAt > LOGIN_REDIRECT_TTL_MS) return ''
    return safeLoginRedirect(String(saved.path || ''))
  } catch {
    return ''
  }
}

/** 丢弃未消费的登录回跳，供保持原始登录落点的入口使用。 */
export function discardLoginRedirect(): void {
  sessionStorage.removeItem(LOGIN_REDIRECT_KEY)
}

/** 为一次微信开放平台跳转生成不可预测的 state，防止登录 CSRF 与会话串用。 */
export function createWechatOAuthState(): string {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const saved: SavedWechatOAuthState = { value, savedAt: Date.now() }
  sessionStorage.setItem(WECHAT_OAUTH_STATE_KEY, JSON.stringify(saved))
  return value
}

/** 微信回调 state 只能校验一次；缺失、过期、格式损坏或不匹配都直接拒绝。 */
export function consumeWechatOAuthState(candidate: string): boolean {
  const raw = sessionStorage.getItem(WECHAT_OAUTH_STATE_KEY)
  sessionStorage.removeItem(WECHAT_OAUTH_STATE_KEY)
  if (!raw || !candidate) return false
  try {
    const saved = JSON.parse(raw) as Partial<SavedWechatOAuthState>
    const savedAt = Number(saved.savedAt || 0)
    const elapsed = Date.now() - savedAt
    if (!savedAt || elapsed < 0 || elapsed > WECHAT_OAUTH_STATE_TTL_MS) return false
    return typeof saved.value === 'string' && saved.value.length === 48 && saved.value === candidate
  } catch {
    return false
  }
}

export function getOrgId(): string {
  return localStorage.getItem(ORG_KEY) || ''
}

export function setOrgId(orgId: number | string | null): void {
  if (orgId == null || orgId === '') {
    localStorage.removeItem(ORG_KEY)
    return
  }
  localStorage.setItem(ORG_KEY, String(orgId))
}

export function getCampusId(): string {
  return localStorage.getItem(CAMPUS_KEY) || ''
}

export function setCampusId(campusId: number | string | null): void {
  if (campusId == null || campusId === '') {
    localStorage.removeItem(CAMPUS_KEY)
    return
  }
  localStorage.setItem(CAMPUS_KEY, String(campusId))
}
