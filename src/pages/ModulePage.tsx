import { useLocation } from 'react-router-dom'
import { MODULE_COPY } from '../nav'

export function ModulePage() {
  const location = useLocation()
  const copy = MODULE_COPY[location.pathname] || '这一页会按小程序里的功能逐项接上。'
  return (
    <section className="empty-card">
      <h2>这一页正在接入</h2>
      <p>{copy}。接口与小程序共用，字段和操作会按小程序原样补齐。</p>
    </section>
  )
}
