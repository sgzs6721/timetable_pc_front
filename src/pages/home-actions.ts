import { canViewLeads, isSalesReadOnlyUser } from '../access'
import type { Organization, UserInfo } from '../api/types'

export type HomeView = 'manager' | 'campus' | 'substitute' | 'member'
type HomeActionTone = 'slate' | 'orange' | 'blue' | 'rose' | 'green' | 'purple' | 'amber' | 'cyan'

export interface HomeQuickAction {
  key: string
  label: string
  description: string
  icon: string
  tone: HomeActionTone
  path: string
  requiresActiveCampus?: boolean
}

const LEADS_ACTION: HomeQuickAction = { key: 'leads', label: '客源管理', description: '客源录入与销售跟进', icon: 'icon-leads', tone: 'blue', path: '/leads' }

const MANAGER_QUICK_ACTIONS: HomeQuickAction[] = [
  LEADS_ACTION,
  { key: 'org', label: '机构管理', description: '机构信息与基础配置', icon: 'icon-org', tone: 'slate', path: '/org' },
  { key: 'campus', label: '校区管理', description: '校区人员、业务与权限', icon: 'icon-campus', tone: 'orange', path: '/campus' },
  { key: 'hours', label: '课时管理', description: '课时记录与核算', icon: 'icon-hours', tone: 'blue', path: '/hours', requiresActiveCampus: true },
  { key: 'daily', label: '日常管理', description: '制度与奖惩管理', icon: 'icon-daily', tone: 'rose', path: '/daily', requiresActiveCampus: true },
  { key: 'payments', label: '缴费管理', description: '收费记录与账单', icon: 'icon-payments', tone: 'green', path: '/payments', requiresActiveCampus: true },
  { key: 'salary', label: '工资管理', description: '老师薪酬与结算', icon: 'icon-salary', tone: 'purple', path: '/salary', requiresActiveCampus: true },
  { key: 'finance', label: '收支管理', description: '收入支出全景', icon: 'icon-finance', tone: 'amber', path: '/finance', requiresActiveCampus: true },
  { key: 'profit', label: '经营分析', description: '利润趋势与报表', icon: 'icon-profit', tone: 'cyan', path: '/profit', requiresActiveCampus: true },
]

const TEACHER_QUICK_ACTIONS: HomeQuickAction[] = [
  { key: 'schedule', label: '我的课表', description: '查看授课安排', icon: 'icon-schedule', tone: 'blue', path: '/schedule' },
  { key: 'students', label: '我的学员', description: '查看所带学员', icon: 'icon-students', tone: 'cyan', path: '/students' },
  { key: 'courses', label: '我的课程', description: '查看所带课程', icon: 'icon-timetable-card', tone: 'orange', path: '/courses' },
  { key: 'hours', label: '我的课时', description: '查看授课课时', icon: 'icon-hours', tone: 'purple', path: '/hours' },
  { key: 'salary', label: '我的工资', description: '查看工资明细', icon: 'icon-salary', tone: 'green', path: '/salary' },
  { key: 'account', label: '个人中心', description: '账户与机构信息', icon: 'icon-account', tone: 'slate', path: '/account' },
]

const MEMBER_QUICK_ACTIONS: HomeQuickAction[] = [
  { key: 'salary', label: '我的工资', description: '查看工资明细', icon: 'icon-salary', tone: 'green', path: '/salary' },
  { key: 'account', label: '个人中心', description: '账户与机构信息', icon: 'icon-account', tone: 'slate', path: '/account' },
]

const SALES_READ_ONLY_QUICK_ACTIONS: HomeQuickAction[] = [
  LEADS_ACTION,
  { key: 'students', label: '学员管理', description: '查看负责校区学员', icon: 'icon-students', tone: 'cyan', path: '/students' },
  { key: 'courses', label: '课程管理', description: '查看负责校区课程', icon: 'icon-timetable-card', tone: 'orange', path: '/courses' },
  ...MEMBER_QUICK_ACTIONS,
]

export function quickActionsFor(view: HomeView, user: UserInfo | null, org: Organization | null): HomeQuickAction[] {
  if (isSalesReadOnlyUser(user, org)) return SALES_READ_ONLY_QUICK_ACTIONS
  const actions = view === 'manager'
    ? MANAGER_QUICK_ACTIONS
    : view === 'campus'
      ? MANAGER_QUICK_ACTIONS.filter((item) => item.key !== 'org')
      : view === 'substitute'
        ? TEACHER_QUICK_ACTIONS
        : MEMBER_QUICK_ACTIONS
  if (!canViewLeads(user)) return actions.filter((item) => item.key !== 'leads')
  return actions.some((item) => item.key === 'leads') ? actions : [LEADS_ACTION, ...actions]
}
