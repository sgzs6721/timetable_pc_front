import { Button, Layout, Menu, Select, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUserInfo, logout } from '../api/auth'
import { loadHome, setCurrentOrganization } from '../api/home'
import type { Campus, Organization, UserInfo } from '../api/types'
import { navForUser } from '../nav'
import { clearSession, getCampusId, getOrgId, setCampusId, setOrgId } from '../session'
import './AppShell.css'

const { Sider, Header, Content } = Layout

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

  async function refresh() {
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
    }
    setCurrentOrgId(orgId)
    setOrganizations(home.organizations || [])
    setCampuses(home.campuses || [])
    const resolvedCampus = home.resolvedCampusId || null
    setCampusState(resolvedCampus)
    if (resolvedCampus) {
      setCampusId(resolvedCampus)
    }
    if (home.user) {
      setUser(home.user)
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  const items = useMemo(
    () => navForUser(user).map((item) => ({ key: item.path, label: item.label })),
    [user],
  )

  async function changeOrg(orgId: number) {
    setOrgId(orgId)
    setCampusId(null)
    setCampusState(null)
    try {
      await setCurrentOrganization(orgId)
      await refresh()
      if (location.pathname !== '/home') {
        navigate('/home')
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '切换机构失败')
    }
  }

  async function changeCampus(nextCampusId: number) {
    setCampusId(nextCampusId)
    setCampusState(nextCampusId)
    try {
      await refresh()
    } catch (error) {
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

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={232} theme="light">
        <div className="app-brand">
          <strong>云效课时</strong>
          <span>机构教务台</span>
        </div>
        <Menu
          className="app-menu"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(String(key))}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-tools">
            <Select
              style={{ width: 180 }}
              placeholder="选择机构"
              value={currentOrgId || undefined}
              options={organizations.map((item) => ({ value: item.id, label: item.name }))}
              onChange={changeOrg}
            />
            <Select
              style={{ width: 180 }}
              placeholder="选择校区"
              value={campusId || undefined}
              options={campuses.map((item) => ({ value: item.id, label: item.name }))}
              onChange={changeCampus}
            />
          </div>
          <div className="app-header-tools">
            <span className="app-user">{user?.realName || user?.nickname || user?.nickName || user?.phone || '未登录'}</span>
            <Button onClick={() => navigate('/account')}>个人</Button>
            <Button onClick={onLogout}>退出</Button>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet context={shell} />
        </Content>
      </Layout>
    </Layout>
  )
}
