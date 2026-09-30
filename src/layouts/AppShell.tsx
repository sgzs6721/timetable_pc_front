import { Button, Layout, Select, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUserInfo, logout } from '../api/auth'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { loadHome, setCurrentOrganization } from '../api/home'
import type { Campus, HomeBootstrap, Organization, UserInfo } from '../api/types'
import { navForUser } from '../nav'
import { clearSession, getCampusId, getOrgId, setCampusId, setOrgId } from '../session'
import './AppShell.css'

const { Sider, Header, Content } = Layout

const NAV_GROUPS = [
  { caption: '工作台', paths: ['/home', '/students', '/schedule', '/courses', '/hours'] },
  { caption: '校务管理', paths: ['/org', '/campus', '/daily', '/payments', '/salary', '/finance', '/profit'] },
  { caption: '系统', paths: ['/membership', '/account', '/guide', '/feedback'] },
]

function displayName(user: UserInfo | null): string {
  return user?.realName || user?.nickname || user?.nickName || user?.phone || '未登录'
}

function roleLabel(user: UserInfo | null, org: Organization | null): string {
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  if (role === 'owner' || (userId > 0 && ownerId > 0 && userId === ownerId)) return '机构负责人'
  if (role === 'admin') return '机构管理员'
  if (user?.campusAdmin) return '校区管理员'
  if (user?.isSubstituteTeacher) return '带课老师'
  if (role === 'coach') return '老师'
  return '成员'
}

function NavGlyph(props: { path: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (props.path === '/home') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
  }
  if (props.path === '/students') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  }
  if (props.path === '/schedule') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  }
  if (props.path === '/courses' || props.path === '/guide') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
  }
  if (props.path === '/hours') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  }
  if (props.path === '/org' || props.path === '/campus') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><path d="M3 21h18M6 21V5l6-3 6 3v16M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4" /></svg>
  }
  if (props.path === '/daily') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18" /></svg>
  }
  if (props.path === '/payments' || props.path === '/membership') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></svg>
  }
  if (props.path === '/salary' || props.path === '/finance') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><path d="M4 6h15a2 2 0 0 1 2 2v11H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h13" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" /></svg>
  }
  if (props.path === '/profit') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
  }
  if (props.path === '/account') {
    return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="3" /><path d="M12 5v2M12 17v2M5 12H3M21 12h-2" /></svg>
}

export interface ShellContext {
  user: UserInfo | null
  organizations: Organization[]
  campuses: Campus[]
  currentOrgId: number | null
  campusId: number | null
  reload: () => void
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<number | null>(null)
  const [campusId, setCampusState] = useState<number | null>(Number(getCampusId()) || null)
  const [ready, setReady] = useState(false)

  async function refresh(): Promise<HomeBootstrap> {
    const info = await getUserInfo()
    setUser(info)
    const storedOrg = Number(getOrgId()) || undefined
    if (storedOrg) {
      setOrgId(storedOrg)
    }
    const home = await loadHome(Number(getCampusId()) || undefined)
    const orgId = home.currentOrgId || storedOrg || home.organizations?.[0]?.id || null
    if (orgId) {
      setOrgId(orgId)
    } else {
      setOrgId(null)
    }
    setCurrentOrgId(orgId)
    setOrganizations(home.organizations || [])
    setCampuses(home.campuses || [])
    const resolvedCampus = home.resolvedCampusId || null
    setCampusState(resolvedCampus)
    if (resolvedCampus) {
      setCampusId(resolvedCampus)
    } else {
      setCampusId(null)
    }
    if (home.user) {
      setUser(home.user)
    }
    setReady(true)
    return home
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  const currentOrg = organizations.find((item) => item.id === currentOrgId) || null
  const noOrganization = ready && organizations.length === 0
  const items = useMemo(
    () => (noOrganization
      ? [
        { key: '/home', label: '首页' },
        { key: '/account', label: '个人中心' },
        { key: '/guide', label: '使用文档' },
        { key: '/feedback', label: '问题反馈' },
      ]
      : navForUser(user, currentOrg).map((item) => ({ key: item.path, label: item.label }))),
    [user, currentOrg, noOrganization],
  )

  useEffect(() => {
    if (!noOrganization) return
    if (['/home', '/account', '/guide', '/feedback'].includes(location.pathname)) return
    navigate('/home', { replace: true })
  }, [noOrganization, location.pathname, navigate])

  async function changeOrg(orgId: number) {
    if (!orgId || orgId === currentOrgId) return
    const previousOrgId = Number(getOrgId()) || currentOrgId
    const previousCampusId = Number(getCampusId()) || null
    try {
      await setCurrentOrganization(orgId)
      setOrgId(orgId)
      setCampusId(null)
      const home = await refresh()
      const campus = (home.campuses || []).find((item) => item.id === home.resolvedCampusId)
      const org = (home.organizations || []).find((item) => item.id === (home.currentOrgId || orgId))
      message.success(campus?.name ? `已切换至${campus.name}` : `已切换至${org?.name || '机构'}`)
      if (location.pathname !== '/home') {
        navigate('/home')
      }
    } catch (error) {
      if (previousOrgId && previousOrgId !== orgId) {
        await setCurrentOrganization(previousOrgId).catch(() => undefined)
        setOrgId(previousOrgId)
      }
      if (previousCampusId) setCampusId(previousCampusId)
      else setCampusId(null)
      setCampusState(previousCampusId)
      message.error(error instanceof Error ? error.message : '切换机构失败')
    }
  }

  async function changeCampus(nextCampusId: number) {
    if (!nextCampusId || nextCampusId === campusId) return
    const previousCampusId = campusId
    setCampusId(nextCampusId)
    setCampusState(nextCampusId)
    try {
      const home = await refresh()
      const campus = (home.campuses || []).find((item) => item.id === (home.resolvedCampusId || nextCampusId))
      message.success(`已切换至${campus?.name || '校区'}`)
    } catch (error) {
      if (previousCampusId) setCampusId(previousCampusId)
      else setCampusId(null)
      setCampusState(previousCampusId)
      message.error(error instanceof Error ? error.message : '切换校区失败')
    }
  }

  async function onLogout() {
    try {
      await logout()
    } catch {
      // 本地会话仍然退出。
    }
    clearSession()
    navigate('/login', { replace: true })
  }

  const shell: ShellContext = {
    user,
    organizations,
    campuses,
    currentOrgId,
    campusId,
    reload: () => {
      refresh().catch(() => undefined)
    },
  }

  function openPath(path: string) {
    if (subscriptionBlocksPath(user, path, currentOrg)) {
      message.warning(subscriptionExpiredText(user))
      return
    }
    navigate(path)
  }

  const grouped = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.paths.includes(item.key)),
  })).filter((group) => group.items.length > 0)
  const listed = new Set(grouped.flatMap((group) => group.items.map((item) => item.key)))
  const rest = items.filter((item) => !listed.has(item.key))
  if (rest.length) grouped.push({ caption: '其他', paths: [], items: rest })
  const name = displayName(user)

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={236} theme="dark">
        <div className="app-brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </div>
          <div className="brand-copy">
            <strong>云效课时</strong>
            <span>EDUCATION CLOUD</span>
          </div>
        </div>
        <nav className="nav-scroll">
          {grouped.map((group) => (
            <div className="nav-group" key={group.caption}>
              <div className="nav-caption">{group.caption}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={location.pathname === item.key ? 'nav-item active' : 'nav-item'}
                  onClick={() => openPath(item.key)}
                >
                  <NavGlyph path={item.key} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="help-card" type="button" onClick={() => openPath('/guide')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-1 .8-1.9 1.2-1.9 3.1M12 18h.01" />
            </svg>
            <div><b>需要帮助？</b>查看使用手册与反馈</div>
          </button>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-tools">
            <Select
              className="shell-select"
              placeholder="选择机构"
              value={organizations.some((item) => item.id === currentOrgId) ? currentOrgId || undefined : undefined}
              options={organizations.map((item) => ({ value: item.id, label: item.name }))}
              onChange={changeOrg}
            />
            <Select
              className="shell-select"
              placeholder="选择校区"
              value={campuses.some((item) => item.id === campusId) ? campusId || undefined : undefined}
              options={campuses.map((item) => ({ value: item.id, label: item.name }))}
              onChange={changeCampus}
            />
          </div>
          <div className="app-header-tools">
            <button className="profile" type="button" onClick={() => navigate('/account')}>
              <span className="avatar">{name.slice(0, 1)}</span>
              <span className="profile-copy">
                <strong>{name}</strong>
                <span>{roleLabel(user, currentOrg)}</span>
              </span>
            </button>
            <div className="top-divider" />
            <button className="logout-button" type="button" onClick={onLogout}>退出</button>
          </div>
        </Header>
        <Content className="app-content">
          <div className="app-page">
            {subscriptionBlocksPath(user, location.pathname, currentOrg) ? (
              <section className="empty-card">
                <h2>试用期已结束</h2>
                <p>{subscriptionExpiredText(user)}</p>
                <Button type="primary" onClick={() => navigate('/membership')}>去开通会员</Button>
              </section>
            ) : (
              <Outlet context={shell} />
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
