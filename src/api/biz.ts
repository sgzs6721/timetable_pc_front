import { deleteData, downloadData, getData, postData, putData } from './http'

export type Query = Record<string, unknown>

function clean(params?: Query): Query | undefined {
  if (!params) return undefined
  const next: Query = {}
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') next[key] = value
  })
  return Object.keys(next).length ? next : undefined
}

export function getJson<T>(url: string, params?: Query): Promise<T> {
  return getData<T>(url, clean(params))
}

export function postJson<T>(url: string, data?: unknown): Promise<T> {
  return postData<T>(url, data ?? {})
}

export function putJson<T>(url: string, data?: unknown): Promise<T> {
  return putData<T>(url, data ?? {})
}

export function delJson<T>(url: string, params?: Query): Promise<T> {
  return deleteData<T>(url, clean(params))
}

export function downloadFile(url: string, params?: Query): Promise<{ blob: Blob; filename: string }> {
  return downloadData(url, clean(params))
}
