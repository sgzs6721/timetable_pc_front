const TOKEN_KEY = 'timetable_pc_token'
const ORG_KEY = 'timetable_pc_org_id'
const CAMPUS_KEY = 'timetable_pc_campus_id'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ORG_KEY)
  localStorage.removeItem(CAMPUS_KEY)
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
