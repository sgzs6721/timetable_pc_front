import type { Organization, UserInfo } from './api/types'

export interface NavItem {
  key: string
  label: string
  path: string
}

const MANAGER_NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'students', label: '学员', path: '/students' },
  { key: 'schedule', label: '课表', path: '/schedule' },
  { key: 'courses', label: '课程', path: '/courses' },
  { key: 'hours', label: '课时管理', path: '/hours' },
  { key: 'org', label: '机构管理', path: '/org' },
  { key: 'campus', label: '校区与老师', path: '/campus' },
  { key: 'daily', label: '日常管理', path: '/daily' },
  { key: 'payments', label: '缴费管理', path: '/payments' },
  { key: 'salary', label: '工资管理', path: '/salary' },
  { key: 'finance', label: '收支管理', path: '/finance' },
  { key: 'profit', label: '经营分析', path: '/profit' },
  { key: 'membership', label: '会员', path: '/membership' },
  { key: 'guide', label: '使用文档', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

const CAMPUS_ADMIN_NAV = MANAGER_NAV.filter((item) => item.key !== 'org')

const TEACHER_NAV: NavItem[] = [
  { key: 'schedule', label: '我的课表', path: '/schedule' },
  { key: 'students', label: '我的学员', path: '/students' },
  { key: 'hours', label: '我的课时', path: '/hours' },
  { key: 'salary', label: '我的工资', path: '/salary' },
  { key: 'guide', label: '使用文档', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

const MEMBER_NAV: NavItem[] = [
  { key: 'home', label: '首页', path: '/home' },
  { key: 'salary', label: '我的工资', path: '/salary' },
  { key: 'account', label: '个人中心', path: '/account' },
  { key: 'guide', label: '使用文档', path: '/guide' },
  { key: 'feedback', label: '问题反馈', path: '/feedback' },
]

export function navForUser(user: UserInfo | null, org?: Organization | null): NavItem[] {
  if (!user) {
    return [{ key: 'home', label: '首页', path: '/home' }]
  }
  const role = (user.role || '').toLowerCase()
  const owner = role === 'owner' || (Number(user.id || 0) > 0 && Number(org?.ownerId || 0) === Number(user.id))
  if (owner || role === 'admin') {
    return MANAGER_NAV
  }
  if (user.campusAdmin) {
    return CAMPUS_ADMIN_NAV
  }
  if (user.isSubstituteTeacher) {
    return TEACHER_NAV
  }
  if (role === 'coach') {
    return MEMBER_NAV
  }
  return [{ key: 'home', label: '首页', path: '/home' }, { key: 'guide', label: '使用文档', path: '/guide' }, { key: 'feedback', label: '问题反馈', path: '/feedback' }]
}
