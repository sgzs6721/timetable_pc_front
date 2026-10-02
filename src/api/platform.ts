import { getJson, postJson, putJson } from './biz'
import type { PlatformFeedback, PlatformOrder, PlatformOrganization, PlatformOverview, PlatformPage, PlatformPlan, PlatformSettlement, PlatformTicket, PlatformUser } from '../platform/platform-model'

export const platformApi = {
  ticket: () => getJson<PlatformTicket>('/platform-admin/ticket'),
  overview: (ticket: string) => getJson<PlatformOverview>('/platform-admin/overview', { ticket }),
  users: (ticket: string, params: Record<string, unknown>) => getJson<PlatformPage<PlatformUser>>('/platform-admin/users', { ticket, ...params }),
  organizations: (ticket: string, params: Record<string, unknown>) => getJson<PlatformPage<PlatformOrganization>>('/platform-admin/organizations', { ticket, ...params }),
  orders: (ticket: string, params: Record<string, unknown>) => getJson<PlatformPage<PlatformOrder>>('/platform-admin/orders', { ticket, ...params }),
  feedbacks: (ticket: string, params: Record<string, unknown>) => getJson<PlatformPage<PlatformFeedback>>('/platform-admin/feedbacks', { ticket, ...params }),
  updateFeedback: (ticket: string, id: number, data: unknown) => putJson<PlatformFeedback>(`/platform-admin/feedbacks/${id}?ticket=${encodeURIComponent(ticket)}`, data),
  plans: (ticket: string) => getJson<PlatformPlan[]>('/platform-admin/membership-plans', { ticket }),
  updatePlan: (ticket: string, id: number, data: unknown) => putJson<PlatformPlan>(`/platform-admin/membership-plans/${id}?ticket=${encodeURIComponent(ticket)}`, data),
  features: (ticket: string) => getJson<{ marketingEnabled?: boolean }>('/platform-admin/features', { ticket }),
  setMarketing: (ticket: string, enabled: boolean) => putJson<{ marketingEnabled?: boolean }>(`/platform-admin/features/marketing?ticket=${encodeURIComponent(ticket)}`, { enabled }),
  settlements: (ticket: string) => getJson<PlatformSettlement[]>('/platform-admin/marketing-settlements', { ticket }),
  payout: (ticket: string, orgId: number, remark?: string) => postJson(`/platform-admin/marketing-settlements/payout?ticket=${encodeURIComponent(ticket)}`, { orgId, remark }),
}
