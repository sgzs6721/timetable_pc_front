import { Button, Result, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getUserInfo, loginByWechatQr } from '../api/auth'
import { setToken } from '../session'

export function WechatCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
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
        navigate(pureParent ? '/parent/home' : '/home', { replace: true })
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
        status="warning"
        title="扫码登录没有完成"
        subTitle={error}
        extra={<Button type="primary" onClick={() => navigate('/login')}>返回登录</Button>}
      />
    </div>
  )
}
