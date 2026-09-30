import { Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { NeedCampus, PageHead, tell, todayIso, useShell } from './kit'

interface Timetable {
  id: number
  name: string
  campusId?: number
  description?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  timeIntervalMinutes?: number
  isWeekly?: number
  weekDays?: number[]
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
  weekendTimeIntervalMinutes?: number
  createByMemberId?: number
  status?: number
  isDefault?: number
  scheduleCount?: number
}

interface TimetableGroup {
  memberName?: string
  activeTimetables?: Timetable[]
  archivedTimetables?: Timetable[]
}

interface Schedule {
  id?: number
  timetableId?: number
  courseName?: string
  displayName?: string
  coachName?: string
  coachId?: number
  coachIds?: number[]
  dayOfWeek?: number
  scheduleDate?: string
  startTime?: string
  endTime?: string
  note?: string
  status?: number
  uiChangeStatus?: number
  targetType?: string
  targetId?: number
  pricingCourseType?: string
  pricingStudentGroupId?: number
  serviceQuantity?: number
  excludedStudentIds?: number[]
  currentStudents?: number
  studentInstances?: Array<{ studentId: number; studentName?: string; status?: number; studentCardId?: number }>
  memberCardBindings?: Array<{ studentId: number; studentCardId: number }>
  campusId?: number
}

interface CardChoice {
  id?: number
  studentGroupId?: number
  studentGroupName?: string
  cardTypeLabel?: string
  cardCategory?: string
  courseCategory?: boolean
  available?: boolean
  unavailableReason?: string
}

interface TargetOption {
  targetType: string
  targetId: number
  name: string
  displayName?: string
  typeLabel?: string
  cardCategory?: string
  courseCategory?: boolean
  pricingCourseType?: string
  pricingStudentGroupId?: number
  serviceQuantity?: number
  cardOptions?: CardChoice[]
  courseOptions?: Array<{ id?: number; name?: string; courseType?: string }>
  serviceOptions?: Array<{ id?: number; courseType?: string; name?: string; studentCardIds?: number[] }>
  selectionBlockedReason?: string
  studentCount?: number
  oneToOne?: boolean
}

interface PricingChoice {
  key: string
  label: string
  pricingStudentGroupId?: number
  pricingCourseType: string
  service: boolean
  disabled?: boolean
}

interface CourseMember {
  studentId: number
  studentName?: string
  defaultStudentCardId?: number
  cardOptions?: CardChoice[]
  cardCategory?: string
  remainingHours?: number
}

export function courseTargetWarning(option?: Pick<TargetOption, 'targetType' | 'oneToOne' | 'studentCount'> | null): string {
  if (!option || option.targetType !== 'course') return ''
  if (option.oneToOne === true) return '班级仅支持选择非一对一课程'
  const count = Number(option.studentCount)
  if (!Number.isFinite(count) || count <= 0) return '0学员班级不可选，请先添加学员'
  return ''
}

export function courseMembersWarning(members: CourseMember[], excluded: number[]): string {
  const participating = members.filter((member) => !excluded.includes(member.studentId))
  if (!participating.length) return '请移除无可扣费学员，并至少保留1名参与学员'
  const blocked = participating.some((student) => {
    const cards = student.cardOptions || []
    if (cards.length > 0) return !cards.some((card) => card.available !== false && Number(card.id || 0) > 0)
    const category = String(student.cardCategory || '').toUpperCase()
    if (category === 'PERIOD' || category === 'STORED_VALUE') return false
    const hours = Number(student.remainingHours)
    return !Number.isNaN(hours) && hours <= 0
  })
  return blocked ? '请移除无可扣费学员，并至少保留1名参与学员' : ''
}

const CARD_MARKER = '#card:'

function pricingChoices(option: TargetOption): PricingChoice[] {
  if (option.targetType !== 'student') return []
  const cards = (option.cardOptions || []).filter((card) => Number(card.id || 0) > 0)
  const source = cards.length ? cards : [{ id: 0, cardTypeLabel: '', cardCategory: option.cardCategory, courseCategory: option.courseCategory }]
  const choices: PricingChoice[] = []
  for (const card of source) {
    const before = choices.length
    const cardId = Number(card.id || 0)
    const prefix = card.cardTypeLabel || ''
    const category = String(card.cardCategory || option.cardCategory || '').toUpperCase()
    const courseCategory = card.courseCategory ?? option.courseCategory
    const withCard = (base: string) => cardId > 0 ? `${base}${CARD_MARKER}${cardId}` : base
    if (courseCategory !== false) {
      const configured = Number(card.studentGroupId || 0)
      for (const course of (option.courseOptions || []).filter((item) => !configured || Number(item.id) === configured)) {
        const base = String(course.courseType || course.id || '')
        if (!base || !course.name) continue
        choices.push({
          key: withCard(base),
          label: [prefix, course.name, card.unavailableReason].filter(Boolean).join(' · '),
          pricingStudentGroupId: Number(course.id || 0) || undefined,
          pricingCourseType: withCard(base),
          service: false,
          disabled: card.available === false,
        })
      }
    }
    for (const service of option.serviceOptions || []) {
      const allowed = (service.studentCardIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
      if (cardId > 0 && allowed.length && !allowed.includes(cardId)) continue
      const base = String(service.courseType || '')
      if (!base || !service.name) continue
      choices.push({
        key: withCard(base),
        label: [prefix, service.name, card.unavailableReason].filter(Boolean).join(' · '),
        pricingCourseType: withCard(base),
        service: true,
        disabled: card.available === false,
      })
    }
    if (cardId > 0 && choices.length === before && category !== 'STORED_VALUE') {
      choices.push({
        key: withCard('card'),
        label: [prefix, card.studentGroupName || '课时卡', card.unavailableReason].filter(Boolean).join(' · '),
        pricingCourseType: withCard('card'),
        service: false,
        disabled: card.available === false,
      })
    }
  }
  return choices
}

function cardIdFromPricing(value?: string): number | undefined {
  const marker = String(value || '').lastIndexOf(CARD_MARKER)
  if (marker < 0) return undefined
  const id = Number(value?.slice(marker + CARD_MARKER.length))
  return id > 0 ? id : undefined
}

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function slotsOf(timetable?: Timetable | null): Array<{ start: string; end: string }> {
  const start = timetable?.startTime || '08:00'
  const end = timetable?.endTime || '21:00'
  const step = timetable?.timeIntervalMinutes || 30
  const slots: Array<{ start: string; end: string }> = []
  let cursor = toMinutes(start)
  const last = toMinutes(end)
  while (cursor + step <= last) {
    slots.push({ start: fromMinutes(cursor), end: fromMinutes(cursor + step) })
    cursor += step
  }
  return slots
}

function parseTrialConfig(value: unknown): { enabled: boolean; half: boolean; hour: boolean } {
  const fallback = { enabled: true, half: true, hour: true }
  let parsed: unknown = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return fallback }
  }
  if (!parsed || typeof parsed !== 'object') return fallback
  const item = parsed as { enabled?: boolean; halfHourEnabled?: boolean; oneHourEnabled?: boolean }
  const half = item.halfHourEnabled !== false
  const hour = item.oneHourEnabled !== false
  if (item.enabled !== false && !half && !hour) return fallback
  return { enabled: item.enabled !== false, half, hour }
}

function toMinutes(value: string): number {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return hour * 60 + minute
}

function fromMinutes(value: number): string {
  return `${`${Math.floor(value / 60)}`.padStart(2, '0')}:${`${value % 60}`.padStart(2, '0')}`
}

function clockText(value?: string): string {
  return String(value || '').slice(0, 5)
}

function timetableName(value?: string): string {
  return Array.from(String(value || '').trim()).slice(0, 12).join('')
}

function timetableFormError(values: {
  name?: string
  createByMemberId?: number
  weekDays?: number[]
  startTime?: string
  endTime?: string
  isWeekly?: number
  startDate?: string
  endDate?: string
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
}, locked = false): string {
  if (!timetableName(values.name)) return '请输入课表名称'
  if (locked) return ''
  if (!values.createByMemberId) return '请选择所属人员'
  if (!(values.weekDays || []).length) return '至少选择一天'
  if (clockText(values.startTime) >= clockText(values.endTime)) return '结束时间必须晚于开始时间'
  if (Number(values.splitWeekend) === 1 && clockText(values.weekendStartTime) >= clockText(values.weekendEndTime)) return '结束时间必须晚于开始时间'
  if (Number(values.isWeekly) !== 1 && String(values.startDate || '') > String(values.endDate || '')) return '结束日期不能早于开始日期'
  return ''
}

function timetableBody(values: {
  name?: string
  createByMemberId?: number
  weekDays?: number[]
  startTime?: string
  endTime?: string
  isWeekly?: number
  startDate?: string
  endDate?: string
  splitWeekend?: number
  weekendStartTime?: string
  weekendEndTime?: string
}, campusId: number, locked = false) {
  if (locked) return { name: timetableName(values.name) }
  const weekly = Number(values.isWeekly) === 1
  const split = Number(values.splitWeekend) === 1
  return {
    name: timetableName(values.name),
    campusId,
    createByMemberId: values.createByMemberId,
    isWeekly: weekly ? 1 : 0,
    startDate: weekly ? undefined : values.startDate,
    endDate: weekly ? undefined : values.endDate,
    startTime: clockText(values.startTime),
    endTime: clockText(values.endTime),
    timeIntervalMinutes: 60,
    weekDays: values.weekDays,
    splitWeekend: split ? 1 : 0,
    weekendStartTime: split ? clockText(values.weekendStartTime) : undefined,
    weekendEndTime: split ? clockText(values.weekendEndTime) : undefined,
    weekendTimeIntervalMinutes: split ? 60 : undefined,
    status: 1,
  }
}

function lessonOverlaps(lesson: Schedule, day: number, date: string, start: string, end: string): boolean {
  const sameDay = lesson.scheduleDate ? lesson.scheduleDate === date : lesson.dayOfWeek === day
  if (!sameDay) return false
  return clockText(lesson.startTime) < end && start < clockText(lesson.endTime)
}

export function dragPlacement(
  lesson: Schedule,
  target: { day: number; date: string; start: string; end: string },
  slots: Array<{ start: string; end: string }>,
  rows: Schedule[],
): { problem: string; endTime: string; canCopy: boolean } {
  if (lesson.uiChangeStatus === 4) return { problem: '占用时段不能拖动', endTime: target.end, canCopy: false }
  const duration = toMinutes(clockText(lesson.endTime)) - toMinutes(clockText(lesson.startTime))
  const endTime = duration > 0 ? fromMinutes(toMinutes(target.start) + duration) : target.end
  if (duration <= 0) return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  const covered = slots.filter((slot) => slot.start >= target.start && slot.start < endTime)
  const last = covered[covered.length - 1]
  if (!last || last.end < endTime) return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  const sameDay = lesson.scheduleDate ? lesson.scheduleDate === target.date : lesson.dayOfWeek === target.day
  if (sameDay && clockText(lesson.startTime) === target.start) return { problem: '请拖动到空白单元格', endTime, canCopy: false }
  if (rows.some((item) => lessonOverlaps(item, target.day, target.date, target.start, covered[0].end))) {
    return { problem: '请拖动到空白单元格', endTime, canCopy: false }
  }
  if (covered.slice(1).some((slot) => rows.some((item) => lessonOverlaps(item, target.day, target.date, slot.start, slot.end)))) {
    return { problem: '目标空白时段不足，无法移动当前课时', endTime, canCopy: false }
  }
  const overlapsSelf = sameDay && clockText(lesson.startTime) < endTime && target.start < clockText(lesson.endTime)
  return { problem: '', endTime, canCopy: !overlapsSelf }
}

function mergeRanges(items: Array<{ day: number; date: string; start: string; end: string }>) {
  const grouped = new Map<string, Array<{ day: number; date: string; start: string; end: string }>>()
  items.forEach((item) => {
    const key = `${item.date}`
    grouped.set(key, [...(grouped.get(key) || []), item])
  })
  const merged: typeof items = []
  grouped.forEach((list) => {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    let current = { ...sorted[0] }
    sorted.slice(1).forEach((item) => {
      if (current.end === item.start) current = { ...current, end: item.end }
      else {
        merged.push(current)
        current = { ...item }
      }
    })
    merged.push(current)
  })
  return merged
}

export function SchedulePage() {
  const shell = useShell()
  const [params] = useSearchParams()
  const [groups, setGroups] = useState<TimetableGroup[]>([])
  const [archived, setArchived] = useState(false)
  const [current, setCurrent] = useState<Timetable | null>(null)
  const [weekStart, setWeekStart] = useState(mondayOf(todayIso()))
  const [mode, setMode] = useState<'instance' | 'template'>('instance')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [creating, setCreating] = useState(false)
  const [createSource, setCreateSource] = useState<Timetable | null>(null)
  const [editing, setEditing] = useState(false)
  const [copyDay, setCopyDay] = useState(false)
  const [cell, setCell] = useState<{ day: number; date: string; start: string; end: string; schedule?: Schedule } | null>(null)
  const [batch, setBatch] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<number[]>([])
  const [overview, setOverview] = useState<Schedule[] | null>(null)
  const [dayList, setDayList] = useState<Schedule[] | null>(null)
  const [lookup, setLookup] = useState<Schedule[] | null>(null)
  const [compare, setCompare] = useState<Schedule[]>([])
  const [dragAction, setDragAction] = useState<{
    scheduleId: number
    name: string
    sourceLabel: string
    targetLabel: string
    canCopy: boolean
    target: { scheduleDate: string; startTime: string; endTime: string; dayOfWeek: number }
  } | null>(null)
  const dragGuard = useRef(false)

  const campusId = shell.campusId
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const role = String(shell.user?.role || '').toLowerCase()
  const userId = Number(shell.user?.id || 0)
  const ownerId = Number(currentOrg?.ownerId || 0)
  const campusScope = (shell.user?.campusAdminCampusIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
  const managesCampus = role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId) || (shell.user?.campusAdmin === true && (!campusScope.length || campusScope.includes(Number(campusId || 0))))
  const canCreate = managesCampus || shell.user?.isSubstituteTeacher === true
  const timetableLocked = Number(current?.scheduleCount || 0) > 0
  const days = current?.weekDays?.length ? current.weekDays : [1, 2, 3, 4, 5, 6, 7]
  const slots = useMemo(() => slotsOf(current), [current])

  async function loadGroups(preferId?: number) {
    if (!campusId) return
    const data = await getJson<TimetableGroup[]>('/timetables/grouped', { campusId, status: archived ? 2 : 1 })
    setGroups(data || [])
    const all = (data || []).flatMap((group) => (archived ? group.archivedTimetables : group.activeTimetables) || [])
    const requested = Number(params.get('timetableId') || preferId || 0)
    setCurrent(all.find((item) => item.id === requested) || all[0] || null)
  }

  async function loadWeek(timetable = current) {
    if (!timetable) return
    const list = await getJson<Schedule[]>(`/schedules/timetable/${timetable.id}/week`, { weekStart })
    setSchedules(list || [])
  }

  useEffect(() => {
    loadGroups().catch((error) => message.error(tell(error, '课表加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, archived])

  useEffect(() => {
    loadWeek().catch((error) => message.error(tell(error, '周课表加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, weekStart])

  function lessonsAt(day: number, date: string, start: string): Schedule[] {
    return schedules.filter((item) => {
      const sameDay = item.scheduleDate ? item.scheduleDate === date : item.dayOfWeek === day
      return sameDay && String(item.startTime || '').slice(0, 5) === start
    })
  }

  async function saveCell(values: {
    courseName: string
    targetType?: string
    targetId?: number
    coachIds?: number[]
    note?: string
    studentCardId?: number
    studentId?: number
    pricingStudentGroupId?: number
    pricingCourseType?: string
    serviceQuantity?: number
    memberCardBindings?: Array<{ studentId: number; studentCardId: number }>
    excludedStudentIds?: number[]
    occupy?: boolean
  }, ranges = cell ? [cell] : []) {
    if (!current || !ranges.length) return
    const cells = ranges.map((range) => ({
      scheduleId: 'schedule' in range ? range.schedule?.id : undefined,
      timetableId: current.id,
      instanceMode: mode === 'instance' && current.isWeekly === 1,
      dayOfWeek: range.day,
      scheduleDate: mode === 'template' ? undefined : range.date,
      effectiveStartDate: mode === 'template' ? todayIso() : undefined,
      startTime: range.start,
      endTime: range.end,
      courseName: values.occupy ? '占用' : values.courseName,
      targetType: values.occupy ? undefined : values.targetType,
      targetId: values.occupy ? undefined : values.targetId,
      coachIds: values.coachIds,
      note: values.note || '',
      uiChangeStatus: values.occupy ? 4 : undefined,
      campusId,
      pricingStudentGroupId: values.occupy ? undefined : values.pricingStudentGroupId,
      pricingCourseType: values.occupy ? undefined : values.pricingCourseType,
      serviceQuantity: values.occupy ? undefined : values.serviceQuantity,
      excludedStudentIds: values.occupy ? undefined : values.excludedStudentIds,
      memberCardBindings: values.occupy ? undefined : values.memberCardBindings || (values.studentId && values.studentCardId ? [{ studentId: values.studentId, studentCardId: values.studentCardId }] : undefined),
    }))
    if (cells.length === 1) await postJson('/schedules/cell', cells[0])
    else await postJson('/schedules/cell/batch', { cells })
  }

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="课表" extra="按校区查看、新建，并在周视图里排课、请假、占用、拖动、移动和复制。">
        <Button onClick={() => setArchived((value) => !value)}>{archived ? '查看活动课表' : '查看归档课表'}</Button>
        <Button type="primary" onClick={() => {
          if (!canCreate) {
            message.warning('仅带课老师可新建课表，请联系管理员在校区老师设置中开启带课老师')
            return
          }
          setCreating(true)
        }}>创建课表</Button>
      </PageHead>
      <div className="split">
        <section className="work-card">
          {groups.map((group) => (
            <div className="timetable-group" key={group.memberName || '未分组'}>
              <div className="timetable-group-name">{group.memberName || '未分组'}</div>
              {((archived ? group.archivedTimetables : group.activeTimetables) || []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={current?.id === item.id ? 'timetable-item is-current' : 'timetable-item'}
                  onClick={() => setCurrent(item)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ))}
          {!groups.length ? <p>这个校区还没有课表。</p> : null}
        </section>
        <section className="work-card">
          {current ? (
            <>
              <div className="schedule-actions">
                <strong>{current.name}</strong>
                <Button onClick={() => setWeekStart(addDays(weekStart, -7))}>上一周</Button>
                <span>{weekStart}</span>
                <Button onClick={() => setWeekStart(addDays(weekStart, 7))}>下一周</Button>
                {current.isWeekly === 1 ? (
                  <Button onClick={() => setMode(mode === 'instance' ? 'template' : 'instance')}>{mode === 'instance' ? '正在看本周实例' : '正在看固定模板'}</Button>
                ) : null}
                <Button onClick={async () => setOverview(await getJson(`/schedules/timetable/${current.id}/week-overview`, { weekStart }))}>本周学员总览</Button>
                <Button onClick={async () => {
                  const others = groups.flatMap((group) => group.activeTimetables || []).filter((item) => item.id !== current.id).map((item) => item.id)
                  if (!others.length) {
                    setCompare([])
                    return
                  }
                  const packs = await getJson<Array<{ schedules?: Schedule[] }>>('/schedules/timetables/week', { timetableIds: others.join(','), weekStart })
                  setCompare((packs || []).flatMap((item) => item.schedules || []))
                }}>对比其他老师</Button>
                <Button onClick={() => setCopyDay(true)}>复制整天</Button>
                <Button onClick={async () => {
                  try {
                    const detail = await getJson<Timetable>(`/timetables/${current.id}`)
                    const base = detail.name || '课表'
                    const created = await postJson<Timetable>('/timetables', {
                      ...timetableBody({ ...detail, name: `${Array.from(base).slice(0, 10).join('')}副本` }, campusId || 0),
                      isDefault: 0,
                    })
                    message.success('已复制课表')
                    await loadGroups(created.id)
                  } catch (error) {
                    message.error(tell(error, '复制失败'))
                  }
                }}>复制课表</Button>
                <Button onClick={async () => {
                  setCreateSource(await getJson<Timetable>(`/timetables/${current.id}`))
                  setCreating(true)
                }}>按此课表新建</Button>
                <Button onClick={() => { setDeleting((value) => !value); setBatch([]); setDeleteIds([]) }}>{deleting ? '取消批量删除' : '批量删除'}</Button>
                <Button onClick={() => setEditing(true)}>编辑课表</Button>
                <Popconfirm title="设为默认课表？" onConfirm={async () => {
                  try {
                    await putJson(`/timetables/${current.id}/default`)
                    message.success('已设为默认')
                    await loadGroups(current.id)
                  } catch (error) {
                    message.error(tell(error, '设置失败'))
                  }
                }}>
                  <Button>设为默认</Button>
                </Popconfirm>
                <Popconfirm title={archived ? '恢复这张课表？' : '归档这张课表？'} onConfirm={async () => {
                  try {
                    await putJson(`/timetables/${current.id}/${archived ? 'unarchive' : 'archive'}`)
                    message.success(archived ? '已恢复' : '已归档')
                    await loadGroups()
                  } catch (error) {
                    message.error(tell(error, archived ? '恢复失败' : '归档失败'))
                  }
                }}>
                  <Button>{archived ? '恢复' : '归档'}</Button>
                </Popconfirm>
                <Popconfirm title="删除这张课表？" onConfirm={async () => {
                  try {
                    await delJson(`/timetables/${current.id}`)
                    message.success('已删除')
                    await loadGroups()
                  } catch (error) {
                    message.error(tell(error, '删除失败'))
                  }
                }}>
                  <Button danger>删除</Button>
                </Popconfirm>
              </div>
              <div className="work-toolbar" style={{ marginTop: 12 }}>
                <Input.Search placeholder="按学员查看本周和全部排课" onSearch={async (value) => {
                  if (!value) return
                  const page = await getJson<{ records: Array<{ id: number; name: string }> }>('/students/page', { campusId, name: value, page: 1, pageSize: 5 })
                  const student = page.records?.[0]
                  if (!student) {
                    message.info('没有找到学员')
                    return
                  }
                  const all = await getJson<Schedule[]>(`/schedules/student/${student.id}`)
                  const weekEnd = addDays(weekStart, 6)
                  const week = (all || []).filter((item) => item.scheduleDate ? item.scheduleDate >= weekStart && item.scheduleDate <= weekEnd : true)
                  setLookup([...(week || []).map((item) => ({ ...item, note: '本周' })), ...(all || []).map((item) => ({ ...item, note: '全部' }))])
                }} />
                <Input.Search placeholder="按课程名查看本周和全部排课" onSearch={async (value) => {
                  if (!value) return
                  const week = await getJson<Schedule[]>(`/schedules/timetable/${current.id}/by-name`, { courseName: value, weekStart })
                  const all = await getJson<Schedule[]>(`/schedules/timetable/${current.id}/by-name`, { courseName: value })
                  setLookup([...(week || []).map((item) => ({ ...item, note: item.note || '本周' })), ...(all || [])])
                }} />
              </div>
              <div className="week-board">
                <div className="week-grid" style={{ ['--days' as string]: days.length }}>
                  <div className="week-head" />
                  {days.map((day) => (
                    <div className="week-head" key={day}>
                      <button onClick={() => {
                        const date = addDays(weekStart, day - 1)
                        const own = schedules.filter((item) => (item.scheduleDate ? item.scheduleDate === date : item.dayOfWeek === day))
                        const others = compare
                          .filter((item) => item.scheduleDate === date || item.dayOfWeek === day)
                          .map((item) => ({ ...item, note: item.uiChangeStatus === 3 ? '其他老师请假' : '其他老师' }))
                        setDayList([...own, ...others])
                      }}>
                        周{DAY_LABELS[day - 1]} {addDays(weekStart, day - 1).slice(5)}
                      </button>
                    </div>
                  ))}
                  {slots.map((slot) => (
                    <>
                      <div className="week-time" key={slot.start}>{slot.start}</div>
                      {days.map((day) => {
                        const date = addDays(weekStart, day - 1)
                        const key = `${date} ${slot.start}`
                        const lessons = lessonsAt(day, date, slot.start)
                        const compared = compare.filter((item) => String(item.startTime || '').slice(0, 5) === slot.start && (item.scheduleDate === date || item.dayOfWeek === day))
                        return (
                          <div
                            className="week-cell"
                            key={key}
                            onDragOver={(event) => {
                              if (archived || Number(current.status) === 2) return
                              event.preventDefault()
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              dragGuard.current = true
                              window.setTimeout(() => { dragGuard.current = false }, 0)
                              if (archived || Number(current.status) === 2) {
                                message.warning('归档课表不能修改排课')
                                return
                              }
                              const id = Number(event.dataTransfer.getData('text/plain') || 0)
                              const lesson = schedules.find((item) => item.id === id)
                              if (!lesson?.id) return
                              const placement = dragPlacement(lesson, { day, date, start: slot.start, end: slot.end }, slots, schedules)
                              if (placement.problem) {
                                message.warning(placement.problem)
                                return
                              }
                              setDragAction({
                                scheduleId: lesson.id,
                                name: lesson.displayName || lesson.courseName || '该排课',
                                sourceLabel: `周${DAY_LABELS[(lesson.dayOfWeek || day) - 1] || ''} ${clockText(lesson.startTime)}-${clockText(lesson.endTime)}`,
                                targetLabel: `周${DAY_LABELS[day - 1]} ${slot.start}-${placement.endTime}`,
                                canCopy: placement.canCopy,
                                target: { scheduleDate: date, startTime: slot.start, endTime: placement.endTime, dayOfWeek: day },
                              })
                            }}
                          >
                            <Checkbox
                              disabled={deleting && lessons.length === 0}
                              checked={deleting ? lessons.some((lesson) => lesson.id != null && deleteIds.includes(lesson.id)) : batch.includes(key)}
                              onChange={(event) => {
                                if (deleting) {
                                  const ids = lessons.map((lesson) => lesson.id).filter((id): id is number => id != null)
                                  setDeleteIds(event.target.checked ? Array.from(new Set([...deleteIds, ...ids])) : deleteIds.filter((id) => !ids.includes(id)))
                                  return
                                }
                                setBatch(event.target.checked ? [...batch, key] : batch.filter((item) => item !== key))
                              }}
                            />
                            <button onClick={() => {
                              if (dragGuard.current) return
                              if (archived || Number(current.status) === 2) {
                                message.warning('归档课表不能修改排课')
                                return
                              }
                              setCell({ day, date, start: slot.start, end: slot.end, schedule: lessons[0] })
                            }}>
                              {lessons.map((lesson) => (
                                <div
                                  key={lesson.id}
                                  className={`week-lesson${lesson.uiChangeStatus === 3 ? ' is-leave' : ''}${lesson.uiChangeStatus === 4 ? ' is-occupy' : ''}`}
                                  draggable={!archived && Number(current.status) !== 2 && lesson.uiChangeStatus !== 4}
                                  onDragStart={(event) => {
                                    if (lesson.uiChangeStatus === 4) {
                                      event.preventDefault()
                                      return
                                    }
                                    dragGuard.current = true
                                    event.dataTransfer.setData('text/plain', String(lesson.id))
                                    event.dataTransfer.effectAllowed = 'copyMove'
                                  }}
                                  onDragEnd={() => {
                                    window.setTimeout(() => { dragGuard.current = false }, 0)
                                  }}
                                >
                                  <b>{lesson.displayName || lesson.courseName}</b>
                                  <small>{lesson.coachName} {lesson.note}</small>
                                </div>
                              ))}
                              {compared.map((lesson) => (
                                <div key={`c-${lesson.id}`} className={`week-lesson${lesson.uiChangeStatus === 3 ? ' is-cancelled-compare' : ' is-other-compare'}`}>
                                  {lesson.uiChangeStatus === 3 ? '已请假' : lesson.uiChangeStatus === 4 ? '占用' : '其他老师'} {lesson.courseName}
                                  <small>{lesson.coachName}</small>
                                </div>
                              ))}
                            </button>
                          </div>
                        )
                      })}
                    </>
                  ))}
                </div>
              </div>
              {deleting && deleteIds.length ? (
                <Popconfirm title={`确认删除已选择的 ${deleteIds.length} 节课吗？`} onConfirm={async () => {
                  try {
                    for (const id of deleteIds) await delJson(`/schedules/${id}`)
                    message.success(`已删除 ${deleteIds.length} 节课`)
                    setDeleteIds([])
                    setDeleting(false)
                    await loadWeek()
                  } catch (error) {
                    message.error(tell(error, '批量删除失败'))
                  }
                }}>
                  <Button danger style={{ marginTop: 12 }}>删除已选 {deleteIds.length} 节</Button>
                </Popconfirm>
              ) : null}
              {!deleting && batch.length ? (
                <Button style={{ marginTop: 12 }} onClick={() => {
                  const occupied = batch.some((item) => {
                    const [date, start] = item.split(' ')
                    const day = days.find((value) => addDays(weekStart, value - 1) === date) || 1
                    return lessonsAt(day, date, start).length > 0
                  })
                  if (occupied) {
                    message.warning('批量排课时请选择空白时间段')
                    return
                  }
                  const ranges = mergeRanges(batch.map((item) => {
                    const [date, start] = item.split(' ')
                    const day = days.find((value) => addDays(weekStart, value - 1) === date) || 1
                    const slot = slots.find((value) => value.start === start)
                    return { day, date, start, end: slot?.end || start }
                  }))
                  setCell({ ...ranges[0], schedule: undefined })
                  setBatch(ranges.map((item) => `${item.date} ${item.start}`))
                  message.info(`连续时段已合并成 ${ranges.length} 段，确认后一次排课`)
                }}>批量排课</Button>
              ) : null}
            </>
          ) : <p>请选择一张课表。</p>}
        </section>
      </div>
      <CreateTimetable
        open={creating}
        campusId={campusId || 0}
        manager={managesCampus}
        selfMemberId={Number(shell.user?.orgMemberId || 0)}
        source={createSource}
        onClose={() => { setCreating(false); setCreateSource(null) }}
        onSaved={(id) => { setCreating(false); setCreateSource(null); loadGroups(id).catch(() => undefined) }}
      />
      <Modal title="编辑课表" open={editing} onCancel={() => setEditing(false)} footer={null} destroyOnClose>
        {current ? (
          <Form
            layout="vertical"
            initialValues={current}
            onFinish={async (values) => {
              const problem = timetableFormError({ ...current, ...values }, timetableLocked)
              if (problem) {
                message.warning(problem)
                return
              }
              try {
                await putJson(`/timetables/${current.id}`, timetableBody({ ...current, ...values }, campusId || 0, timetableLocked))
                message.success('修改成功')
                setEditing(false)
                await loadGroups(current.id)
              } catch (error) {
                message.error(tell(error, '修改失败'))
              }
            }}
          >
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入课表名称' }]}><Input maxLength={12} /></Form.Item>
            {timetableLocked ? <p>这张课表已有排课，只能修改名称。</p> : (
              <>
                <Form.Item name="startTime" label="开始时间"><Input type="time" /></Form.Item>
                <Form.Item name="endTime" label="结束时间"><Input type="time" /></Form.Item>
                <Form.Item name="weekDays" label="上课日"><Select mode="multiple" options={DAY_LABELS.map((label, index) => ({ value: index + 1, label: `周${label}` }))} /></Form.Item>
                <WeekendFields />
              </>
            )}
            <Button type="primary" htmlType="submit">保存</Button>
          </Form>
        ) : null}
      </Modal>
      <Modal title="复制整天课程" open={copyDay} onCancel={() => setCopyDay(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ sourceDate: weekStart, targetDate: addDays(weekStart, 1) }}
          onFinish={async (values: { sourceDate: string; targetDate: string }) => {
            const scheduleIds = schedules.filter((item) => item.scheduleDate === values.sourceDate).map((item) => item.id)
            if (!scheduleIds.length) {
              message.info('这一天没有可复制的排课')
              return
            }
            await postJson(`/schedules/timetable/${current?.id}/copy-day`, { scheduleIds, targetDate: values.targetDate })
            message.success('已复制整天课程')
            setCopyDay(false)
            await loadWeek()
          }}
        >
          <Form.Item name="sourceDate" label="来源日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="targetDate" label="目标日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Button type="primary" htmlType="submit">复制</Button>
        </Form>
      </Modal>
      <CellDialog
        cell={cell}
        campusId={campusId || 0}
        allowTrial={mode === 'instance'}
        batchCount={batch.length}
        onClose={() => setCell(null)}
        onSave={async (values) => {
          const ranges = batch.length > 1
            ? mergeRanges(batch.map((item) => {
              const [date, start] = item.split(' ')
              const day = days.find((value) => addDays(weekStart, value - 1) === date) || 1
              const slot = slots.find((value) => value.start === start)
              return { day, date, start, end: slot?.end || start }
            }))
            : cell ? [{ day: cell.day, date: cell.date, start: values.startTime || cell.start, end: values.endTime || cell.end, schedule: cell.schedule }] : []
          const problem = clockText(values.startTime) && clockText(values.endTime) && clockText(values.startTime) >= clockText(values.endTime)
            ? '结束时间必须晚于开始时间'
            : ''
          if (problem) {
            message.warning(problem)
            return
          }
          await saveCell(values, ranges)
          message.success('排课已保存')
          setCell(null)
          setBatch([])
          await loadWeek()
        }}
        onLeave={async (reason) => {
          if (!cell?.schedule?.id) return
          await postJson(`/schedules/${cell.schedule.id}/leave`, { reason })
          message.success('已请假')
          setCell(null)
          await loadWeek()
        }}
        onRestore={async () => {
          if (!cell?.schedule?.id) return
          await postJson(`/schedules/${cell.schedule.id}/restore`)
          message.success('已恢复上课')
          setCell(null)
          await loadWeek()
        }}
        onDelete={async () => {
          if (!cell?.schedule?.id) return
          await delJson(`/schedules/${cell.schedule.id}`)
          message.success('课段已取消')
          setCell(null)
          await loadWeek()
        }}
        onMove={async (target) => {
          if (!cell?.schedule?.id) return
          if (clockText(target.startTime) >= clockText(target.endTime)) {
            message.warning('结束时间必须晚于开始时间')
            return
          }
          if (lessonsAt(target.dayOfWeek, target.scheduleDate, clockText(target.startTime)).some((item) => item.id !== cell.schedule?.id)) {
            message.warning('移动时请选择空白单元格')
            return
          }
          await postJson(`/schedules/${cell.schedule.id}/move`, target)
          message.success('已移动')
          setCell(null)
          await loadWeek()
        }}
        onCopy={async (target) => {
          if (!cell?.schedule?.id) return
          if (clockText(target.startTime) >= clockText(target.endTime)) {
            message.warning('结束时间必须晚于开始时间')
            return
          }
          if (lessonsAt(target.dayOfWeek, target.scheduleDate, clockText(target.startTime)).length) {
            message.warning('复制时请选择空白单元格')
            return
          }
          await postJson(`/schedules/${cell.schedule.id}/copy`, { targets: [target] })
          message.success('已复制')
          setCell(null)
          await loadWeek()
        }}
        onStudent={async (action, studentId) => {
          if (!cell?.schedule?.id) return
          if (action === 'add') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}`)
          if (action === 'remove') await delJson(`/schedules/${cell.schedule.id}/students/${studentId}`)
          if (action === 'leave') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}/leave`, {})
          if (action === 'restore') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}/restore`)
          await loadWeek()
          const fresh = (await getJson<Schedule[]>(`/schedules/timetable/${current?.id}/week`, { weekStart })).find((item) => item.id === cell.schedule?.id)
          setCell({ ...cell, schedule: fresh })
        }}
      />
      <Modal title="移动或复制" open={!!dragAction} onCancel={() => setDragAction(null)} footer={null} destroyOnClose>
        {dragAction ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <strong>{dragAction.name}</strong>
            <span>{dragAction.sourceLabel} → {dragAction.targetLabel}</span>
            <Space>
              <Button type="primary" onClick={async () => {
                try {
                  await postJson(`/schedules/${dragAction.scheduleId}/move`, dragAction.target)
                  message.success(`已移动到${dragAction.targetLabel}`)
                  setDragAction(null)
                  await loadWeek()
                } catch (error) {
                  message.error(tell(error, '移动失败'))
                }
              }}>移动</Button>
              <Button onClick={async () => {
                if (!dragAction.canCopy) {
                  message.warning('当前位置不能复制')
                  return
                }
                try {
                  await postJson(`/schedules/${dragAction.scheduleId}/copy`, { targets: [dragAction.target] })
                  message.success(`已复制到${dragAction.targetLabel}`)
                  setDragAction(null)
                  await loadWeek()
                } catch (error) {
                  message.error(tell(error, '复制失败'))
                }
              }}>复制</Button>
            </Space>
          </Space>
        ) : null}
      </Modal>
      <Modal title="本周学员总览" open={!!overview} onCancel={() => setOverview(null)} footer={null} width={760}>
        <Tabs items={[
          {
            key: 'date',
            label: '按日期',
            children: (
              <Table rowKey={(row) => String(row.id)} dataSource={overview || []} pagination={false} columns={[
                { title: '日期', dataIndex: 'scheduleDate' },
                { title: '时间', render: (_: unknown, row: Schedule) => `${String(row.startTime || '').slice(0, 5)} ${String(row.endTime || '').slice(0, 5)}` },
                { title: '课程', render: (_: unknown, row: Schedule) => row.displayName || row.courseName },
                { title: '学员', render: (_: unknown, row: Schedule) => (row.studentInstances || []).map((item) => item.studentName).filter(Boolean).join('、') },
                { title: '人数', dataIndex: 'currentStudents' },
              ]} />
            ),
          },
          {
            key: 'student',
            label: '按学员',
            children: (
              <Table rowKey="name" dataSource={groupOverviewByStudent(overview || [])} pagination={false} columns={[
                { title: '学员', dataIndex: 'name' },
                { title: '节数', dataIndex: 'count' },
                { title: '安排', dataIndex: 'times' },
              ]} />
            ),
          },
        ]} />
      </Modal>
      <Modal title="当日课程" open={!!dayList} onCancel={() => setDayList(null)} footer={null}>
        {(dayList || []).map((item, index) => <p key={`${item.id}-${index}`}>{item.startTime} {item.displayName || item.courseName} {item.coachName} {item.note || (item.uiChangeStatus === 3 ? '请假' : '')}</p>)}
        {!dayList?.length ? <p>这一天没有课程。</p> : null}
      </Modal>
      <Modal title="课程排课" open={!!lookup} onCancel={() => setLookup(null)} footer={null} width={720}>
        {(lookup || []).map((item, index) => <p key={`${item.id}-${index}`}>{item.scheduleDate || `周${item.dayOfWeek}`} {item.startTime} {item.displayName || item.courseName}</p>)}
      </Modal>
    </NeedCampus>
  )
}

function groupOverviewByStudent(rows: Schedule[]): Array<{ name: string; count: number; times: string }> {
  const map = new Map<string, { name: string; count: number; times: string }>()
  for (const row of rows) {
    const names = (row.studentInstances || []).map((item) => item.studentName).filter((name): name is string => !!name)
    const keys = names.length ? names : [row.displayName || row.courseName || '未命名']
    const time = `${row.scheduleDate || (row.dayOfWeek ? `周${row.dayOfWeek}` : '')} ${String(row.startTime || '').slice(0, 5)} ${row.courseName || ''}`.trim()
    for (const name of keys) {
      const current = map.get(name) || { name, count: 0, times: '' }
      current.count += 1
      current.times = current.times ? `${current.times}；${time}` : time
      map.set(name, current)
    }
  }
  return Array.from(map.values())
}

function WeekendFields() {
  const split = Form.useWatch('splitWeekend')
  return (
    <>
      <Form.Item name="splitWeekend" label="周末单独时间" valuePropName="checked" getValueFromEvent={(checked) => checked ? 1 : 0} getValueProps={(value) => ({ checked: Number(value) === 1 })}>
        <Switch />
      </Form.Item>
      {Number(split) === 1 ? (
        <>
          <Form.Item name="weekendStartTime" label="周末开始"><Input type="time" /></Form.Item>
          <Form.Item name="weekendEndTime" label="周末结束"><Input type="time" /></Form.Item>
        </>
      ) : null}
    </>
  )
}

function CreateTimetable(props: { open: boolean; campusId: number; manager: boolean; selfMemberId: number; source?: Timetable | null; onClose: () => void; onSaved: (id: number) => void }) {
  const [members, setMembers] = useState<Array<{ id: number; displayName?: string; nickname?: string; phone?: string; activeCount: number }>>([])
  useEffect(() => {
    if (!props.open || !props.campusId) return
    Promise.all([
      getJson<Array<{ id: number; displayName?: string; nickname?: string; phone?: string }>>(`/campus-teacher/campus/${props.campusId}`, { onlySubstitute: true }),
      getJson<Timetable[]>('/timetables/list'),
    ]).then(([teachers, tables]) => {
      const counts = new Map<number, number>()
      ;(tables || []).forEach((item) => {
        if (Number(item.status ?? 1) === 2 || !item.createByMemberId) return
        counts.set(item.createByMemberId, (counts.get(item.createByMemberId) || 0) + 1)
      })
      const rows = (teachers || []).map((item) => ({ ...item, activeCount: counts.get(item.id) || 0 }))
      setMembers(props.manager ? rows : rows.filter((item) => item.id === props.selfMemberId))
    }).catch(() => setMembers([]))
  }, [props.open, props.campusId, props.manager, props.selfMemberId])
  return (
    <Modal title="创建课表" open={props.open} onCancel={props.onClose} footer={null} destroyOnClose>
      <Form
        layout="vertical"
        initialValues={{
          isWeekly: props.source?.isWeekly ?? 1,
          startTime: clockText(props.source?.startTime) || '08:00',
          endTime: clockText(props.source?.endTime) || '21:00',
          weekDays: props.source?.weekDays || [1, 2, 3, 4, 5, 6, 7],
          startDate: props.source?.startDate,
          endDate: props.source?.endDate,
          createByMemberId: props.manager ? props.source?.createByMemberId : props.selfMemberId,
          splitWeekend: props.source?.splitWeekend || 0,
          weekendStartTime: props.source?.weekendStartTime,
          weekendEndTime: props.source?.weekendEndTime,
        }}
        onFinish={async (values) => {
          const problem = timetableFormError(values)
          if (problem) {
            message.warning(problem)
            return
          }
          const member = members.find((item) => item.id === values.createByMemberId)
          if (member && member.activeCount >= 2) {
            message.warning('每人最多保留2张非归档课表，请先归档后再新增')
            return
          }
          try {
            const created = await postJson<Timetable>('/timetables', timetableBody(values, props.campusId))
            message.success('创建成功')
            props.onSaved(created.id)
          } catch (error) {
            message.error(tell(error, '创建失败'))
          }
        }}
      >
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入课表名称' }]}><Input maxLength={12} /></Form.Item>
        <Form.Item name="createByMemberId" label="所属人员" rules={[{ required: true, message: '请选择所属人员' }]}>
          <Select
            disabled={!props.manager}
            options={members.map((item) => ({
              value: item.id,
              disabled: item.activeCount >= 2,
              label: `${item.displayName || item.nickname || item.phone}${item.activeCount >= 2 ? '（每人最多保留2张非归档课表，请先归档后再新增）' : ''}`,
            }))}
          />
        </Form.Item>
        {!members.length ? <p>当前校区暂无带课老师</p> : null}
        <Form.Item name="isWeekly" label="类型"><Select options={[{ value: 1, label: '周固定' }, { value: 0, label: '日期范围' }]} /></Form.Item>
        <TimetableDateFields />
        <Form.Item name="weekDays" label="上课日"><Select mode="multiple" options={DAY_LABELS.map((label, index) => ({ value: index + 1, label: `周${label}` }))} /></Form.Item>
        <Form.Item name="startTime" label="开始时间"><Input type="time" /></Form.Item>
        <Form.Item name="endTime" label="结束时间"><Input type="time" /></Form.Item>
        <p>排课粒度固定为 1 小时。</p>
        <WeekendFields />
        <Button type="primary" htmlType="submit">创建</Button>
      </Form>
    </Modal>
  )
}

function TimetableDateFields() {
  const weekly = Form.useWatch('isWeekly')
  if (Number(weekly ?? 1) === 1) return null
  return (
    <>
      <Form.Item name="startDate" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}><Input type="date" /></Form.Item>
      <Form.Item name="endDate" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}><Input type="date" /></Form.Item>
    </>
  )
}

function CellDialog(props: {
  cell: { day: number; date: string; start: string; end: string; schedule?: Schedule } | null
  campusId: number
  allowTrial: boolean
  batchCount: number
  onClose: () => void
  onSave: (values: { courseName: string; targetType?: string; targetId?: number; coachIds?: number[]; note?: string; studentCardId?: number; studentId?: number; pricingStudentGroupId?: number; pricingCourseType?: string; serviceQuantity?: number; memberCardBindings?: Array<{ studentId: number; studentCardId: number }>; excludedStudentIds?: number[]; occupy?: boolean; startTime?: string; endTime?: string }) => Promise<void>
  onLeave: (reason?: string) => Promise<void>
  onRestore: () => Promise<void>
  onDelete: () => Promise<void>
  onMove: (target: { scheduleDate: string; startTime: string; endTime: string; dayOfWeek: number }) => Promise<void>
  onCopy: (target: { scheduleDate: string; startTime: string; endTime: string; dayOfWeek: number }) => Promise<void>
  onStudent: (action: 'add' | 'remove' | 'leave' | 'restore', studentId: number) => Promise<void>
}) {
  const [options, setOptions] = useState<TargetOption[]>([])
  const [coaches, setCoaches] = useState<Array<{ id: number; displayName?: string; nickname?: string }>>([])
  const [target, setTarget] = useState<string>('')
  const [pricingKey, setPricingKey] = useState('')
  const [serviceQuantity, setServiceQuantity] = useState(1)
  const [members, setMembers] = useState<CourseMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [excluded, setExcluded] = useState<number[]>([])
  const [memberCards, setMemberCards] = useState<Record<number, number>>({})
  const [trialConfig, setTrialConfig] = useState({ enabled: true, half: true, hour: true })
  const [trialDuration, setTrialDuration] = useState<'half' | 'hour'>('hour')
  const [halfPosition, setHalfPosition] = useState<'first' | 'second'>('first')
  const [form] = Form.useForm()
  const cell = props.cell
  useEffect(() => {
    if (!cell) return
    const duration = toMinutes(cell.end) - toMinutes(cell.start)
    getJson<TargetOption[]>('/schedules/cell-target-options', { campusId: props.campusId, scheduleId: cell.schedule?.id, durationMinutes: duration })
      .then((list) => {
        setOptions(list || [])
        const schedule = cell.schedule
        if (schedule?.targetType && schedule.targetId) setTarget(`${schedule.targetType}:${schedule.targetId}`)
        if (schedule?.targetType === 'preset') setTrialDuration(toMinutes(cell.end) - toMinutes(cell.start) <= 30 ? 'half' : 'hour')
      })
      .catch(() => setOptions([]))
    getJson<typeof coaches>(`/campus-teacher/campus/${props.campusId}`).then(setCoaches).catch(() => setCoaches([]))
    getJson<Record<string, unknown>>(`/campus-staff/${props.campusId}/settings`)
      .then((data) => setTrialConfig(parseTrialConfig(data?.trialLessonConfig)))
      .catch(() => setTrialConfig({ enabled: true, half: true, hour: true }))
  }, [cell, props.campusId])
  const selected = options.find((item) => `${item.targetType}:${item.targetId}` === target)
  const choices = selected ? pricingChoices(selected) : []
  useEffect(() => {
    if (!selected) {
      setPricingKey('')
      setMembers([])
      return
    }
    const nextChoices = pricingChoices(selected)
    const current = cell?.schedule?.pricingCourseType
    const match = nextChoices.find((item) => item.pricingCourseType === current) || nextChoices.find((item) => !item.disabled) || nextChoices[0]
    setPricingKey(match?.key || '')
    setServiceQuantity(cell?.schedule?.serviceQuantity || 1)
    if (selected.targetType !== 'course') {
      setMembers([])
      setExcluded([])
      setMembersLoaded(false)
      return
    }
    let active = true
    setMembersLoaded(false)
    getJson<{ memberHoursDetails?: CourseMember[] }>(`/student-groups/${selected.targetId}`)
      .then((group) => {
        if (!active) return
        const rows = group?.memberHoursDetails || []
        setMembers(rows)
        setExcluded(cell?.schedule?.excludedStudentIds || [])
        setMemberCards(Object.fromEntries(rows.map((row) => [row.studentId, Number(row.defaultStudentCardId || row.cardOptions?.find((card) => card.available !== false)?.id || 0)])))
        setMembersLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setMembers([])
        setMembersLoaded(false)
      })
    return () => { active = false }
  }, [selected?.targetType, selected?.targetId])
  if (!cell) return null
  const pricing = choices.find((item) => item.key === pricingKey)
  const slotMinutes = toMinutes(cell.end) - toMinutes(cell.start)
  const trialOn = props.allowTrial && selected?.targetType === 'preset' && trialConfig.enabled
  const hourFits = slotMinutes >= 60
  function applyTrial(duration: 'half' | 'hour', position: 'first' | 'second') {
    const start = toMinutes(cell!.start)
    if (duration === 'hour' && hourFits) {
      form.setFieldsValue({ startTime: cell!.start.slice(0, 5), endTime: fromMinutes(start + 60) })
      return
    }
    if (position === 'second' && hourFits) {
      form.setFieldsValue({ startTime: fromMinutes(start + 30), endTime: fromMinutes(Math.min(toMinutes(cell!.end), start + 60)) })
      return
    }
    form.setFieldsValue({ startTime: cell!.start.slice(0, 5), endTime: fromMinutes(start + Math.min(30, slotMinutes)) })
  }
  return (
    <Modal title={`${cell.date} ${cell.start}-${cell.end}${props.batchCount > 1 ? ` · 批量 ${props.batchCount} 段` : ''}`} open onCancel={props.onClose} footer={null} destroyOnClose width={680}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          courseName: cell.schedule?.courseName || '',
          note: cell.schedule?.note || '',
          coachIds: cell.schedule?.coachIds || (cell.schedule?.coachId ? [cell.schedule.coachId] : []),
          startTime: cell.start,
          endTime: cell.end,
        }}
        onFinish={(values) => {
          const courseWarning = courseTargetWarning(selected)
          if (courseWarning) {
            message.warning(courseWarning)
            return
          }
          if (selected?.targetType === 'course' && membersLoaded) {
            const memberWarning = courseMembersWarning(members, excluded)
            if (memberWarning) {
              message.warning(memberWarning)
              return
            }
          }
          if (selected?.selectionBlockedReason) {
            message.warning(selected.selectionBlockedReason)
            return
          }
          if (pricing?.disabled) {
            message.warning('该课程已取消，请另选课程')
            return
          }
          if (clockText(values.startTime) >= clockText(values.endTime)) {
            message.warning('结束时间必须晚于开始时间')
            return
          }
          const studentId = selected?.targetType === 'student' ? selected.targetId : undefined
          const studentCardId = cardIdFromPricing(pricing?.pricingCourseType)
          const bindings = selected?.targetType === 'course'
            ? members
              .filter((member) => !excluded.includes(member.studentId) && memberCards[member.studentId] > 0)
              .map((member) => ({ studentId: member.studentId, studentCardId: memberCards[member.studentId] }))
            : undefined
          return props.onSave({
            ...values,
            targetType: selected?.targetType,
            targetId: selected?.targetId,
            studentId,
            studentCardId,
            pricingStudentGroupId: pricing?.pricingStudentGroupId,
            pricingCourseType: pricing?.pricingCourseType,
            serviceQuantity: pricing?.service ? serviceQuantity : undefined,
            memberCardBindings: bindings,
            excludedStudentIds: selected?.targetType === 'course' ? excluded : undefined,
          }).catch((error) => message.error(tell(error, '保存失败')))
        }}
      >
        <Form.Item name="courseName" label="课程名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="班级、学员或预设">
          <Select
            allowClear
            value={target || undefined}
            onChange={(value) => {
              const option = options.find((item) => `${item.targetType}:${item.targetId}` === value)
              const courseWarning = courseTargetWarning(option)
              if (courseWarning) {
                message.warning(courseWarning)
                return
              }
              setTarget(value)
              if (option?.targetType !== 'preset') return
              if (!form.getFieldValue('courseName')) form.setFieldsValue({ courseName: option.displayName || option.name })
              const duration = trialConfig.hour && hourFits ? 'hour' : 'half'
              setTrialDuration(duration)
              setHalfPosition('first')
              if (props.allowTrial && trialConfig.enabled) applyTrial(duration, 'first')
            }}
            options={options.map((item) => {
              const courseWarning = courseTargetWarning(item)
              const reason = item.selectionBlockedReason || courseWarning
              return { value: `${item.targetType}:${item.targetId}`, label: `${item.typeLabel || item.targetType} · ${item.displayName || item.name}${reason ? `（${reason}）` : ''}` }
            })}
          />
        </Form.Item>
        {choices.length ? (
          <Form.Item label="扣费课程或服务">
            <Select
              value={pricingKey || undefined}
              onChange={setPricingKey}
              options={choices.map((item) => ({ value: item.key, disabled: item.disabled, label: item.label }))}
            />
          </Form.Item>
        ) : null}
        {pricing?.service ? (
          <Form.Item label="服务次数">
            <InputNumber min={1} value={serviceQuantity} onChange={(value) => setServiceQuantity(Number(value || 1))} />
          </Form.Item>
        ) : null}
        {selected?.targetType === 'course' && members.length ? (
          <Form.Item label="本次上课学员">
            <Space direction="vertical" style={{ width: '100%' }}>
              {members.map((member) => (
                <Space key={member.studentId} wrap>
                  <Checkbox
                    checked={!excluded.includes(member.studentId)}
                    onChange={(event) => {
                      const onLeave = (cell.schedule?.studentInstances || []).some((student) => student.studentId === member.studentId && Number(student.status) === 3)
                      if (onLeave) {
                        message.warning('请先销假，再调整本次参与状态')
                        return
                      }
                      setExcluded(event.target.checked ? excluded.filter((id) => id !== member.studentId) : [...excluded, member.studentId])
                    }}
                  >
                    {member.studentName}
                  </Checkbox>
                  {(member.cardOptions || []).length > 1 ? (
                    <Select
                      style={{ width: 220 }}
                      value={memberCards[member.studentId] || undefined}
                      onChange={(value) => setMemberCards({ ...memberCards, [member.studentId]: value })}
                      options={(member.cardOptions || []).map((card) => ({ value: card.id, disabled: card.available === false, label: `${card.cardTypeLabel || card.studentGroupName || '课时卡'} ${card.unavailableReason || ''}` }))}
                    />
                  ) : null}
                </Space>
              ))}
            </Space>
          </Form.Item>
        ) : null}
        {trialOn ? (
          <Form.Item label="体验时长">
            <Space direction="vertical">
              <Space wrap>
                {trialConfig.half ? <Button type={trialDuration === 'half' ? 'primary' : 'default'} onClick={() => { setTrialDuration('half'); applyTrial('half', halfPosition) }}>半小时</Button> : null}
                {trialConfig.hour ? <Button type={trialDuration === 'hour' ? 'primary' : 'default'} disabled={!hourFits} onClick={() => { setTrialDuration('hour'); setHalfPosition('first'); applyTrial('hour', 'first') }}>一个小时</Button> : null}
              </Space>
              {trialDuration === 'half' && hourFits ? (
                <Space>
                  <Button type={halfPosition === 'first' ? 'primary' : 'default'} onClick={() => { setHalfPosition('first'); applyTrial('half', 'first') }}>{cell.start.slice(0, 5)}–{fromMinutes(toMinutes(cell.start) + 30)}</Button>
                  <Button type={halfPosition === 'second' ? 'primary' : 'default'} onClick={() => { setHalfPosition('second'); applyTrial('half', 'second') }}>{fromMinutes(toMinutes(cell.start) + 30)}–{fromMinutes(Math.min(toMinutes(cell.end), toMinutes(cell.start) + 60))}</Button>
                </Space>
              ) : null}
            </Space>
          </Form.Item>
        ) : null}
        <Form.Item name="coachIds" label="本次授课老师"><Select mode="multiple" options={coaches.map((item) => ({ value: item.id, label: item.displayName || item.nickname }))} /></Form.Item>
        <Form.Item name="note" label="试听备注"><Input.TextArea rows={2} /></Form.Item>
        <Space>
          <Form.Item name="startTime" label="开始"><Input type="time" /></Form.Item>
          <Form.Item name="endTime" label="结束"><Input type="time" /></Form.Item>
        </Space>
        <Space wrap>
          <Button type="primary" htmlType="submit">保存排课</Button>
          <Button onClick={() => {
            if (cell.schedule?.id) {
              message.warning('该时段已被占用')
              return
            }
            props.onSave({ courseName: '占用', occupy: true }).catch((error) => message.error(tell(error, '占用失败')))
          }}>占用时段</Button>
        </Space>
      </Form>
      {cell.schedule?.id ? (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <strong>班级学员</strong>
          {(cell.schedule.studentInstances || []).map((student) => (
            <Space key={student.studentId}>
              <span>{student.studentName} {Number(student.status) === 3 ? '请假' : ''}</span>
              {Number(student.status) === 3 ? null : <Button size="small" onClick={() => props.onStudent('leave', student.studentId)}>请假</Button>}
              <Button size="small" onClick={() => props.onStudent('restore', student.studentId)}>恢复</Button>
              <Button size="small" onClick={() => props.onStudent('remove', student.studentId)}>移出</Button>
            </Space>
          ))}
          <StudentLookup campusId={props.campusId} onPick={(id) => props.onStudent('add', id)} />
          <Form layout="inline" onFinish={(values: { reason?: string }) => props.onLeave(values.reason)}>
            <Form.Item name="reason"><Input placeholder="请假原因" /></Form.Item>
            <Button htmlType="submit">整段请假</Button>
            <Button onClick={() => props.onRestore().catch((error) => message.error(tell(error, '恢复失败')))}>恢复上课</Button>
          </Form>
          <Popconfirm title="取消这个课段？取消后会在对比里标出。" onConfirm={() => props.onDelete()}>
            <Button danger>取消课段</Button>
          </Popconfirm>
          <MoveCopy onMove={props.onMove} onCopy={props.onCopy} />
        </Space>
      ) : null}
    </Modal>
  )
}

function StudentLookup(props: { campusId: number; onPick: (id: number) => void }) {
  const [name, setName] = useState('')
  const [rows, setRows] = useState<Array<{ id: number; name: string }>>([])
  return (
    <Space>
      <Input value={name} placeholder="添加学员" onChange={(event) => setName(event.target.value)} />
      <Button onClick={async () => {
        const data = await getJson<{ records: Array<{ id: number; name: string }> }>('/students/page', { campusId: props.campusId, name, page: 1, pageSize: 8 })
        setRows(data.records || [])
      }}>查找</Button>
      {rows.map((row) => <Button key={row.id} size="small" onClick={() => props.onPick(row.id)}>{row.name}</Button>)}
    </Space>
  )
}

function MoveCopy(props: {
  onMove: (target: { scheduleDate: string; startTime: string; endTime: string; dayOfWeek: number }) => Promise<void>
  onCopy: (target: { scheduleDate: string; startTime: string; endTime: string; dayOfWeek: number }) => Promise<void>
}) {
  return (
    <Form
      layout="inline"
      initialValues={{ scheduleDate: todayIso(), startTime: '09:00', endTime: '10:00' }}
      onFinish={() => undefined}
    >
      <Form.Item name="scheduleDate"><Input type="date" /></Form.Item>
      <Form.Item name="startTime"><Input type="time" /></Form.Item>
      <Form.Item name="endTime"><Input type="time" /></Form.Item>
      <Form.Item shouldUpdate>
        {(form) => {
          const values = form.getFieldsValue()
          const date = new Date(`${values.scheduleDate || todayIso()}T00:00:00`)
          const target = { scheduleDate: values.scheduleDate, startTime: values.startTime, endTime: values.endTime, dayOfWeek: date.getDay() || 7 }
          return (
            <Space>
              <Button onClick={() => props.onMove(target).catch((error) => message.error(tell(error, '移动失败')))}>移动</Button>
              <Button onClick={() => props.onCopy(target).catch((error) => message.error(tell(error, '复制失败')))}>复制</Button>
            </Space>
          )
        }}
      </Form.Item>
    </Form>
  )
}
