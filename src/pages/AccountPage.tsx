import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../layouts/AppShell'

export function AccountPage() {
  const { user } = useOutletContext<ShellContext>()
  const name = user?.realName || user?.nickname || user?.nickName || '未命名'
  return (
    <section className="empty-card">
      <h2>{name}</h2>
      <p>手机号 {user?.phone || '未绑定'}</p>
      <p>{[user?.positionCampusName, user?.positionName].filter(Boolean).join(' · ') || '当前没有职位信息'}</p>
      <p>网页登录密码在小程序「我的」里设置。{user?.webPasswordSet ? '当前账号已设置密码。' : '当前账号还没有设置密码。'}</p>
    </section>
  )
}
