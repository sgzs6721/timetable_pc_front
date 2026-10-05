import {
  AccountBookOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  CrownOutlined,
  CheckOutlined,
  DownOutlined,
  DollarCircleOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  FundProjectionScreenOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  NotificationOutlined,
  QuestionCircleOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, Layout, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUserInfo, logout } from '../api/auth'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { loadHome, setCurrentOrganization } from '../api/home'
import { getJson } from '../api/biz'
import { resolveApiAssetUrl } from '../api/http'
import type { Campus, HomeBootstrap, Organization, UserInfo } from '../api/types'
import { navForUser } from '../nav'
import { clearSession, getCampusId, getOrgId, setCampusId, setOrgId } from '../session'

const { Sider, Header, Content } = Layout

const NAV_GROUPS = [
  { caption: '工作台', paths: ['/home', '/leads', '/students', '/schedule', '/courses', '/hours'] },
  { caption: '校务管理', paths: ['/org', '/campus', '/daily', '/payments', '/salary', '/finance', '/profit', '/marketing'] },
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

function RouteGlyph(props: { path: string }) {
  let Icon = AppstoreOutlined
  if (props.path === '/home') Icon = AppstoreOutlined
  else if (props.path === '/students') Icon = IdcardOutlined
  else if (props.path === '/schedule') Icon = CalendarOutlined
  else if (props.path === '/courses') Icon = BookOutlined
  else if (props.path === '/hours') Icon = FieldTimeOutlined
  else if (props.path === '/org') Icon = BankOutlined
  else if (props.path === '/campus') Icon = EnvironmentOutlined
  else if (props.path === '/daily') Icon = AuditOutlined
  else if (props.path === '/payments') Icon = DollarCircleOutlined
  else if (props.path === '/salary') Icon = FundProjectionScreenOutlined
  else if (props.path === '/finance') Icon = AccountBookOutlined
  else if (props.path === '/profit') Icon = BarChartOutlined
  else if (props.path === '/marketing') Icon = NotificationOutlined
  else if (props.path === '/leads') Icon = TeamOutlined
  else if (props.path === '/membership') Icon = CrownOutlined
  else if (props.path === '/account') Icon = UserOutlined
  else if (props.path === '/guide') Icon = QuestionCircleOutlined
  else if (props.path === '/feedback') Icon = MessageOutlined
  else Icon = SolutionOutlined
  return <Icon />
}

function NavGlyph(props: { path: string }) {
  return <span className="nav-icon"><RouteGlyph path={props.path} /></span>
}

export interface ShellContext {
  user: UserInfo | null
  home: HomeBootstrap | null
  organizations: Organization[]
  campuses: Campus[]
  currentOrgId: number | null
  campusId: number | null
  reload: () => void
  setPageDescription: (description: string) => void
  leadsEnabled: boolean
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [homeBootstrap, setHomeBootstrap] = useState<HomeBootstrap | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<number | null>(null)
  const [campusId, setCampusState] = useState<number | null>(Number(getCampusId()) || null)
  const [ready, setReady] = useState(false)
  const [bootstrapError, setBootstrapError] = useState('')
  const [marketingEnabled, setMarketingEnabled] = useState(true)
  const [leadsEnabled, setLeadsEnabled] = useState(true)
  const [pageContext, setPageContext] = useState({ path: '', description: '' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('timetable-sidebar-collapsed') === '1')

  useEffect(() => {
    localStorage.setItem('timetable-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  const setPageDescription = useCallback((description: string) => {
    setPageContext((current) => {
      if (current.path === location.pathname && current.description === description) return current
      return { path: location.pathname, description }
    })
  }, [location.pathname])

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
    setHomeBootstrap(home)
    setReady(true)
    return home
  }

  function bootstrap() {
    setReady(false)
    setBootstrapError('')
    refresh().catch((error) => {
      setBootstrapError(error instanceof Error ? error.message : '工作台初始化失败')
      setReady(true)
    })
  }

  useEffect(() => {
    bootstrap()
    getJson<{ marketingEnabled?: boolean; leadsEnabled?: boolean }>('/platform-features')
      .then((features) => {
        setMarketingEnabled(features?.marketingEnabled !== false)
        setLeadsEnabled(features?.leadsEnabled !== false)
      })
      .catch(() => {
        setMarketingEnabled(true)
        setLeadsEnabled(true)
      })
  }, [])

  const currentOrg = organizations.find((item) => item.id === currentOrgId) || null
  const noOrganization = ready && organizations.length === 0
  const items = useMemo(
    () => (noOrganization
      ? [
        { key: '/home', label: '首页' },
        { key: '/account', label: '个人中心' },
        { key: '/membership', label: '会员' },
        { key: '/guide', label: '需要帮助' },
        { key: '/feedback', label: '问题反馈' },
      ]
      : navForUser(user, currentOrg)
        .filter((item) => item.path !== '/marketing' || marketingEnabled)
        .filter((item) => item.path !== '/leads' || leadsEnabled)
        .map((item) => ({ key: item.path, label: item.label }))),
    [user, currentOrg, noOrganization, marketingEnabled, leadsEnabled],
  )

  useEffect(() => {
    if (!noOrganization) return
    if (['/home', '/account', '/membership', '/guide', '/feedback'].includes(location.pathname)) return
    navigate('/home', { replace: true })
  }, [noOrganization, location.pathname, navigate])

  useEffect(() => {
    if (marketingEnabled || location.pathname !== '/marketing') return
    message.info('营销功能当前未开放')
    navigate('/home', { replace: true })
  }, [marketingEnabled, location.pathname, navigate])

  useEffect(() => {
    if (leadsEnabled || location.pathname !== '/leads') return
    message.info('客源管理当前未开放')
    navigate('/home', { replace: true })
  }, [leadsEnabled, location.pathname, navigate])

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
    home: homeBootstrap,
    organizations,
    campuses,
    currentOrgId,
    campusId,
    reload: () => {
      refresh().catch(() => undefined)
    },
    setPageDescription,
    leadsEnabled,
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
    items: group.paths.flatMap((path) => items.filter((item) => item.key === path)),
  })).filter((group) => group.items.length > 0)
  const listed = new Set(grouped.flatMap((group) => group.items.map((item) => item.key)))
  const rest = items.filter((item) => !listed.has(item.key))
  if (rest.length) grouped.push({ caption: '其他', paths: [], items: rest })
  const name = displayName(user)
  const currentItem = items.find((item) => item.key === location.pathname)
  const currentCampus = campuses.find((item) => item.id === campusId)
  const pageDescription = pageContext.path === location.pathname ? pageContext.description : ''

  return (
    <Layout className={sidebarCollapsed ? 'app-shell is-sidebar-collapsed' : 'app-shell'}>
      <Sider className="app-sider" width={236} collapsedWidth={72} collapsed={sidebarCollapsed} trigger={null} theme="dark">
        <div className="app-brand">
          <div className="brand-mark" aria-hidden="true">
            <CalendarOutlined />
          </div>
          <div className="brand-copy">
            <strong>云效课时</strong>
            <span>培训教务管理</span>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
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
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
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
          <button className="sidebar-logout" type="button" onClick={onLogout} aria-label="退出登录">
            <span className="sidebar-logout-icon"><LogoutOutlined /></span>
            <span>退出登录</span>
          </button>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-context">
            <span className="header-context-icon" aria-hidden="true"><RouteGlyph path={location.pathname} /></span>
            <div>
              <strong>{currentItem?.label || '教务工作台'}</strong>
              <span title={pageDescription}>{pageDescription}</span>
            </div>
          </div>
          <div className="app-header-tools">
            <div className="header-selects">
              <Dropdown
                disabled={!organizations.length}
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  className: 'campus-switch-menu',
                  selectable: true,
                  selectedKeys: currentOrgId ? [String(currentOrgId)] : [],
                  items: organizations.map((item) => ({
                    key: String(item.id),
                    label: <span className="campus-switch-menu-item"><span>{item.name || '未命名机构'}</span>{item.id === currentOrgId ? <em><CheckOutlined /> 当前</em> : null}</span>,
                  })),
                  onClick: ({ key }) => void changeOrg(Number(key)),
                }}
              >
                <button className="shell-campus-switch shell-organization-switch" type="button" aria-label="切换机构">
                  <span className="shell-select-label">机构</span>
                  <strong>{currentOrg?.name || '请选择机构'}</strong>
                  <span className="shell-campus-switch-action" aria-hidden="true"><DownOutlined /></span>
                </button>
              </Dropdown>
              <Dropdown
                disabled={!campuses.length}
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  className: 'campus-switch-menu',
                  selectable: true,
                  selectedKeys: campusId ? [String(campusId)] : [],
                  items: campuses.map((item) => ({
                    key: String(item.id),
                    label: <span className="campus-switch-menu-item"><span>{item.name || '未命名校区'}</span>{item.id === campusId ? <em><CheckOutlined /> 当前</em> : null}</span>,
                  })),
                  onClick: ({ key }) => void changeCampus(Number(key)),
                }}
              >
                <button className="shell-campus-switch" type="button" aria-label="切换校区">
                  <span className="shell-select-label">校区</span>
                  <strong>{currentCampus?.name || '请选择校区'}</strong>
                  <span className="shell-campus-switch-action" aria-hidden="true"><DownOutlined /></span>
                </button>
              </Dropdown>
            </div>
            <button className="profile" type="button" onClick={() => navigate('/account')}>
              <span className="profile-copy">
                <strong>{name}</strong>
                <span>{roleLabel(user, currentOrg)}</span>
              </span>
              <Avatar
                className="profile-avatar"
                shape="square"
                size={39}
                src={resolveApiAssetUrl(String(user?.avatarUrl || '')) || undefined}
                icon={<UserOutlined />}
              />
            </button>
          </div>
        </Header>
        <Content className="app-content">
          <div className="app-page">
            {!ready ? (
              <div className="route-loading">正在恢复账号、机构与校区上下文…</div>
            ) : bootstrapError ? (
              <section className="empty-card">
                <h2>工作台初始化失败</h2>
                <p>{bootstrapError}</p>
                <Button type="primary" onClick={bootstrap}>重新加载</Button>
              </section>
            ) : subscriptionBlocksPath(user, location.pathname, currentOrg) ? (
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
