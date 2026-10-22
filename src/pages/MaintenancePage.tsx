import { ClockCircleOutlined, ReloadOutlined, SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveApiBaseUrl } from '../api/http'
import { clearAuthentication, getToken } from '../session'
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  consumeMaintenanceReturn,
  isMaintenanceResponse,
  maintenanceMessage,
  parseResponseBody,
} from '../maintenance'

function checkedTimeText(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 已检测`
}

export function MaintenancePage() {
  const [params] = useSearchParams()
  const [message, setMessage] = useState(() => String(params.get('message') || DEFAULT_MAINTENANCE_MESSAGE).trim().slice(0, 160))
  const [checking, setChecking] = useState(false)
  const [statusText, setStatusText] = useState('服务正在有序恢复中')
  const [lastCheckedText, setLastCheckedText] = useState('')

  async function retry() {
    if (checking) return
    setChecking(true)
    setStatusText('正在检测服务状态…')
    const token = getToken()
    let returning = false
    try {
      const response = await fetch(`${resolveApiBaseUrl().replace(/\/+$/, '')}/auth/validate?_maintenance_check=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const raw = await response.text()
      const body = parseResponseBody(raw)
      const checked = checkedTimeText()
      if (isMaintenanceResponse(response.status, body)) {
        setMessage(maintenanceMessage(body))
        setStatusText('系统仍在维护，请稍后再试')
        setLastCheckedText(checked)
        return
      }
      const businessCode = Number(body?.code)
      const recovered = (response.ok && businessCode === 200) || response.status === 401 || businessCode === 401
      if (!recovered) {
        setStatusText('服务暂未恢复，请稍后再试')
        setLastCheckedText(checked)
        return
      }
      const sessionValid = Boolean(token) && businessCode === 200 && body?.data === true
      setStatusText('服务已恢复，正在返回…')
      setLastCheckedText(checked)
      if (!sessionValid) clearAuthentication()
      returning = true
      window.setTimeout(() => {
        window.location.replace(sessionValid ? (consumeMaintenanceReturn() || '/home') : '/login')
      }, 400)
    } catch {
      setStatusText('暂时无法连接服务器，请检查网络')
      setLastCheckedText(checkedTimeText())
    } finally {
      if (!returning) setChecking(false)
    }
  }

  return (
    <main className="maintenance-page">
      <div className="maintenance-grid" aria-hidden="true" />
      <div className="maintenance-glow" aria-hidden="true" />
      <header className="maintenance-brand">
        <span className="maintenance-logo"><img src="/icons/app-icon-timetable.svg" width="38" height="38" alt="" /></span>
        <span><strong>云效课时</strong><small lang="en">CloudClass</small></span>
      </header>
      <section className="maintenance-content">
        <div className="maintenance-eyebrow"><i /> SERVICE NOTICE</div>
        <h1>系统维护中，<span>很快回来。</span></h1>
        <p className="maintenance-description">{message}</p>
        <div className="maintenance-features" aria-label="维护说明">
          <article><span><SyncOutlined /></span><strong>服务升级</strong><small>核心服务正在优化</small></article>
          <article><span><SafetyCertificateOutlined /></span><strong>数据安全</strong><small>业务数据妥善保护</small></article>
          <article><span><ClockCircleOutlined /></span><strong>稍后恢复</strong><small>完成后可继续使用</small></article>
        </div>
        <div className="maintenance-status">
          <div className="maintenance-live"><i /><span><strong>{statusText}</strong><small>{lastCheckedText || '恢复后无需重新登录'}</small></span></div>
          <Button type="primary" size="large" icon={<ReloadOutlined />} loading={checking} onClick={retry}>重新检测</Button>
        </div>
      </section>
      <footer><SafetyCertificateOutlined /> 维护期间，你的数据将被安全保护</footer>
    </main>
  )
}
