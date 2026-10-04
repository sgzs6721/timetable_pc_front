import {
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ReadOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Spin, message } from 'antd'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUserInfo, logout } from '../api/auth'
import { parentApi } from '../api/parent'
import type { UserInfo } from '../api/types'
import { clearSession } from '../session'
import type { ParentHome } from './parent-model'

interface ParentContextValue {
  user: UserInfo | null
  home: ParentHome
  reload: () => Promise<void>
}

const ParentContext = createContext<ParentContextValue | null>(null)

export function useParentContext(): ParentContextValue {
  const value = useContext(ParentContext)
  if (!value) throw new Error('ParentContext is unavailable')
  return value
}

const primaryNav = [
  { path: '/parent/home', label: '首页', icon: <HomeOutlined /> },
  { path: '/parent/children', label: '成员', icon: <TeamOutlined /> },
  { path: '/parent/timetable', label: '课表', icon: <CalendarOutlined /> },
  { path: '/parent/courses', label: '课程', icon: <BookOutlined /> },
  { path: '/parent/mine', label: '我的', icon: <UserOutlined /> },
]

const secondaryNav = [
  { path: '/parent/activities', label: '最近动态', icon: <ClockCircleOutlined /> },
  { path: '/parent/records', label: '缴费与上课', icon: <ReadOutlined /> },
  { path: '/parent/course-stats', label: '课程统计', icon: <BarChartOutlined /> },
]

export function ParentLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [home, setHome] = useState<ParentHome>({ children: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    const [info, nextHome] = await Promise.all([getUserInfo(), parentApi.home()])
    setUser(info)
    setHome({ ...nextHome, children: nextHome.children || [] })
  }

  useEffect(() => {
    setLoading(true)
    setError('')
    reload()
      .catch((reason) => setError(reason instanceof Error ? reason.message : '家长端加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const title = useMemo(() => [...primaryNav, ...secondaryNav].find((item) => location.pathname.startsWith(item.path))?.label || '家长端', [location.pathname])

  async function signOut() {
    await logout().catch(() => undefined)
    clearSession()
    navigate('/login', { replace: true })
  }

  if (loading) return <div className="parent-route-state"><Spin size="large" /><span>正在同步成员与课表…</span></div>
  if (error) return <div className="parent-route-state"><h2>家长端加载失败</h2><p>{error}</p><Button type="primary" onClick={() => window.location.reload()}>重新加载</Button></div>

  return (
    <div className="parent-app">
      <aside className="parent-side">
        <button type="button" className="parent-brand" onClick={() => navigate('/parent/home')}>
          <span className="parent-brand-mark"><CalendarOutlined /></span>
          <span><strong>云效课时</strong><small>家长学习空间</small></span>
        </button>
        <div className="parent-profile">
          <Avatar size={42} src={user?.avatarUrl} icon={<UserOutlined />} />
          <span><strong>{user?.realName || user?.nickname || user?.nickName || '家长用户'}</strong><small>{home.phone || user?.phone || '家庭学习账户'}</small></span>
        </div>
        <nav className="parent-nav" aria-label="家长端导航">
          <p>学习空间</p>
          {primaryNav.map((item) => <ParentNavItem key={item.path} {...item} active={location.pathname === item.path} onClick={() => navigate(item.path)} />)}
          <p>数据记录</p>
          {secondaryNav.map((item) => <ParentNavItem key={item.path} {...item} active={location.pathname.startsWith(item.path)} onClick={() => navigate(item.path)} />)}
        </nav>
        <div className="parent-side-foot">
          {user?.orgMemberId ? <Button block onClick={() => navigate('/home')} icon={<IdcardOutlined />}>进入机构端</Button> : null}
          <Button block type="text" danger onClick={signOut} icon={<LogoutOutlined />}>退出登录</Button>
        </div>
      </aside>
      <main className="parent-main">
        <header className="parent-topbar">
          <div><span>家长端</span><h1>{title}</h1></div>
          <div className="parent-topbar-note">课表、课程、缴费与成长记录实时同步</div>
        </header>
        <div className="parent-content">
          <ParentContext.Provider value={{ user, home, reload }}><Outlet /></ParentContext.Provider>
        </div>
      </main>
    </div>
  )
}

function ParentNavItem(props: { path: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" className={props.active ? 'parent-nav-item active' : 'parent-nav-item'} onClick={props.onClick}><span>{props.icon}</span>{props.label}</button>
}

export function memberKey(member: { source: string; childId?: number; studentId?: number }) {
  return member.source === 'PRIVATE' ? `child-${member.childId}` : `student-${member.studentId}`
}

export function copyShareLink(path: string) {
  navigator.clipboard.writeText(`${window.location.origin}${path}`)
    .then(() => message.success('分享链接已复制'))
    .catch(() => message.error('复制失败，请从地址栏复制'))
}
