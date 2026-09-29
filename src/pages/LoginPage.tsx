import { Button, Checkbox, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getWechatWebConfig, loginByPassword } from '../api/auth'
import { setToken } from '../session'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [wechatEnabled, setWechatEnabled] = useState(false)
  const [wechatAppId, setWechatAppId] = useState('')

  useEffect(() => {
    getWechatWebConfig()
      .then((config) => {
        setWechatEnabled(Boolean(config?.enabled && config.appId))
        setWechatAppId(config?.appId || '')
      })
      .catch(() => {
        setWechatEnabled(false)
      })
  }, [])

  async function onFinish(values: { phone: string; password: string }) {
    if (!agreed) {
      message.warning('请先阅读并同意用户协议和隐私政策')
      return
    }
    setSubmitting(true)
    try {
      const login = await loginByPassword(values.phone.trim(), values.password)
      setToken(login.token)
      navigate('/home', { replace: true })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  function startWechatLogin() {
    if (!agreed) {
      message.warning('请先阅读并同意用户协议和隐私政策')
      return
    }
    const redirectUri = encodeURIComponent(`${window.location.origin}/login/wechat`)
    window.location.assign(
      `https://open.weixin.qq.com/connect/qrconnect?appid=${wechatAppId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=timetable#wechat_redirect`,
    )
  }

  return (
    <main className="login-page">
      <section className="login-stage">
        <div className="login-brand">
          <p className="login-kicker">云效课时</p>
          <h1>把一天的课，安排清楚。</h1>
          <p className="login-lead">培训机构的课表、学员、课时和经营，放在同一张教务台上。</p>
        </div>
        <div className="login-panel">
          <h2>登录教务台</h2>
          <p className="login-sub">使用小程序里已绑定的手机号，以及在「我的」中设置的网页密码。</p>
          <Form layout="vertical" requiredMark={false} onFinish={onFinish}>
            <Form.Item
              label="手机号"
              name="phone"
              rules={[{ required: true, pattern: /^1\d{10}$/, message: '请输入11位手机号' }]}
            >
              <Input size="large" placeholder="11位手机号" maxLength={11} />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" placeholder="网页登录密码" />
            </Form.Item>
            <Checkbox className="login-agree" checked={agreed} onChange={(event) => setAgreed(event.target.checked)}>
              登录即同意 <Link to="/legal/agreement">用户协议</Link> 和 <Link to="/legal/privacy">隐私政策</Link>
            </Checkbox>
            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              进入教务台
            </Button>
          </Form>
          <div className="login-split">或</div>
          <Button className="login-wechat" size="large" block disabled={!wechatEnabled} onClick={startWechatLogin}>
            {wechatEnabled ? '微信扫码登录' : '微信扫码需先配置开放平台网站应用'}
          </Button>
        </div>
      </section>
    </main>
  )
}
