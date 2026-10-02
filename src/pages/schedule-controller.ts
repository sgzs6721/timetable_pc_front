import { Modal, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { delJson, getJson, postJson, putJson } from '../api/biz'
import { tell, todayIso, useShell } from './kit'
import type { DayDialog, Schedule, Timetable, TimetableGroup } from './schedule-model'
import { DAY_LABELS, clockText, duplicateTimetableName, freeUntil, fromMinutes, latestTemplateSchedules, mondayOf, scheduleCampusLegend, slotsOf, splitBoardHead, toMinutes, weekLimits } from './schedule-board-helpers'
import { timetableBody, timetableOwner } from './schedule-board-fields'
import { toDayCourses } from './schedule-day-dialog'
import { copyScheduleItem, leaveScheduleItem, moveScheduleItem, removeScheduleItem, type ScheduleMutationTarget } from './schedule-mutations'

export function useScheduleController() {
  const shell = useShell()
  const [params, setParams] = useSearchParams()
  const [groups, setGroups] = useState<TimetableGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsLoadedKey, setGroupsLoadedKey] = useState('')
  const [archived, setArchived] = useState(false)
  const [dayBand, setDayBand] = useState<'work' | 'weekend'>('work')
  const [selecting, setSelecting] = useState(false)
  const [current, setCurrent] = useState<Timetable | null>(null)
  const [weekStart, setWeekStart] = useState(mondayOf(todayIso()))
  const [mode, setMode] = useState<'instance' | 'template'>('instance')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [templateSchedules, setTemplateSchedules] = useState<Schedule[]>([])
  const [creating, setCreating] = useState(false)
  const [createSource, setCreateSource] = useState<Timetable | null>(null)
  const [editing, setEditing] = useState(false)
  const [cell, setCell] = useState<{ day: number; date: string; start: string; end: string; slotStart?: string; slotEnd?: string; schedule?: Schedule; echo?: { name: string; status: 'leave' | 'delete'; scheduleId: number; time?: string } } | null>(null)
  const [placement, setPlacement] = useState<{ kind: 'move' | 'copy'; schedule: Schedule; targets: Array<{ day: number; date: string; start: string; end: string }> } | null>(null)
  const [batch, setBatch] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [overview, setOverview] = useState<Schedule[] | null>(null)
  const [dayDialog, setDayDialog] = useState<DayDialog | null>(null)
  const [lookup, setLookup] = useState<Schedule[] | null>(null)
  const [campusFilter, setCampusFilter] = useState(0)
  const groupsRequestId = useRef(0)
  const [dragAction, setDragAction] = useState<{
    schedule: Schedule
    name: string
    sourceLabel: string
    targetLabel: string
    canCopy: boolean
    target: ScheduleMutationTarget
  } | null>(null)
  const [dragHover, setDragHover] = useState<{ day: number; date: string; start: string; end: string; name: string } | null>(null)
  const dragGuard = useRef(false)
  const dragLessonKey = useRef('')
  const routeTimetableId = Number(params.get('timetableId') || 0)

  const campusId = shell.campusId
  const groupsKey = `${campusId || 0}:${archived ? 2 : 1}`
  const timetableListLoading = groupsLoading || groupsLoadedKey !== groupsKey
  const campusName = shell.campuses.find((item) => item.id === campusId)?.name || '当前校区'
  const currentOrg = shell.organizations.find((item) => item.id === shell.currentOrgId) || null
  const role = String(shell.user?.role || '').toLowerCase()
  const userId = Number(shell.user?.id || 0)
  const ownerId = Number(currentOrg?.ownerId || 0)
  const campusScope = (shell.user?.campusAdminCampusIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
  const managesCampus = role === 'owner' || role === 'admin' || (userId > 0 && ownerId > 0 && userId === ownerId) || (shell.user?.campusAdmin === true && (!campusScope.length || campusScope.includes(Number(campusId || 0))))
  const canCreate = managesCampus || shell.user?.isSubstituteTeacher === true
  const timetableLocked = Number(current?.scheduleCount || 0) > 0
  const days = current?.weekDays?.length ? current.weekDays : [1, 2, 3, 4, 5, 6, 7]
  const splitWeekend = Number(current?.splitWeekend) === 1
  const templateMode = mode === 'template' && Number(current?.isWeekly) === 1
  const boardSchedules = useMemo(
    () => (templateMode ? templateSchedules : schedules)
      .filter((item) => Number(item.uiChangeStatus || 0) !== 3),
    [templateMode, templateSchedules, schedules],
  )
  const campusLegend = scheduleCampusLegend(boardSchedules, shell.campuses)
  const activeCampusId = campusLegend.some((item) => item.id === campusFilter) ? campusFilter : 0
  const boardDays = splitWeekend ? days.filter((day) => (dayBand === 'weekend' ? day >= 6 : day <= 5)) : days
  const splitHead = splitWeekend ? splitBoardHead(templateMode, dayBand === 'weekend', boardDays, weekStart) : null
  const slots = useMemo(() => {
    if (!current || !splitWeekend || dayBand !== 'weekend') return slotsOf(current)
    return slotsOf({
      ...current,
      startTime: current.weekendStartTime || current.startTime,
      endTime: current.weekendEndTime || current.endTime,
      timeIntervalMinutes: current.weekendTimeIntervalMinutes || current.timeIntervalMinutes || 60,
    })
  }, [current, splitWeekend, dayBand])

  async function loadGroups(preferId?: number) {
    const requestId = groupsRequestId.current + 1
    groupsRequestId.current = requestId
    const requestKey = `${campusId || 0}:${archived ? 2 : 1}`
    setGroupsLoading(true)
    if (!campusId) {
      setGroups([])
      setCurrent(null)
      setGroupsLoadedKey(requestKey)
      setGroupsLoading(false)
      return
    }
    try {
      const data = await getJson<TimetableGroup[]>('/timetables/grouped', { campusId, status: archived ? 2 : 1 })
      if (groupsRequestId.current !== requestId) return
      setGroups(data || [])
      const all = (data || []).flatMap((group) => (archived ? group.archivedTimetables : group.activeTimetables) || [])
      const requested = Number(preferId || routeTimetableId || 0)
      const next = all.find((item) => item.id === requested)
        || (!archived ? all.find((item) => Number(item.isDefault) === 1) : null)
        || all[0]
        || null
      setCurrent(next)
      setGroupsLoadedKey(requestKey)
      if (next?.id !== routeTimetableId) {
        setParams((previous) => {
          const updated = new URLSearchParams(previous)
          if (next?.id) updated.set('timetableId', String(next.id))
          else updated.delete('timetableId')
          return updated
        }, { replace: true })
      }
    } catch (error) {
      if (groupsRequestId.current === requestId) {
        setGroups([])
        setCurrent(null)
        setGroupsLoadedKey(requestKey)
      }
      throw error
    } finally {
      if (groupsRequestId.current === requestId) setGroupsLoading(false)
    }
  }

  function selectTimetable(timetable: Timetable) {
    setCurrent(timetable)
    setParams((previous) => {
      const updated = new URLSearchParams(previous)
      updated.set('timetableId', String(timetable.id))
      return updated
    })
  }

  async function loadWeek(timetable = current) {
    if (!timetable) return
    const list = await getJson<Schedule[]>(`/schedules/timetable/${timetable.id}/week`, { weekStart })
    setSchedules(list || [])
    if (Number(timetable.isWeekly) === 1) {
      const rows = await getJson<Schedule[]>(`/schedules/timetable/${timetable.id}`)
      setTemplateSchedules(latestTemplateSchedules(rows || []))
    } else {
      setTemplateSchedules([])
    }
  }

  function switchBoardMode(next: 'instance' | 'template') {
    if (next === mode) return
    setMode(next)
    setSelecting(false)
    setDeleting(false)
    setBatch([])
    setDeleteIds([])
    setPlacement(null)
    setCell(null)
  }

  useEffect(() => {
    loadGroups().catch((error) => message.error(tell(error, '课表加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId, archived])

  useEffect(() => {
    if (!routeTimetableId || current?.id === routeTimetableId) return
    const all = groups.flatMap((group) => (archived ? group.archivedTimetables : group.activeTimetables) || [])
    const routed = all.find((item) => item.id === routeTimetableId)
    if (routed) setCurrent(routed)
  }, [archived, current?.id, groups, routeTimetableId])

  useEffect(() => {
    loadWeek().catch((error) => message.error(tell(error, '周课表加载失败')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, weekStart])

  const limits = weekLimits(current, weekStart)
  useEffect(() => {
    if (!current) return
    if (limits.min && weekStart < limits.min) setWeekStart(limits.min)
    else if (limits.max && weekStart > limits.max) setWeekStart(limits.max)
  }, [current, limits.min, limits.max, weekStart])

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
    campusId?: number
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
      campusId: values.campusId || campusId,
      pricingStudentGroupId: values.occupy ? undefined : values.pricingStudentGroupId,
      pricingCourseType: values.occupy ? undefined : values.pricingCourseType,
      serviceQuantity: values.occupy ? undefined : values.serviceQuantity,
      excludedStudentIds: values.occupy ? undefined : values.excludedStudentIds,
      memberCardBindings: values.occupy ? undefined : values.memberCardBindings || (values.studentId && values.studentCardId ? [{ studentId: values.studentId, studentCardId: values.studentCardId }] : undefined),
    }))
    if (cells.length === 1) await postJson('/schedules/cell', cells[0])
    else await postJson('/schedules/cell/batch', { cells })
  }

  async function removeSchedule(schedule: Schedule) {
    if (!current || !schedule.id) return
    await removeScheduleItem(schedule, current, campusId || 0, templateMode)
  }

  async function leaveSchedule(schedule: Schedule) {
    if (!current || !schedule.id) return null
    return leaveScheduleItem(schedule, current, campusId || 0)
  }

  async function moveSchedule(schedule: Schedule, target: ScheduleMutationTarget) {
    if (!current || !schedule.id) return
    await moveScheduleItem(schedule, current, target, templateMode)
  }

  async function copySchedule(schedule: Schedule, targets: ScheduleMutationTarget[]) {
    if (!current || !schedule.id || !targets.length) return
    await copyScheduleItem(schedule, current, campusId || 0, templateMode, targets)
  }

  async function openOverview() {
    if (!current) return
    if (current.isWeekly === 1 && mode === 'template') {
      setOverview(templateSchedules.filter((item) => Number(item.uiChangeStatus || 0) !== 3 && Number(item.uiChangeStatus || 0) !== 4 && String(item.courseName || '').trim()))
      return
    }
    setOverview(await getJson(`/schedules/timetable/${current.id}/week-overview`, { weekStart }))
  }

  async function onTimetableMenu(key: string) {
    if (!current) return
    if (key === 'copy' || key === 'create-from') {
      const activeCount = (timetableOwner(groups, current.id)?.activeTimetables || []).length
      if (activeCount >= 2) {
        message.warning('每人最多保留2张非归档课表，请先归档后再新增')
        return
      }
    }
    if (key === 'copy') {
      try {
        const detail = await getJson<Timetable>(`/timetables/${current.id}`)
        const created = await postJson<Timetable>('/timetables', {
          ...timetableBody({ ...detail, name: duplicateTimetableName(detail.name) }, campusId || 0),
          isDefault: 0,
        })
        message.success('已复制课表')
        await loadGroups(created.id)
      } catch (error) {
        message.error(tell(error, '复制失败'))
      }
      return
    }
    if (key === 'create-from') {
      setCreateSource(await getJson<Timetable>(`/timetables/${current.id}`))
      setCreating(true)
      return
    }
    if (key === 'batch') {
      const next = !deleting
      setDeleting(next)
      setSelecting(false)
      setBatch([])
      setDeleteIds([])
      if (next) message.info('请选择要删除的课时')
      return
    }
    if (key === 'edit') {
      setEditing(true)
      return
    }
    if (key === 'default') {
      Modal.confirm({
        title: '设为活动课表？',
        okText: '确认设置',
        cancelText: '取消',
        onOk: async () => {
          await putJson(`/timetables/${current.id}/default`)
          message.success('已设为活动课表')
          await loadGroups(current.id)
        },
      })
      return
    }
    if (key === 'archive') {
      const owner = timetableOwner(groups, current.id)
      if (!archived && (owner?.archivedTimetables || []).length >= 5) {
        message.warning('每个人最多保留5张归档课表，请先删除后再归档')
        return
      }
      if (archived && (owner?.activeTimetables || []).length >= 2) {
        message.warning('每人最多保留2张非归档课表，请先归档后再新增')
        return
      }
      Modal.confirm({
        title: archived ? '恢复课表' : '归档课表',
        content: archived ? `确认恢复“${current.name || '该课表'}”吗？` : `确认归档“${current.name || '该课表'}”吗？归档后将从主列表隐藏。`,
        okText: archived ? '恢复' : '归档',
        cancelText: '取消',
        onOk: async () => {
          await putJson(`/timetables/${current.id}/${archived ? 'unarchive' : 'archive'}`)
          message.success(archived ? '已恢复' : '已归档')
          await loadGroups()
        },
      })
      return
    }
    if (key === 'delete') {
      Modal.confirm({
        title: '删除这张课表？',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          await delJson(`/timetables/${current.id}`)
          message.success('已删除')
          await loadGroups()
        },
      })
    }
  }

  async function openDay(date: string, day: number) {
    if (!current) return
    if (current.isWeekly === 1 && mode === 'template') {
      message.info('固定模板请切回本周实例后再查看当日课程')
      return
    }
    const teacherName = groups.find((group) => [...(group.activeTimetables || []), ...(group.archivedTimetables || [])].some((item) => item.id === current.id))?.memberName || ''
    const own = toDayCourses(schedules.filter((item) => item.scheduleDate === date))
    if (!own.length) {
      message.info('当天没有课程')
      return
    }
    setDayDialog({ date, dayLabel: `周${DAY_LABELS[day - 1]}`, teacherName, own, others: [], showOthers: false, copyOthers: true, collapsed: [] })
    const defaults = groups.flatMap((group) => (group.activeTimetables || []).map((item) => ({ ...item, memberName: group.memberName }))).filter((item) => {
      if (item.id === current.id || Number(item.isDefault) !== 1) return false
      return !current.createByMemberId || Number(item.createByMemberId) !== Number(current.createByMemberId)
    })
    if (!defaults.length) return
    const packs = await getJson<Array<{ timetableId?: number; schedules?: Schedule[] }>>('/schedules/timetables/week', {
      timetableIds: defaults.map((item) => item.id).join(','),
      weekStart,
    })
    const named = new Map(defaults.map((item) => [item.id, item]))
    const others = (packs || []).flatMap((pack) => {
      const timetable = named.get(Number(pack.timetableId))
      if (!timetable) return []
      const title = [timetable.memberName, timetable.name].filter(Boolean).join(' · ') || '其他老师课程'
      return toDayCourses((pack.schedules || []).filter((item) => item.scheduleDate === date), title, timetable.memberName || '')
    })
    setDayDialog((currentDialog) => currentDialog && currentDialog.date === date ? { ...currentDialog, others } : currentDialog)
  }

  function choosePlacement(day: number, date: string, start: string, lessons: Schedule[], incomplete = false) {
    if (!placement?.schedule.id) return
    const source = placement.schedule
    const duration = Math.max(30, toMinutes(clockText(source.endTime)) - toMinutes(clockText(source.startTime)))
    const dayEnd = slots[slots.length - 1]?.end || '21:00'
    const room = freeUntil(start, lessons, source.id, dayEnd) - toMinutes(start)
    if (room < duration) {
      message.warning(incomplete
        ? '请选择完整空白单元格'
        : (placement.kind === 'move' ? '目标空白时段不足，无法移动当前课时' : '目标空白时段不足，无法复制当前课时'))
      return
    }
    const target = { day, date, start, end: fromMinutes(toMinutes(start) + duration) }
    if (placement.kind === 'move') {
      const currentTarget = placement.targets[0]
      const same = currentTarget?.date === date && currentTarget.start === start
      setPlacement({ ...placement, targets: same ? [] : [target] })
      return
    }
    const picked = placement.targets.some((item) => item.date === date && item.start === start)
    const startMin = toMinutes(start)
    const endMin = toMinutes(target.end)
    setPlacement({
      ...placement,
      targets: picked
        ? placement.targets.filter((item) => !(item.date === date && item.start === start))
        : [...placement.targets.filter((item) => item.date !== date || toMinutes(item.end) <= startMin || endMin <= toMinutes(item.start)), target],
    })
  }

  return {
    groups,
    groupsLoading: timetableListLoading,
    archived,
    setArchived,
    dayBand,
    setDayBand,
    selecting,
    setSelecting,
    current,
    setCurrent: selectTimetable,
    weekStart,
    setWeekStart,
    mode,
    schedules,
    templateSchedules,
    creating,
    setCreating,
    createSource,
    setCreateSource,
    editing,
    setEditing,
    cell,
    setCell,
    placement,
    setPlacement,
    batch,
    setBatch,
    deleting,
    setDeleting,
    deleteIds,
    setDeleteIds,
    overview,
    setOverview,
    dayDialog,
    setDayDialog,
    lookup,
    setLookup,
    setCampusFilter,
    dragAction,
    setDragAction,
    dragHover,
    setDragHover,
    shell,
    dragGuard,
    dragLessonKey,
    campusId,
    campusName,
    managesCampus,
    canCreate,
    timetableLocked,
    days,
    splitWeekend,
    templateMode,
    boardSchedules,
    campusLegend,
    activeCampusId,
    boardDays,
    splitHead,
    slots,
    limits,
    loadGroups,
    loadWeek,
    switchBoardMode,
    saveCell,
    removeSchedule,
    leaveSchedule,
    moveSchedule,
    copySchedule,
    openOverview,
    onTimetableMenu,
    openDay,
    choosePlacement,
  }
}
