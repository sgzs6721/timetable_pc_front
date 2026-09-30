import { Button, Form, Input, Modal, Segmented, Spin, Switch, Table, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, postJson } from '../api/biz'
import { loadHome } from '../api/home'
import type { HomeBootstrap, Organization, ScheduleItem, UserInfo } from '../api/types'
import { subscriptionBlocksPath, subscriptionExpiredText } from '../access'
import { EmptyState, PageHead, money, todayIso, useShell } from './kit'
import './HomePage.css'

type HomeView = 'manager' | 'campus' | 'substitute' | 'member'
type DayTab = 'today' | 'tomorrow'

interface MemberTimetable {
  id: number
  isDefault?: number
  status?: number
}

const SHORTCUTS: Record<HomeView, Array<{ label: string; path: string; hint: string; campus?: boolean }>> = {
  manager: [
    { label: '机构管理', path: '/org', hint: '机构信息与配置' },
    { label: '校区管理', path: '/campus', hint: '校区人员与权限', campus: true },
    { label: '课时管理', path: '/hours', hint: '课时记录与核算', campus: true },
    { label: '日常管理', path: '/daily', hint: '制度与奖惩管理', campus: true },
    { label: '缴费管理', path: '/payments', hint: '收费记录与账单', campus: true },
    { label: '工资管理', path: '/salary', hint: '老师薪酬与结算', campus: true },
    { label: '收支管理', path: '/finance', hint: '收入支出全景', campus: true },
    { label: '经营分析', path: '/profit', hint: '利润趋势与报表', campus: true },
  ],
  campus: [
    { label: '校区管理', path: '/campus', hint: '校区人员与权限', campus: true },
    { label: '课时管理', path: '/hours', hint: '课时记录与核算', campus: true },
    { label: '日常管理', path: '/daily', hint: '制度与奖惩管理', campus: true },
    { label: '缴费管理', path: '/payments', hint: '收费记录与账单', campus: true },
    { label: '工资管理', path: '/salary', hint: '老师薪酬与结算', campus: true },
    { label: '收支管理', path: '/finance', hint: '收入支出全景', campus: true },
    { label: '经营分析', path: '/profit', hint: '利润趋势与报表', campus: true },
  ],
  substitute: [
    { label: '我的课表', path: '/schedule', hint: '查看授课安排' },
    { label: '我的学员', path: '/students', hint: '查看所带学员' },
    { label: '我的课时', path: '/hours', hint: '查看授课课时' },
    { label: '我的工资', path: '/salary', hint: '查看工资明细' },
    { label: '个人中心', path: '/account', hint: '查看个人资料' },
  ],
  member: [
    { label: '我的工资', path: '/salary', hint: '查看工资明细' },
    { label: '个人中心', path: '/account', hint: '查看个人资料' },
  ],
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
  const [home, setHome] = useState<HomeBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
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

  async function loadMemberDay(nextUser: UserInfo | null | undefined, nextCampusId: number | null, nextDay: DayTab) {
    const coachId = Number(nextUser?.orgMemberId || 0)
    if (coachId <= 0) {
      setMemberLessons([])
      return
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
      setMemberLessons([])
      throw lessonResult.reason
    }
    setMemberLessons(filterMemberLessons(lessons, timetables, timetablesLoaded, nextCampusId))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    loadHome(shell.campusId)
      .then(async (data) => {
        if (!active) return
        setHome(data)
        setError('')
        const nextUser = data.user || shell.user
        const org = (data.organizations || []).find((item) => item.id === data.currentOrgId) || null
        const nextCampusId = data.resolvedCampusId || shell.campusId
        if (homeView(nextUser, org, nextCampusId) === 'substitute') {
          await loadMemberDay(nextUser, nextCampusId, day)
        } else if (active) {
          setMemberLessons([])
        }
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : '首页加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // 日期切换单独刷新带课老师的课程，避免整页回到加载中。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.campusId, shell.currentOrgId])

  useEffect(() => {
    if (!home || view !== 'substitute') return
    let active = true
    setRefreshing(true)
    loadMemberDay(user, campusId, day)
      .catch((reason: unknown) => {
        if (active) message.error(reason instanceof Error ? reason.message : '课程加载失败')
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })
    return () => {
      active = false
    }
    // 只在今天/明天切换时重取带课老师课程。首次进入由首页加载负责。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

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
  const shortcuts = SHORTCUTS[view]
  const campusScopedHidden = view === 'campus' && !campusId
  const dayText = day === 'today' ? '今日' : '明日'
  const emptySchedule = day === 'today' ? '今天暂无课程安排' : '明天暂无课程安排'
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
      if (view === 'substitute') await loadMemberDay(data.user || user, data.resolvedCampusId || campusId, day)
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  async function createOrg(values: { name: string; description?: string; campusAdminManageSalary?: boolean }) {
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
    await postJson('/organizations', {
      name,
      phone,
      description: String(values.description || '').trim(),
      campusAdminManageSalary: values.campusAdminManageSalary ? 1 : 0,
    })
    message.success('机构已创建。校区的地址、管理员和电话可以先不填。')
    setCreatingOrg(false)
    setCreatingCampus(true)
    shell.reload()
  }

  async function createCampus(values: { name: string; address?: string; contactPerson?: string; contactPhone?: string }) {
    await postJson('/campus', { name: values.name, address: values.address, contactPerson: values.contactPerson, contactPhone: values.contactPhone })
    message.success('校区已创建')
    setCreatingCampus(false)
    shell.reload()
    navigate('/schedule')
  }

  if (loading) return <Spin />

  if (!(home?.organizations || []).length) {
    const memberEmpty = homeView(shell.user, null, null) === 'member' || homeView(shell.user, null, null) === 'substitute'
    return (
      <section>
        <EmptyState
          title={memberEmpty ? '当前账号还未加入机构' : '创建你的第一家机构'}
          text="网页端不进入家长端。已绑定手机号的机构用户可以创建机构，或先在小程序加入机构。"
          action={<Button type="primary" onClick={() => setCreatingOrg(true)}>创建机构</Button>}
        />
        <OrgModal open={creatingOrg} onClose={() => setCreatingOrg(false)} onSubmit={createOrg} phone={shell.user?.phone} />
      </section>
    )
  }

  return (
    <section>
      <PageHead title={`${dayPartLabel()}，${accountName(user)}`} extra={`${dateHeadline()}${error ? ` · ${error}` : ''}`} />
      {!shell.campuses.length ? (
        <EmptyState
          title="当前机构还没有校区"
          text="建议先创建校区，后续老师、课程和课表都会更顺畅。"
          action={<Button type="primary" onClick={() => setCreatingCampus(true)}>创建校区</Button>}
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
          <div className="work-toolbar" style={{ padding: '16px 18px 0' }}>
            <Segmented
              value={day}
              onChange={(value) => setDay(value as DayTab)}
              options={[{ label: '今日课程', value: 'today' }, { label: '明日课程', value: 'tomorrow' }]}
            />
            <Button loading={refreshing} onClick={() => refreshSchedule()}>刷新</Button>
          </div>
          <h2>{managerView ? `${dayText}课程` : `我的${dayText}课程`}</h2>
          {schedules.length === 0 ? <p className="schedule-meta" style={{ padding: '8px 18px 16px' }}>{emptySchedule}</p> : null}
          {managerView ? coachRows.map((row) => (
            <div className="overview-row" key={row.id}>
              <button className="overview-coach" type="button" disabled={!row.timetableId} onClick={() => row.timetableId && openPath(`/schedule?timetableId=${row.timetableId}`)}>
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
      <div className="shortcut-grid">
        {shortcuts.filter((item) => !(item.campus && campusScopedHidden)).map((item) => (
          <button className="shortcut-card" key={item.path + item.label} onClick={() => openPath(item.path)}>
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
      </div>
      <CourseRecordModal studentId={recordStudentId} onClose={() => setRecordStudentId(null)} onOpenStudent={(id) => { setRecordStudentId(null); openPath(`/students?studentId=${id}`) }} />
      <OrgModal open={creatingOrg} onClose={() => setCreatingOrg(false)} onSubmit={createOrg} phone={shell.user?.phone} />
      <Modal title="创建校区" open={creatingCampus} onCancel={() => setCreatingCampus(false)} footer={null} destroyOnClose>
        <Form layout="vertical" onFinish={(values) => createCampus(values).catch((reason) => message.error(reason instanceof Error ? reason.message : '创建失败'))}>
          <Form.Item name="name" label="校区名称" rules={[{ required: true, message: '请填写校区名称' }]}><Input maxLength={20} /></Form.Item>
          <Form.Item name="address" label="详细地址"><Input maxLength={100} /></Form.Item>
          <Form.Item name="contactPerson" label="校区管理员"><Input maxLength={20} /></Form.Item>
          <Form.Item name="contactPhone" label="联系电话"><Input maxLength={20} /></Form.Item>
          <p>地址、管理员和电话不是必填，可以先跳过。</p>
          <Button type="primary" htmlType="submit">保存并进入课表</Button>
        </Form>
      </Modal>
    </section>
  )
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
    const days = end ? Math.ceil((new Date(`${end.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000) : null
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
        setStudent((data.student as Record<string, unknown>) || null)
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
      destroyOnClose
    >
      <p className="schedule-meta">{[student?.campusName || '当前校区', summary.card, `${summary.primaryLabel} ${summary.primary}`, `${summary.secondaryLabel} ${summary.secondary}`, total ? `共${total}条上课记录` : ''].filter(Boolean).join(' · ')}</p>
      {summary.low ? <p>不足5课时</p> : null}
      {loading ? <Spin /> : null}
      {error ? <p>{error}</p> : null}
      {!loading && !error ? (
        <Table
          rowKey={(row) => String(row.id)}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: '暂无上课记录' }}
          columns={[
            { title: '日期', render: (_: unknown, row: Record<string, unknown>) => String(row.consumeDate || '').slice(0, 10) },
            { title: '课程', render: (_: unknown, row: Record<string, unknown>) => String(row.courseName || row.courseTypeLabel || '上课记录') },
            { title: '课时', dataIndex: 'hours' },
            { title: '老师', dataIndex: 'coachName' },
            { title: '方式', render: (_: unknown, row: Record<string, unknown>) => Number(row.autoCheckIn) === 1 ? '自动打卡' : '手动' },
          ]}
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? <p className="schedule-meta">{loadingMore ? '加载中...' : (hasMore ? '' : '没有更多记录了')}</p> : null}
      {hasMore ? <Button style={{ marginTop: 12 }} loading={loadingMore} onClick={() => more().catch((reason) => message.error(reason instanceof Error ? reason.message : '加载更多失败'))}>加载更多</Button> : null}
    </Modal>
  )
}

function OrgModal(props: {
  open: boolean
  phone?: string
  onClose: () => void
  onSubmit: (values: { name: string; description?: string; campusAdminManageSalary?: boolean }) => Promise<void>
}) {
  return (
    <Modal title="创建机构" open={props.open} onCancel={props.onClose} footer={null} destroyOnClose>
      <Form
        layout="vertical"
        initialValues={{ phone: props.phone, campusAdminManageSalary: false }}
        onFinish={(values) => props.onSubmit(values).catch((reason) => message.error(reason instanceof Error ? reason.message : '创建失败'))}
      >
        <Form.Item name="name" label="机构名称" rules={[{ required: true, whitespace: true, message: '请输入机构名称' }, { max: 12, message: '机构名称最多12字' }]}><Input maxLength={12} /></Form.Item>
        <Form.Item name="phone" label="联系电话"><Input disabled /></Form.Item>
        <Form.Item name="description" label="机构描述"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="campusAdminManageSalary" label="校区管理员可管理本校区工资" valuePropName="checked"><Switch /></Form.Item>
        <Button type="primary" htmlType="submit">创建</Button>
      </Form>
    </Modal>
  )
}
