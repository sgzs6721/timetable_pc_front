const MAINTENANCE_HTTP_STATUS = 503
const MAINTENANCE_BUSINESS_CODE = 50301
const MAINTENANCE_RETURN_KEY = 'timetable_pc_maintenance_return'
export const DEFAULT_MAINTENANCE_MESSAGE = '我们正在进行服务升级与优化，期间暂时无法访问。给你带来不便，敬请谅解。'

export function parseResponseBody(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof raw === 'object' ? raw as Record<string, unknown> : null
}

export function isMaintenanceResponse(status: unknown, raw: unknown): boolean {
  const body = parseResponseBody(raw)
  return Number(status) === MAINTENANCE_HTTP_STATUS && Number(body?.code) === MAINTENANCE_BUSINESS_CODE
}

export function maintenanceMessage(raw: unknown): string {
  const body = parseResponseBody(raw)
  const message = String(body?.message || '').trim()
  return (message || DEFAULT_MAINTENANCE_MESSAGE).slice(0, 160)
}

function safeLocalPath(candidate: string): string {
  try {
    const target = new URL(candidate, window.location.origin)
    if (target.origin !== window.location.origin || target.pathname === '/maintenance') return ''
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return ''
  }
}

export function redirectToMaintenance(raw: unknown): void {
  if (window.location.pathname === '/maintenance') return
  const current = safeLocalPath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  try {
    if (current) sessionStorage.setItem(MAINTENANCE_RETURN_KEY, current)
  } catch {
    // 浏览器禁用会话存储时仍需进入维护页，只是不保留返回地址。
  }
  const query = new URLSearchParams({ message: maintenanceMessage(raw) })
  window.location.replace(`/maintenance?${query.toString()}`)
}

export function consumeMaintenanceReturn(): string {
  try {
    const value = safeLocalPath(sessionStorage.getItem(MAINTENANCE_RETURN_KEY) || '')
    sessionStorage.removeItem(MAINTENANCE_RETURN_KEY)
    return value
  } catch {
    return ''
  }
}
