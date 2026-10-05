import axios from 'axios'
import { clearAuthentication, clearMarketingAuthentication, discardLoginRedirect, getOrgId, getToken, rememberLoginRedirect } from '../session'
import type { ApiResult } from './types'

const ONLINE_API_BASE_URL = 'https://timetable.devtesting.top/api'

function localApiBaseUrl(): string {
  const configured = import.meta.env.VITE_LOCAL_API_BASE_URL
  if (configured) return configured
  return '/api'
}

function resolveApiBaseUrl(): string {
  // 开发环境通过 Vite 同源代理访问后端，避免回环地址与端口差异触发 CORS。
  if (import.meta.env.DEV) {
    return localApiBaseUrl()
  }
  const { hostname } = window.location
  if (hostname === 'worktable.devtesting.top') {
    return ONLINE_API_BASE_URL
  }
  return import.meta.env.VITE_API_BASE_URL || ONLINE_API_BASE_URL
}

export function resolveApiAssetUrl(value: string): string {
  const source = String(value || '').trim()
  if (!source || /^(?:https?:|data:|blob:)/i.test(source)) return source
  const root = resolveApiBaseUrl().replace(/\/+$/, '')
  return `${root}${source.startsWith('/') ? '' : '/'}${source}`
}

const http = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 20000,
})

function isMarketingSessionRequest(url?: string): boolean {
  return Boolean(url?.includes('/marketing/landing/') && !url.includes('/web-login'))
}

function clearMarketingSession(): void {
  clearMarketingAuthentication()
}

function expireAccountSession(): void {
  const { pathname, search, hash } = window.location
  const keepsOriginalLoginLanding = pathname === '/parent'
    || pathname.startsWith('/parent/')
  const shouldNavigate = !pathname.startsWith('/login')
  const returnTarget = `${pathname}${search}${hash}`
  clearAuthentication()
  if (shouldNavigate) {
    if (keepsOriginalLoginLanding) discardLoginRedirect()
    else rememberLoginRedirect(returnTarget)
    window.location.assign('/login')
  }
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const orgId = getOrgId()
  if (orgId) {
    config.headers['X-Org-Id'] = orgId
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResult<unknown>
    if (body && typeof body.code === 'number' && body.code !== 200) {
      if (body.code === 401) {
        if (isMarketingSessionRequest(response.config.url)) {
          clearMarketingSession()
        } else {
          expireAccountSession()
        }
      }
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    const message = error?.response?.data?.message || error?.message || '网络异常'
    if (error?.response?.status === 401) {
      if (isMarketingSessionRequest(error?.config?.url)) {
        clearMarketingSession()
      } else {
        expireAccountSession()
      }
    }
    return Promise.reject(new Error(message))
  },
)

export async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await http.get<ApiResult<T>>(url, { params })
  return response.data.data
}

export async function postData<T>(url: string, data?: unknown): Promise<T> {
  const response = await http.post<ApiResult<T>>(url, data)
  return response.data.data
}

export async function putData<T>(url: string, data?: unknown): Promise<T> {
  const response = await http.put<ApiResult<T>>(url, data)
  return response.data.data
}

export async function deleteData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await http.delete<ApiResult<T>>(url, { params })
  return response.data.data
}

export async function uploadData<T>(url: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const response = await http.post<ApiResult<T>>(url, form)
  return response.data.data
}

export async function downloadData(url: string, params?: Record<string, unknown>): Promise<{ blob: Blob; filename: string }> {
  const response = await http.get<Blob>(url, { params, responseType: 'blob' })
  const contentType = String(response.headers['content-type'] || '')
  if (contentType.includes('application/json')) {
    const payload = JSON.parse(await response.data.text()) as ApiResult<unknown>
    throw new Error(payload.message || '下载失败')
  }
  const disposition = String(response.headers['content-disposition'] || '')
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  return {
    blob: response.data,
    filename: encoded ? decodeURIComponent(encoded) : (plain || 'download.xlsx'),
  }
}

export async function getDataWithHeaders<T>(url: string, params: Record<string, unknown> | undefined, headers: Record<string, string>): Promise<T> {
  const response = await http.get<ApiResult<T>>(url, { params, headers })
  return response.data.data
}

export async function postDataWithHeaders<T>(url: string, data: unknown, headers: Record<string, string>): Promise<T> {
  const response = await http.post<ApiResult<T>>(url, data, { headers })
  return response.data.data
}
