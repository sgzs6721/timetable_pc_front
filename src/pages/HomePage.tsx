import { Button, Form, Input, Modal, Spin, Table, Tabs, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, postJson } from '../api/biz'
import { setOrgId } from '../session'
import { loadHome } from '../api/home'
import type { HomeBootstrap, Organization, ScheduleItem, UserInfo } from '../api/types'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { canViewLeads, navForUser } from '../nav'
import { AppIcon, EmptyState, PageHead, money, todayIso, useShell } from './kit'
import { OrganizationCreateModal, type OrganizationCreateValues } from './organization-create-modal'

type HomeView = 'manager' | 'campus' | 'substitute' | 'member'
type DayTab = 'today' | 'tomorrow'

interface MemberTimetable {
  id: number
  isDefault?: number
  status?: number
}

type HomeActionTone = 'slate' | 'orange' | 'blue' | 'rose' | 'green' | 'purple' | 'amber' | 'cyan'

interface HomeQuickAction {
  key: string
  label: string
  description: string
  icon: string
  tone: HomeActionTone
  path: string
  requiresActiveCampus?: boolean
}

const MANAGER_QUICK_ACTIONS: HomeQuickAction[] = [
  { key: 'leads', label: '客源管理', description: '客源录入与销售跟进', icon: 'icon-leads', tone: 'blue', path: '/leads' },
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
  { key: 'hours', label: '我的课时', description: '查看授课课时', icon: 'icon-hours', tone: 'purple', path: '/hours' },
  { key: 'salary', label: '我的工资', description: '查看工资明细', icon: 'icon-salary', tone: 'green', path: '/salary' },
  { key: 'account', label: '个人中心', description: '账户与机构信息', icon: 'icon-account', tone: 'slate', path: '/account' },
]

const MEMBER_QUICK_ACTIONS: HomeQuickAction[] = [
  { key: 'salary', label: '我的工资', description: '查看工资明细', icon: 'icon-salary', tone: 'green', path: '/salary' },
  { key: 'account', label: '个人中心', description: '账户与机构信息', icon: 'icon-account', tone: 'slate', path: '/account' },
]

function quickActionsFor(view: HomeView, user: UserInfo | null, org: Organization | null): HomeQuickAction[] {
  const actions = view === 'manager'
    ? MANAGER_QUICK_ACTIONS
    : view === 'campus'
      ? MANAGER_QUICK_ACTIONS.filter((item) => item.key !== 'org')
      : view === 'substitute'
        ? TEACHER_QUICK_ACTIONS
        : MEMBER_QUICK_ACTIONS
  return canViewLeads(user, org) ? actions : actions.filter((item) => item.key !== 'leads')
}

function campusIsOffline(campus: unknown): boolean {
  const value = (campus as { visibleInList?: boolean | number | string | null } | undefined)?.visibleInList
  if (typeof value === 'string') return ['0', 'false'].includes(value.trim().toLowerCase())
  return value === false || value === 0
}

function campusAdminIds(user: UserInfo | null): number[] {
  const ids = (user?.campusAdminCampusIds || []).map((id) => Number(id || 0)).filter((id, index, list) => id > 0 && list.indexOf(id) === index)
  if (ids.length) return ids
  const legacy = Number(user?.positionCampusId || 0)
  return user?.campusAdmin === true && legacy > 0 ? [legacy] : []
}

function homeView(user: UserInfo | null, org: Organization | null, campusId: number | null): HomeView {
  const role = String(user?.role || '').trim().toLowerCase()
  const userId = Number(user?.id || 0)
  const ownerId = Number(org?.ownerId || 0)
  if (role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId)) return 'manager'
  const scope = campusAdminIds(user)
  if (scope.length > 0) {
    return campusId && scope.includes(campusId) ? 'campus' : (user?.isSubstituteTeacher ? 'substitute' : 'member')
  }
  return user?.isSubstituteTeacher ? 'substitute' : 'member'
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function shiftIso(value: string, delta: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return localIso(date)
}

function dayPartLabel(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function dateHeadline(date = new Date()): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`
}

function clock(value?: string): string {
  return value ? value.slice(0, 5) : ''
}

function titleOf(item: ScheduleItem): string {
  return item.displayName || item.courseName || '未命名课程'
}

function activeSchedule(item: ScheduleItem): boolean {
  return item.uiChangeStatus !== 3 && item.uiChangeStatus !== 4
}

function slotStudentId(item: ScheduleItem): number {
  const instances = (item.studentInstances || []).map((student) => Number(student.studentId || 0)).filter((id) => id > 0)
  if (instances.length === 1) return instances[0]
  const ids = (item.studentIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
  if (ids.length === 1) return ids[0]
  const targetType = String(item.targetType || '').toLowerCase()
  const primary = Number(item.primaryStudentId || item.targetId || 0)
  if ((targetType === 'student' || targetType === 'preset') && primary > 0) return primary
  return 0
}

function singleStudent(item: ScheduleItem, studentId: number): boolean {
  if (studentId <= 0) return false
  if (Number(item.primaryStudentId || 0) > 0) return true
  const instances = (item.studentInstances || []).map((student) => Number(student.studentId || 0)).filter((id) => id > 0)
  if (instances.length === 1) return true
  const ids = (item.studentIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
  if (ids.length === 1) return true
  return String(item.targetType || '').toLowerCase() === 'student'
}

function groupByCoach(items: ScheduleItem[]): Array<{ id: string; coachName: string; timetableId?: number; slots: ScheduleItem[] }> {
  const grouped = new Map<string, ScheduleItem[]>()
  for (const item of items) {
    const coachId = Number(item.coachId || 0)
    const coachName = item.coachName || '未分配老师'
    const timetableId = Number(item.timetableId || 0)
    const key = timetableId > 0 ? `timetable-${timetableId}` : coachId > 0 ? `coach-${coachId}` : `coach-name-${coachName}`
    const slots = grouped.get(key) || []
    slots.push(item)
    grouped.set(key, slots)
  }
  return Array.from(grouped.entries()).map(([id, slots]) => ({
    id,
    coachName: slots[0]?.coachName || '未分配老师',
    timetableId: slots.find((slot) => Number(slot.timetableId || 0) > 0)?.timetableId,
    slots,
  }))
}

function filterMemberLessons(lessons: ScheduleItem[], timetables: MemberTimetable[], timetablesLoaded: boolean, campusId: number | null): ScheduleItem[] {
  const activeIds = timetables
    .filter((item) => Number(item.isDefault || 0) === 1 && Number(item.status ?? 1) !== 2)
    .map((item) => Number(item.id || 0))
    .filter((id, index, list) => id > 0 && list.indexOf(id) === index)
  let rows = lessons.filter(activeSchedule)
  if (activeIds.length) rows = rows.filter((item) => activeIds.includes(Number(item.timetableId || 0)))
  else if (timetablesLoaded) rows = []
  if (!campusId) return rows
  return rows.filter((item) => !item.campusId || item.campusId === campusId)
}

function countCoaches(items: ScheduleItem[]): number {
  const keys = new Set<string>()
  items.forEach((item) => {
    if (Number(item.coachId || 0) > 0) keys.add(`id:${item.coachId}`)
    else if (item.coachName) keys.add(`name:${item.coachName}`)
  })
  return keys.size
}

function accountName(user?: UserInfo | null): string {
  return user?.nickname || user?.nickName || user?.phone || '欢迎回来'
}

export function HomePage() {
  const shell = useShell()
  const navigate = useNavigate()
  const [home, setHome] = useState<HomeBootstrap | null>(shell.home)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [day, setDay] = useState<DayTab>('today')
  const [memberLessons, setMemberLessons] = useState<ScheduleItem[]>([])
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [creatingCampus, setCreatingCampus] = useState(false)
  const [recordStudentId, setRecordStudentId] = useState<number | null>(null)

  const currentOrg = (home?.organizations || shell.organizations).find((item) => item.id === (home?.currentOrgId || shell.currentOrgId)) || null
  const user = home?.user || shell.user
  const campusId = home?.resolvedCampusId || shell.campusId
  const view = homeView(user, currentOrg, campusId)
  const managerView = view === 'manager' || view === 'campus'
  const showSchedule = view !== 'member'
  const quickActions = useMemo(() => {
    const permittedPaths = new Set(navForUser(user || null, currentOrg).map((item) => item.path))
    permittedPaths.add('/account')
    if (shell.leadsEnabled === false) permittedPaths.delete('/leads')
    const campus = shell.campuses.find((item) => item.id === campusId)
    return quickActionsFor(view, user || null, currentOrg)
      .filter((item) => permittedPaths.has(item.path))
      .map((item) => {
        let disabledReason = ''
        if (subscriptionBlocksPath(user || null, item.path, currentOrg)) {
          disabledReason = '会员到期后暂不可用'
        } else if (item.requiresActiveCampus && (!campusId || !campus)) {
          disabledReason = '请先选择校区'
        } else if (item.requiresActiveCampus && campusIsOffline(campus)) {
          disabledReason = '当前校区已下线'
        }
        return { ...item, disabledReason }
      })
  }, [campusId, currentOrg, shell.campuses, shell.leadsEnabled, user, view])

  async function fetchMemberDay(nextUser: UserInfo | null | undefined, nextCampusId: number | null, nextDay: DayTab): Promise<ScheduleItem[]> {
    const coachId = Number(nextUser?.orgMemberId || 0)
    if (coachId <= 0) {
      return []
    }
    const date = nextDay === 'today' ? todayIso() : shiftIso(todayIso(), 1)
    const [timetableResult, lessonResult] = await Promise.allSettled([
      getJson<MemberTimetable[]>('/timetables/list'),
      getJson<ScheduleItem[]>(`/schedules/coach/${coachId}`, { date }),
    ])
    const timetablesLoaded = timetableResult.status === 'fulfilled'
    const timetables = timetablesLoaded ? timetableResult.value || [] : []
    const lessons = lessonResult.status === 'fulfilled' ? lessonResult.value || [] : []
    if (lessonResult.status === 'rejected') {
      throw lessonResult.reason
    }
    return filterMemberLessons(lessons, timetables, timetablesLoaded, nextCampusId)
  }

  useEffect(() => {
    if (!shell.home) return
    setHome(shell.home)
    setError('')
  }, [shell.home])

  useEffect(() => {
    if (!home) return
    let active = true
    const nextUser = home.user || shell.user
    const org = (home.organizations || []).find((item) => item.id === home.currentOrgId) || null
    const nextCampusId = home.resolvedCampusId || shell.campusId
    if (homeView(nextUser, org, nextCampusId) !== 'substitute') {
      setMemberLessons([])
      return () => {
        active = false
      }
    }
    setRefreshing(true)
    fetchMemberDay(nextUser, nextCampusId, day)
      .then((lessons) => {
        if (active) setMemberLessons(lessons)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setMemberLessons([])
        message.error(reason instanceof Error ? reason.message : '课程加载失败')
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })
    return () => {
      active = false
    }
  }, [day, home])

  const dashboard = home?.dashboard
  const schedules = (managerView
    ? (day === 'today' ? dashboard?.todaySchedules || [] : dashboard?.tomorrowSchedules || [])
    : memberLessons
  ).filter(activeSchedule)
  const metrics = useMemo(() => {
    const students = schedules.reduce((sum, item) => sum + Math.max(0, Number(item.currentStudents || 0)), 0)
    return {
      courses: schedules.length,
      students,
      amount: day === 'today' ? dashboard?.todayConsumptionAmount ?? 0 : dashboard?.tomorrowConsumptionAmount ?? 0,
      coaches: countCoaches(schedules),
    }
  }, [dashboard, day, schedules])
  const coachRows = useMemo(() => groupByCoach(schedules), [schedules])
  const dayText = day === 'today' ? '今日' : '明日'
  const emptySchedule = day === 'today'
    ? (view === 'campus' ? '今天还没有课程安排' : '今天暂无课程安排')
    : '明天暂无课程安排'
  const legend = useMemo(() => {
    const seen = new Set<number>()
    return schedules.flatMap((item) => {
      const id = Number(item.campusId || 0)
      if (!id || seen.has(id)) return []
      seen.add(id)
      const campus = shell.campuses.find((entry) => entry.id === id)
      return [{ id, name: campus?.name || `校区${id}` }]
    })
  }, [schedules, shell.campuses])

  function openPath(path: string) {
    if (subscriptionBlocksPath(shell.user, path, currentOrg)) {
      message.warning(subscriptionExpiredText(shell.user))
      return
    }
    navigate(path)
  }

  function openStudent(studentId: number) {
    if (!studentId) return
    if (subscriptionBlocksPath(shell.user, '/students', currentOrg)) {
      message.warning(subscriptionExpiredText(shell.user))
      return
    }
    setRecordStudentId(studentId)
  }

  async function refreshSchedule() {
    setRefreshing(true)
    try {
      const data = await loadHome(shell.campusId)
      setHome(data)
      setError('')
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  async function createOrg(values: OrganizationCreateValues) {
    const phone = String(shell.user?.phone || '').trim()
    const name = String(values.name || '').trim()
    if (!name) {
      message.warning('请输入机构名称')
      return
    }
    if (name.length > 12) {
      message.warning('机构名称最多12字')
      return
    }
    if (!phone) {
      message.warning('请输入联系电话')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      message.warning('请输入正确的手机号')
      return
    }
    const created = await postJson<{ id?: number }>('/organizations', {
      name,
      phone,
      description: String(values.description || '').trim(),
      campusAdminManageSalary: values.campusAdminManageSalary ? 1 : 0,
    })
    if (created?.id) setOrgId(created.id)
    let collaboratorError = ''
    try {
      for (const item of values.collaborators || []) {
        await postJson('/org-members/collaborators', { nickname: item.nickname, phone: item.phone })
      }
    } catch (reason) {
      collaboratorError = reason instanceof Error ? reason.message : '部分协同管理员添加失败'
    }
    if (collaboratorError) message.warning(`机构已创建；${collaboratorError}`)
    else message.success(values.collaborators?.length ? '机构已创建，协同管理员已加入。' : '机构已创建。请继续填写校区信息。')
    setCreatingOrg(false)
    shell.reload()
    await openCampusCreator()
  }

  async function openCampusCreator() {
    try {
      const quota = await getJson<{ canCreate?: boolean; campusCount?: number; campusLimit?: number }>('/campus/quota')
      if (quota.canCreate !== true) {
        Modal.confirm({
          title: '校区额度已满',
          content: `当前已创建 ${quota.campusCount || 0} / ${quota.campusLimit || 0} 个校区，请升级会员后再创建。`,
          okText: '查看会员套餐',
          cancelText: '暂不创建',
          onOk: () => navigate('/membership'),
        })
        return
      }
      setCreatingCampus(true)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '校区额度加载失败')
    }
  }

  async function createCampus(values: { name: string; address?: string; contactPerson?: string; contactPhone?: string }) {
    const quota = await getJson<{ canCreate?: boolean }>('/campus/quota')
    if (quota.canCreate !== true) {
      message.warning('当前会员校区数量已达上限')
      setCreatingCampus(false)
      return
    }
    const name = String(values.name || '').trim()
    const address = String(values.address || '').trim()
    const manager = String(values.contactPerson || '').trim()
    const phone = String(values.contactPhone || '').replace(/\D+/g, '').slice(0, 11)
    if (!name) {
      message.warning('请输入校区名称')
      return
    }
    if (Array.from(name).length > 15) {
      message.warning('校区名称最多15字')
      return
    }
    if (Array.from(address).length > 100) {
      message.warning('地址最多100字')
      return
    }
    if (!manager) {
      message.warning('请输入负责人')
      return
    }
    if (Array.from(manager).length > 6) {
      message.warning('负责人最多6字')
      return
    }
    if (!phone) {
      message.warning('请输入联系电话')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      message.warning('请输入正确的联系电话')
      return
    }
    if (shell.campuses.some((item) => String(item.name || '').trim() === name)) {
      message.warning('校区名称不能重复')
      return
    }
    await postJson('/campus', { name, address, contactPerson: manager, contactPhone: phone })
    message.success('校区已创建')
    setCreatingCampus(false)
    shell.reload()
    navigate('/schedule')
  }

  if (!home) return null

  if (!(home?.organizations || []).length) {
    const memberEmpty = homeView(shell.user, null, null) === 'member' || homeView(shell.user, null, null) === 'substitute'
    return (
      <section>
        <EmptyState
          title={memberEmpty ? '当前账号还未加入机构' : '创建你的第一家机构'}
          text="网页端不进入家长端。已绑定手机号的机构用户可以创建机构，或先在小程序加入机构。"
          action={<Button type="primary" onClick={() => setCreatingOrg(true)}>创建机构</Button>}
        />
        <OrganizationCreateModal open={creatingOrg} onClose={() => setCreatingOrg(false)} onSubmit={createOrg} phone={shell.user?.phone} onMembership={() => navigate('/membership')} />
      </section>
    )
  }

  return (
    <section>
      <PageHead showTitle title={`${dayPartLabel()}，${accountName(user)}`} extra={`${dateHeadline()}${error ? ` · ${error}` : ''}`} />
      {!shell.campuses.length ? (
        <EmptyState
          title="当前机构还没有校区"
          text="建议先创建校区，后续老师、课程和课表都会更顺畅。"
          action={<Button type="primary" onClick={() => void openCampusCreator()}>创建校区</Button>}
        />
      ) : null}
      {managerView ? (
        <div className="metric-grid">
          <article className="metric-card"><span>{dayText}课程</span><strong>{metrics.courses}<em>节</em></strong></article>
          <article className="metric-card"><span>{dayText}学员</span><strong>{metrics.students}<em>人</em></strong></article>
          <article className="metric-card"><span>{dayText}销课</span><strong>{money(metrics.amount)}<em>元</em></strong></article>
          <article className="metric-card"><span>有课老师</span><strong>{metrics.coaches}<em>位</em></strong></article>
        </div>
      ) : null}
      {showSchedule ? (
        <section className="schedule-card">
          <div className="work-toolbar home-schedule-toolbar">
            <Tabs
              className="tabs-nav-only home-schedule-tabs"
              activeKey={day}
              onChange={(value) => setDay(value as DayTab)}
              items={[{ key: 'today', label: '今日课程' }, { key: 'tomorrow', label: '明日课程' }]}
            />
            <Button className="home-schedule-refresh" icon={<AppIcon name="icon-refresh" size={14} />} loading={refreshing} onClick={() => refreshSchedule()}>刷新</Button>
          </div>
          <h2>{managerView ? `${dayText}课程` : `我的${dayText}课程`}</h2>
          {schedules.length === 0 ? <p className="schedule-meta" style={{ padding: '8px 18px 16px' }}>{emptySchedule}</p> : null}
          {managerView ? coachRows.map((row) => (
            <div className="overview-row" key={row.id}>
              <button className="overview-coach" type="button" disabled={!row.timetableId} onClick={() => row.timetableId && openPath(`/schedule?timetableId=${row.timetableId}`)}>
                <AppIcon name="icon-person-neutral" size={14} />
                {row.coachName}
              </button>
              <div>
                {row.slots.map((item) => {
                  const studentId = slotStudentId(item)
                  const linked = singleStudent(item, studentId)
                  return (
                    <div className="overview-slot" key={item.id}>
                      <span className="schedule-time">{clock(item.startTime)}{item.endTime ? `–${clock(item.endTime)}` : ''}</span>
                      {linked ? (
                        <button className="overview-link" type="button" onClick={() => openStudent(studentId)}>{titleOf(item)}</button>
                      ) : (
                        <span className="schedule-title">{titleOf(item)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )) : schedules.map((item) => {
            const studentId = slotStudentId(item)
            const linked = singleStudent(item, studentId)
            return (
              <button
                type="button"
                className="schedule-row"
                key={item.id}
                style={{ width: 'calc(100% - 20px)', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => linked ? openStudent(studentId) : openPath('/schedule')}
              >
                <div className="schedule-time">{clock(item.startTime)}{item.endTime ? `–${clock(item.endTime)}` : ''}</div>
                <div>
                  <div className="schedule-title">{titleOf(item)}</div>
                  <div className="schedule-meta">{[item.coachName, item.location].filter(Boolean).join(' · ') || '未填写老师'}</div>
                </div>
              </button>
            )
          })}
          {!managerView && schedules.length > 0 ? <p className="schedule-meta" style={{ padding: '0 18px 16px' }}>共 {schedules.length} 节</p> : null}
          {!managerView && legend.length > 0 ? (
            <div className="legend-row" style={{ padding: '0 18px 16px' }}>
              {legend.map((item) => <span key={item.id}><i className="legend-dot" />{item.name}</span>)}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="home-module-section" aria-labelledby="home-module-title">
        <header className="home-module-heading">
          <div>
            <span className="home-module-kicker">WORKSPACE</span>
            <h2 id="home-module-title">功能模块</h2>
            <p>{view === 'manager' ? '机构运营与财务分析' : view === 'campus' ? '当前校区的管理工具' : view === 'substitute' ? '授课、学员与个人数据' : '与你当前身份相关的功能'}</p>
          </div>
          <span className="home-module-count">{quickActions.filter((item) => !item.disabledReason).length} 项可用</span>
        </header>
        <div className="home-module-grid">
          {quickActions.map((item) => (
            <button
              key={item.key}
              className={`home-module-action is-${item.tone}${item.disabledReason ? ' is-disabled' : ''}`}
              type="button"
              disabled={Boolean(item.disabledReason)}
              title={item.disabledReason || item.description}
              onClick={() => openPath(item.path)}
            >
              <span className="home-module-icon" aria-hidden="true"><AppIcon name={item.icon} size={26} /></span>
              <span className="home-module-copy"><strong>{item.label}</strong><small>{item.disabledReason || item.description}</small></span>
              <span className="home-module-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </section>
      <CourseRecordModal studentId={recordStudentId} onClose={() => setRecordStudentId(null)} onOpenStudent={(id) => { setRecordStudentId(null); openPath(`/students?studentId=${id}`) }} />
      <OrganizationCreateModal open={creatingOrg} onClose={() => setCreatingOrg(false)} onSubmit={createOrg} phone={shell.user?.phone} onMembership={() => navigate('/membership')} />
      <Modal title="创建校区" open={creatingCampus} onCancel={() => setCreatingCampus(false)} footer={null} destroyOnHidden>
        <Form layout="vertical" onFinish={(values) => createCampus(values).catch((reason) => message.error(reason instanceof Error ? reason.message : '创建失败'))}>
          <Form.Item name="name" label="校区名称" rules={[{ required: true, message: '请输入校区名称' }]}><Input maxLength={15} /></Form.Item>
          <Form.Item name="address" label="详细地址" extra="详细地址可以先不填"><Input maxLength={100} /></Form.Item>
          <Form.Item name="contactPerson" label="负责人" rules={[{ required: true, message: '请输入负责人' }]}><Input maxLength={6} /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}><Input maxLength={11} /></Form.Item>
          <Button type="primary" htmlType="submit">保存并进入课表</Button>
        </Form>
      </Modal>
    </section>
  )
}

const AUTO_CHECK_IN_REMARK = /^(?:排课)?自动打卡(?:\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}))?$/

function courseRecordView(row: Record<string, unknown>): { date: string; title: string; hours: string; meta: string; auto: boolean; timeText: string } {
  const remark = String(row.remark || '')
  const matched = remark.match(AUTO_CHECK_IN_REMARK)
  const auto = Number(row.autoCheckIn || 0) === 1 || !!matched
  const remarkTime = matched?.[1] ? matched[1].replace(/\s+/g, '') : ''
  const scheduleTime = String(row.scheduleTimeText || '')
  const title = String(row.courseName || row.scheduledCourseName || row.courseTypeLabel || row.courseType || '上课记录')
  const meta = [row.cardTypeLabel, row.coachName, matched ? '' : remark].map((item) => String(item || '').trim()).filter(Boolean).join(' · ')
  return {
    date: String(row.consumeDate || row.createTime || '').slice(0, 10) || '未记录日期',
    title,
    hours: `${formatRecordHours(row.hours)}课时`,
    meta,
    auto,
    timeText: matched ? (remarkTime || scheduleTime) : (auto ? scheduleTime : ''),
  }
}

function formatRecordHours(value: unknown): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return String(numeric)
  return numeric.toFixed(2).replace(/\.?0+$/, '')
}

function courseSummary(student: Record<string, unknown> | null): { primary: string; primaryLabel: string; secondary: string; secondaryLabel: string; card: string; low: boolean } {
  const category = String(student?.cardCategory || '').toUpperCase()
  const hidden = !student || student.financialDetailsHidden === true
  const stored = category === 'STORED_VALUE'
  const period = category === 'PERIOD'
  const remainingHours = Number(student?.remainingHours || 0)
  const totalHours = Number(student?.totalHours ?? (Number(student?.regularHours || 0) + Number(student?.bonusHours || 0)))
  if (stored) {
    return {
      primary: hidden ? '--' : money(student?.remainingAmount),
      primaryLabel: '剩余金额',
      secondary: hidden ? '--' : money(student?.totalAmount),
      secondaryLabel: '总金额',
      card: '储值卡',
      low: false,
    }
  }
  if (period) {
    const end = String(student?.periodValidEndDate || '')
    const days = end ? Math.max(0, Math.ceil((new Date(`${end.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000)) : null
    return {
      primary: days == null || Number.isNaN(days) ? '--' : `${days}天`,
      primaryLabel: '剩余天数',
      secondary: end.slice(0, 10) || '--',
      secondaryLabel: '有效期至',
      card: '时段卡',
      low: false,
    }
  }
  return {
    primary: student ? String(remainingHours) : '--',
    primaryLabel: '剩余课时',
    secondary: student ? String(totalHours) : '--',
    secondaryLabel: '总课时',
    card: '课时卡',
    low: !!student && remainingHours < 5,
  }
}

function CourseRecordModal(props: { studentId: number | null; onClose: () => void; onOpenStudent: (id: number) => void }) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [student, setStudent] = useState<Record<string, unknown> | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!props.studentId) return
    let active = true
    setPage(1)
    setRows([])
    setStudent(null)
    setError('')
    setLoading(true)
    getJson<Record<string, unknown>>('/consumptions/home-course-records', { studentId: props.studentId, page: 1, pageSize: 10 })
      .then((data) => {
        if (!active) return
        const loaded = (data.student as Record<string, unknown>) || null
        if (loaded && data.financialDetailsHidden === true) loaded.financialDetailsHidden = true
        setStudent(loaded)
        setRows((data.consumptions as Array<Record<string, unknown>>) || [])
        setTotal(Number(data.total || 0))
        setHasMore(data.hasMore === true)
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : '加载上课记录失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [props.studentId])

  async function more() {
    if (!props.studentId || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const next = page + 1
      const data = await getJson<Record<string, unknown>>('/consumptions/home-course-records', { studentId: props.studentId, page: next, pageSize: 10 })
      setPage(next)
      setRows((current) => [...current, ...((data.consumptions as Array<Record<string, unknown>>) || [])])
      setHasMore(data.hasMore === true)
    } finally {
      setLoadingMore(false)
    }
  }

  const summary = courseSummary(student)
  return (
    <Modal
      title={student?.name ? String(student.name) : '学员上课记录'}
      open={!!props.studentId}
      onCancel={props.onClose}
      footer={props.studentId ? <Button type="primary" onClick={() => props.onOpenStudent(props.studentId || 0)}>进入学员</Button> : null}
      width={720}
      destroyOnHidden
    >
      <div className="stat-line">
        <span>{summary.primaryLabel}<strong>{summary.primary}</strong></span>
        <span>{summary.secondaryLabel}<strong>{summary.secondary}</strong></span>
      </div>
      <p className="schedule-meta">{[student?.campusName || '当前校区', summary.card, rows[0] ? courseRecordView(rows[0]).title : '', total ? `共${total}条上课记录` : ''].filter(Boolean).join(' · ')}{summary.low ? ' · 不足5课时' : ''}</p>
      {loading ? <Spin /> : null}
      {error ? <p>{error}</p> : null}
      {!loading && !error ? (
        <Table
          rowKey={(row) => String(row.id)}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '暂无上课记录' }}
          columns={[
            { title: '日期', render: (_: unknown, row: Record<string, unknown>) => courseRecordView(row).date },
            { title: '课程', render: (_: unknown, row: Record<string, unknown>) => courseRecordView(row).title },
            { title: '课时', render: (_: unknown, row: Record<string, unknown>) => courseRecordView(row).hours },
            { title: '说明', render: (_: unknown, row: Record<string, unknown>) => {
              const view = courseRecordView(row)
              return [view.meta, view.auto ? `自动打卡${view.timeText ? ` ${view.timeText}` : ''}` : ''].filter(Boolean).join(' · ')
            } },
          ]}
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? <p className="schedule-meta">{loadingMore ? '加载中...' : (hasMore ? '' : '没有更多记录了')}</p> : null}
      {hasMore ? <Button style={{ marginTop: 12 }} loading={loadingMore} onClick={() => more().catch((reason) => message.error(reason instanceof Error ? reason.message : '加载更多失败'))}>加载更多</Button> : null}
    </Modal>
  )
}
