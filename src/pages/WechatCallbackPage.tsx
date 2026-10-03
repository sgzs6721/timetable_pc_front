import { Button, Result, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getUserInfo, loginByWechatQr } from '../api/auth'
import { consumeLoginRedirect, consumeWechatOAuthState, setToken } from '../session'

export function WechatCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const handled = useRef(false)

  useEffect(() => {
    // React StrictMode 会重放 effect；OAuth state 本身只能消费一次，因此显式防重。
    if (handled.current) return
    handled.current = true
    const callbackState = params.get('state') || ''
    if (!consumeWechatOAuthState(callbackState)) {
      setError('微信登录安全校验未通过，请返回登录页重新扫码')
      return
    }
    const code = params.get('code') || ''
    if (!code) {
      setError('没有收到微信扫码凭证')
      return
    }
    loginByWechatQr(code)
      .then(async (login) => {
        setToken(login.token)
        const user = await getUserInfo().catch(() => null)
        const pureParent = String(user?.role || login.role || '').toLowerCase() === 'parent' && !Number(user?.orgMemberId || 0)
        const redirect = consumeLoginRedirect()
        navigate(pureParent ? '/parent/home' : (redirect || '/home'), { replace: true })
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '微信扫码登录失败')
      })
  }, [navigate, params])

  if (!error) {
    return (
      <div className="auth-wait">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="auth-wait">
      <Result
        status="error"
        title="微信扫码登录失败"
        subTitle={error}
        extra={<Button type="primary" onClick={() => navigate('/login', { replace: true })}>返回登录</Button>}
      />
    </div>
  )
}
