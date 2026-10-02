import { postData } from './http'
import { getDataWithHeaders, postDataWithHeaders } from './http'
import type { MarketingEnrollment, MarketingLanding, MarketingReferral } from '../marketing-public/marketing-public-model'

const KEY = 'timetable_marketing_token'
const PHONE_KEY = 'timetable_marketing_phone_bound'

async function token(): Promise<string> {
  const current = sessionStorage.getItem(KEY)
  if (current) return current
  const login = await postData<{ marketingToken: string; phoneBound?: boolean }>('/marketing/landing/web-login', {})
  sessionStorage.setItem(KEY, login.marketingToken)
  sessionStorage.setItem(PHONE_KEY, login.phoneBound ? '1' : '0')
  return login.marketingToken
}

async function headers() { return { 'X-Marketing-Token': await token() } }

async function authorized<T>(request: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  const requestHeaders = await headers()
  try {
    return await request(requestHeaders)
  } catch (reason) {
    // 401 响应拦截器只会清除隔离的营销 token。已有 token 失效时静默换新一次，
    // 不打断主 Web 会话，也不要求用户手动刷新页面。
    if (!sessionStorage.getItem(KEY)) {
      return request(await headers())
    }
    throw reason
  }
}

export const marketingPublicApi = {
  phoneBound: () => sessionStorage.getItem(PHONE_KEY) === '1',
  detail: async (shareCode: string, referralCode?: string) => authorized((requestHeaders) => getDataWithHeaders<MarketingLanding>('/marketing/landing/detail', { c: shareCode, r: referralCode }, requestHeaders)),
  enroll: async (data: unknown) => authorized((requestHeaders) => postDataWithHeaders<{ enrollmentId: number; paymentRequired?: boolean; payParams?: Record<string, unknown> }>('/marketing/landing/enroll', data, requestHeaders)),
  cancel: async (enrollmentId: number) => authorized((requestHeaders) => postDataWithHeaders<boolean>('/marketing/landing/cancel', { enrollmentId }, requestHeaders)),
  enrollments: async () => authorized((requestHeaders) => getDataWithHeaders<MarketingEnrollment[]>('/marketing/landing/my-enrollments', undefined, requestHeaders)),
  referral: async (shareCode: string) => authorized((requestHeaders) => getDataWithHeaders<MarketingReferral>('/marketing/landing/my-referral', { c: shareCode }, requestHeaders)),
  poster: async (shareCode: string) => authorized((requestHeaders) => postDataWithHeaders<{ imageUrl?: string; referralCode?: string }>('/marketing/landing/wxacode', { shareCode }, requestHeaders)),
}
