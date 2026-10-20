import type { Organization, UserInfo } from './api/types'
import {
  canViewLeads,
  campusAdminIds,
  isOrganizationManager,
  isSalesReadOnlyUser,
} from './access'

export { canFilterLeadSalespeople, canViewLeads } from './access'

export interface NavItem {
  key: string
  label: string
  path: string
}

const LEADS_NAV: NavItem = { key: 'leads', label: '客源管理', path: '/leads' }

const MANAGER_NAV: NavItem[] = [
  LEADS_NAV,
  { key: 'home', label: '首页', path: '/home' },
  { key: 'students', label: '学员管理', path: '/students' },
  { key: 'schedule', label: '课表管理', path: '/schedule' },
  { key: 'courses', label: '课程管理', path: '/courses' },
  { key: 'hours', label: '课时管理', path: '/hours' },
  { key: 'org', label: '机构管理', path: '/org' },
  { key: 'campus', label: '校区管理', path: '/campus' },
  { key: 'daily', label: '日常管理', path: '/daily' },
  { key: 'payments', label: '缴费管理', path: '/payments' },
  { key: 'salary', label: '工资管理', path: '/salary' },
  { key: 'finance', label: '收支管理', path: '/finance' },
  { key: 'profit', label: '经营分析', path: '/profit' },
  { key: 'marketing', label: '营销中心', path: '/marketing' },
  { key: 'membership', label: '会员', path: '/membership' },
  { key: 'guide', label: '需要帮助', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

const CAMPUS_ADMIN_NAV = MANAGER_NAV.filter((item) => item.key !== 'org')

const TEACHER_NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'schedule', label: '我的课表', path: '/schedule' },
  { key: 'students', label: '我的学员', path: '/students' },
  { key: 'courses', label: '我的课程', path: '/courses' },
  { key: 'hours', label: '我的课时', path: '/hours' },
  { key: 'salary', label: '我的工资', path: '/salary' },
  { key: 'guide', label: '需要帮助', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

const SALES_READ_ONLY_NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/home' },
  LEADS_NAV,
  { key: 'students', label: '学员管理', path: '/students' },
  { key: 'courses', label: '课程管理', path: '/courses' },
  { key: 'salary', label: '我的工资', path: '/salary' },
  { key: 'account', label: '个人中心', path: '/account' },
  { key: 'guide', label: '需要帮助', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

const MEMBER_NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'salary', label: '我的工资', path: '/salary' },
  { key: 'account', label: '个人中心', path: '/account' },
  { key: 'guide', label: '需要帮助', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

function withoutLeads(items: NavItem[], user: UserInfo | null): NavItem[] {
  return canViewLeads(user) ? items : items.filter((item) => item.key !== 'leads')
}

export function navForUser(user: UserInfo | null, org?: Organization | null): NavItem[] {
  if (!user) {
    // 首屏恢复账号上下文期间，先完整渲染静态管理菜单，避免侧栏从“仅首页”跳变。
    // 内容区仍由 AppShell 的 ready 状态拦截；账号返回后会立即按真实角色收敛菜单。
    return MANAGER_NAV
  }
  const role = (user.role || '').toLowerCase()
  if (isOrganizationManager(user, org)) {
    return withoutLeads(MANAGER_NAV, user)
  }
  if (campusAdminIds(user).length > 0) {
    return withoutLeads(CAMPUS_ADMIN_NAV, user)
  }
  if (user.isSubstituteTeacher) {
    return canViewLeads(user) ? [LEADS_NAV, ...TEACHER_NAV] : TEACHER_NAV
  }
  if (isSalesReadOnlyUser(user, org)) {
    return SALES_READ_ONLY_NAV
  }
  if (role === 'coach') {
    return MEMBER_NAV
  }
  return [
    { key: 'home', label: '首页', path: '/home' },
    { key: 'guide', label: '需要帮助', path: '/guide' },
    { key: 'feedback', label: '问题反馈', path: '/feedback' },
  ]
}
