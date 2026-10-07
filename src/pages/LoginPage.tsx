import { ArrowRightOutlined, CalendarOutlined, LineChartOutlined, SafetyCertificateOutlined, WechatOutlined } from '@ant-design/icons'
import { Button, Checkbox, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getUserInfo, getWechatWebConfig, loginByPassword } from '../api/auth'
import type { WechatWebConfig } from '../api/types'
import { consumeLoginRedirect, createWechatOAuthState, setToken } from '../session'
import { createWechatQrLoginUrl } from '../wechat-auth'

export function LoginPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [wechatConfig, setWechatConfig] = useState<WechatWebConfig | null>(null)
  const [wechatConfigLoading, setWechatConfigLoading] = useState(true)

  useEffect(() => {
    getWechatWebConfig()
      .then((config) => {
        setWechatConfig(config)
      })
      .catch(() => {
        setWechatConfig(null)
      })
      .finally(() => setWechatConfigLoading(false))
  }, [])

  async function onFinish(values: { phone: string; password: string }) {
    if (!agreed) {
      message.warning('请先同意用户协议和隐私政策')
      return
    }
    setSubmitting(true)
    try {
      const login = await loginByPassword(values.phone.trim(), values.password)
      setToken(login.token)
      const user = await getUserInfo().catch(() => null)
      const pureParent = String(user?.role || login.role || '').toLowerCase() === 'parent' && !Number(user?.orgMemberId || 0)
      const redirect = consumeLoginRedirect()
      navigate(pureParent ? '/parent/home' : (redirect || '/home'), { replace: true })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  function startWechatLogin() {
    if (!agreed) {
      message.warning('请先同意用户协议和隐私政策')
      return
    }
    try {
      if (!wechatConfig) {
        message.error('微信登录配置加载失败，请刷新页面后重试')
        return
      }
      const oauthState = createWechatOAuthState()
      window.location.assign(createWechatQrLoginUrl(wechatConfig, oauthState))
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '当前浏览器无法安全发起微信登录')
    }
  }

  return (
    <main className="login-page">
      <section className="login-stage">
        <div className="login-brand">
          <div className="login-brand-top">
            <span className="login-logo"><img src="/icons/app-icon-timetable.svg" width="38" height="38" alt="" /></span>
            <div>
              <strong>云效课时</strong>
              <span className="login-brand-en" lang="en">CloudClass</span>
            </div>
          </div>
          <h1>把一天的课，安排清楚。</h1>
          <p className="login-lead">培训机构的课表、学员、课时和经营，放在同一张教务台上。</p>
          <div className="login-features" aria-label="产品能力">
            <div><span><CalendarOutlined /></span><p><b>智能教务</b>课表、学员与课时协同管理</p></div>
            <div><span><LineChartOutlined /></span><p><b>经营可视</b>收费、工资与利润清晰呈现</p></div>
            <div><span><SafetyCertificateOutlined /></span><p><b>权限可靠</b>机构与校区数据严格隔离</p></div>
          </div>
          <p className="login-sync"><i />与微信小程序实时同步</p>
        </div>
        <div className="login-panel">
          <span className="login-panel-badge">管理端工作台</span>
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
              进入教务台 <ArrowRightOutlined />
            </Button>
          </Form>
          <div className="login-split">或</div>
          <Button
            className="login-wechat"
            size="large"
            block
            loading={wechatConfigLoading}
            disabled={!wechatConfigLoading && !Boolean(wechatConfig?.enabled && wechatConfig.appId)}
            onClick={startWechatLogin}
          >
            <WechatOutlined /> {wechatConfigLoading ? '正在加载微信登录' : wechatConfig?.enabled && wechatConfig.appId ? '微信扫码登录' : '微信扫码需先配置开放平台网站应用'}
          </Button>
        </div>
      </section>
    </main>
  )
}
