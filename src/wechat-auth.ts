import type { WechatWebConfig } from './api/types'

const WECHAT_QRCONNECT_URL = 'https://open.weixin.qq.com/connect/qrconnect'

function configuredRedirectUri(config: WechatWebConfig): string {
  return String(config.redirectUri || import.meta.env.VITE_WECHAT_REDIRECT_URI || '').trim()
}

export function resolveWechatRedirectUri(config: WechatWebConfig): string {
  const configured = configuredRedirectUri(config)
  if (!configured) return `${window.location.origin}/login/wechat`

  const redirect = new URL(configured, window.location.origin)
  if (!/^https?:$/.test(redirect.protocol)) {
    throw new Error('微信登录回调地址必须使用 HTTP 或 HTTPS')
  }
  return redirect.toString()
}

export function createWechatQrLoginUrl(config: WechatWebConfig, state: string): string {
  if (!config.enabled || !config.appId.trim()) {
    throw new Error('微信开放平台网站应用尚未配置')
  }

  const query = new URLSearchParams({
    appid: config.appId.trim(),
    redirect_uri: resolveWechatRedirectUri(config),
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  })
  return `${WECHAT_QRCONNECT_URL}?${query.toString()}#wechat_redirect`
}
