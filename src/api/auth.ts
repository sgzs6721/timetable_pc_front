import { getData, postData } from './http'
import type { LoginVO, UserInfo, WechatWebConfig } from './types'

export function loginByPassword(phone: string, password: string): Promise<LoginVO> {
  return postData<LoginVO>('/auth/login/password', { phone, password })
}

export function loginByWechatQr(code: string): Promise<LoginVO> {
  return postData<LoginVO>('/auth/login/wechat-qr', { code })
}

export function getWechatWebConfig(): Promise<WechatWebConfig> {
  return getData<WechatWebConfig>('/auth/wechat-web/config')
}

export function getUserInfo(): Promise<UserInfo> {
  return getData<UserInfo>('/auth/userinfo')
}

export function logout(): Promise<void> {
  return postData<void>('/auth/logout')
}
