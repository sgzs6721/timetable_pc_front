import type { UserInfo } from './api/types'

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

export function navForUser(user: UserInfo | null): NavItem[] {
  if (!user) {
    return [{ key: 'home', label: '首页', path: '/home' }]
  }
  const role = (user.role || '').toLowerCase()
  if (role === 'owner' || role === 'admin') {
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

export const MODULE_COPY: Record<string, string> = {
  '/students': '学员列表、详情、打卡、缴费、转校区和批量更换老师',
  '/schedule': '课表列表、周视图、排课、请假、试听和扣费卡',
  '/courses': '课程维护、一对一和学员课时',
  '/hours': '校区课时总览和上课记录',
  '/org': '机构资料、权限和工资设置',
  '/campus': '校区、老师、职位和权限',
  '/daily': '规章制度和奖惩记录',
  '/payments': '缴费汇总和明细',
  '/salary': '工资管理和我的工资',
  '/finance': '收支、财务设置和明细',
  '/profit': '校区利润、每日趋势和销课收入',
  '/membership': '会员续费与升级',
  '/guide': '使用文档',
  '/feedback': '问题反馈',
}
