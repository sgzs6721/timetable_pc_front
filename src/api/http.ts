import axios from 'axios'
import { clearSession, getOrgId, getToken } from '../session'
import type { ApiResult } from './types'

const ONLINE_API_BASE_URL = 'https://timetable.devtesting.top/api'

function resolveApiBaseUrl(): string {
  // 开发时只请求当前页面的 /api。Vite 再转发到 8081。
  // 若写成 http://127.0.0.1:8081，页面端口和接口端口不同，浏览器会先发 OPTIONS 再发 POST。
  if (import.meta.env.DEV) {
    return '/api'
  }
  const { hostname } = window.location
  if (hostname === 'worktable.devtesting.top') {
    return ONLINE_API_BASE_URL
  }
  return import.meta.env.VITE_API_BASE_URL || ONLINE_API_BASE_URL
}

const http = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 20000,
})

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
        clearSession()
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login')
        }
      }
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    const message = error?.response?.data?.message || error?.message || '网络异常'
    if (error?.response?.status === 401) {
      clearSession()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
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
