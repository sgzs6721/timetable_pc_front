import { getData, putData } from './http'
import type { HomeBootstrap } from './types'

export function loadHome(campusId?: number | null): Promise<HomeBootstrap> {
  const params = campusId ? { campusId } : undefined
  return getData<HomeBootstrap>('/home/bootstrap', params)
}

export function setCurrentOrganization(orgId: number): Promise<void> {
  return putData<void>(`/organizations/current/${orgId}`)
}
