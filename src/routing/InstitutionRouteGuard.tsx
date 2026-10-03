import { Button, Result } from 'antd'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../layouts/AppShell'
import { navForUser } from '../nav'

const ALWAYS_AVAILABLE_PATHS = new Set(['/home', '/account', '/membership', '/guide', '/feedback'])

/**
 * 菜单隐藏不是权限保护。机构 Shell 恢复账号上下文后，在业务页面发请求前拦截越权直达。
 * 没有机构时只保留创建机构所需入口。
 */
export function InstitutionRouteGuard() {
  const shell = useOutletContext<ShellContext>()
  const location = useLocation()
  const navigate = useNavigate()
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const hasOrganization = shell.organizations.length > 0
  const rolePaths = hasOrganization
    ? navForUser(shell.user, currentOrg).map((item) => item.path)
    : []
  const allowedPaths = new Set([...ALWAYS_AVAILABLE_PATHS, ...rolePaths])

  if (allowedPaths.has(location.pathname)) {
    return <Outlet context={shell} />
  }

  const description = hasOrganization
    ? '此功能不在当前角色的权限范围内，请从左侧菜单进入可用功能。'
    : '当前账号尚未加入机构。你可以返回首页创建机构。'

  return (
    <Result
      status="403"
      title="当前账号无权访问此页面"
      subTitle={description}
      extra={<Button type="primary" onClick={() => navigate('/home', { replace: true })}>返回可用首页</Button>}
    />
  )
}
