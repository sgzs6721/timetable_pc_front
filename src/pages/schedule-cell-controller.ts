import { Modal, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '../api/biz'
import { tell } from './kit'
import type { CourseMember, Schedule, TargetOption } from './schedule-model'
import { CARD_MARKER, cardIdFromPricing, courseMembersWarning, courseTargetWarning, fallbackCourseMembers, minOpenWarning, pricingChoices, resolveMinOpen, resolveMaxOpen, sortTargetOptions, studentScheduleBlock } from './schedule-targets'
import { DAY_LABELS, durationLabel, freeUntil, fromMinutes, parseTrialConfig, toMinutes } from './schedule-board-helpers'
import type { CellDialogProps } from './schedule-cell-dialog'

export function useCellDialogController(props: CellDialogProps) {
  const navigate = useNavigate()
  const cell = props.cell
  const [options, setOptions] = useState<TargetOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [target, setTarget] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pricingKey, setPricingKey] = useState('')
  const [pricingOpen, setPricingOpen] = useState(false)
  const [serviceQuantity, setServiceQuantity] = useState(1)
  const [members, setMembers] = useState<CourseMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [minOpenCount, setMinOpenCount] = useState(0)
  const [maxOpenCount, setMaxOpenCount] = useState(0)
  const [excluded, setExcluded] = useState<number[]>([])
  const [memberCards, setMemberCards] = useState<Record<number, number>>({})
  const [membersOpen, setMembersOpen] = useState(false)
  const [instancesOpen, setInstancesOpen] = useState(false)
  const [cardStudentId, setCardStudentId] = useState<number | null>(null)
  const [cardDraftId, setCardDraftId] = useState<number | null>(null)
  const [trialConfig, setTrialConfig] = useState({ enabled: true, half: true, hour: true })
  const [trialOn, setTrialOn] = useState(false)
  const [trialDuration, setTrialDuration] = useState<'half' | 'hour'>('hour')
  const [halfPosition, setHalfPosition] = useState<'first' | 'second'>('first')
  const [note, setNote] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [coachIds, setCoachIds] = useState<number[]>([])
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsScope, setRecordsScope] = useState<'week' | 'all'>('week')
  const [records, setRecords] = useState<Schedule[]>([])
  const [weekRecords, setWeekRecords] = useState<Schedule[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [dialogCampusId, setDialogCampusId] = useState(props.campusId)
  const [blockedCourseId, setBlockedCourseId] = useState(0)
  const warnedLeave = useRef('')
  const campusChoices = props.schedulableCampuses.length ? props.schedulableCampuses : props.campuses.filter((item) => item.id > 0)
  const dialogCampusName = campusChoices.find((item) => item.id === dialogCampusId)?.name || props.campuses.find((item) => item.id === dialogCampusId)?.name || props.campusName

  useEffect(() => {
    if (!cell) return
    setQuery(cell.schedule?.displayName || cell.schedule?.courseName || '')
    setNote(cell.schedule?.note || '')
    setStartTime(cell.start)
    setEndTime(cell.end)
    setTrialOn(cell.schedule?.targetType === 'preset')
    setTrialDuration(toMinutes(cell.end) - toMinutes(cell.start) <= 30 ? 'half' : 'hour')
    setHalfPosition('first')
    setSearchOpen(false)
    setPricingOpen(false)
    setRecordsOpen(false)
    setTarget(cell.schedule?.targetType && cell.schedule.targetId ? `${cell.schedule.targetType}:${cell.schedule.targetId}` : '')
    setCoachIds(cell.schedule?.coachIds || (cell.schedule?.coachId ? [cell.schedule.coachId] : []))
    setExcluded(cell.schedule?.excludedStudentIds || [])
    setBlockedCourseId(0)
    const preferred = Number(cell.schedule?.campusId || props.campusId || 0)
    const nextCampus = campusChoices.some((item) => item.id === preferred) ? preferred : (campusChoices[0]?.id || props.campusId)
    setDialogCampusId(nextCampus)
  }, [cell])

  useEffect(() => {
    if (!cell || !dialogCampusId) return
    let alive = true
    const duration = toMinutes(cell.end) - toMinutes(cell.start)
    setOptionsLoading(true)
    setOptionsError('')
    setOptions([])
    getJson<TargetOption[]>('/schedules/cell-target-options', {
      campusId: dialogCampusId,
      coachMemberId: props.coachMemberId,
      scheduleId: cell.schedule?.id,
      durationMinutes: duration,
      scheduleDate: cell.date,
    })
      .then((list) => {
        if (!alive) return
        setOptions(list || [])
        setOptionsLoading(false)
      })
      .catch((error) => {
        if (!alive) return
        setOptions([])
        setOptionsError(tell(error, '排课对象搜索失败，请稍后重试'))
        setOptionsLoading(false)
      })
    getJson<Record<string, unknown>>(`/campus-staff/${dialogCampusId}/settings`)
      .then((data) => {
        if (!alive) return
        const next = parseTrialConfig(data?.trialLessonConfig)
        setTrialConfig(next)
        if (!next.enabled) setTrialOn(false)
      })
      .catch(() => { if (alive) setTrialConfig({ enabled: true, half: true, hour: true }) })
    return () => { alive = false }
  }, [cell, dialogCampusId, props.coachMemberId])

  const selected = options.find((item) => `${item.targetType}:${item.targetId}` === target)
  const choices = selected ? pricingChoices(selected) : []
  const instances = cell?.schedule?.studentInstances || []
  const sameCourse = !!cell?.schedule && cell.schedule.targetType === 'course' && selected?.targetType === 'course' && selected.targetId === cell.schedule.targetId
  const occupied = cell?.schedule?.uiChangeStatus === 4
  const onLeave = cell?.schedule?.uiChangeStatus === 3
  const batching = props.batchCount > 1 && !cell?.schedule
  const existing = !!cell?.schedule && !occupied
  const step = 30

  useEffect(() => {
    if (!selected) {
      setPricingKey('')
      setMembers([])
      setMinOpenCount(0)
      setMaxOpenCount(0)
      setMembersLoaded(false)
      return
    }
    const nextChoices = pricingChoices(selected)
    const current = cell?.schedule?.pricingCourseType
    const match = nextChoices.find((item) => item.pricingCourseType === current) || nextChoices.find((item) => !item.disabled) || nextChoices[0]
    setPricingKey(match?.key || '')
    setServiceQuantity(cell?.schedule?.serviceQuantity || 1)
    if (selected.coachIds?.length) setCoachIds(cell?.schedule?.targetId === selected.targetId ? (cell.schedule.coachIds || selected.coachIds) : selected.coachIds)
    if (selected.targetType !== 'course') {
      setMembers([])
      setMinOpenCount(0)
      setMaxOpenCount(0)
      setMembersLoaded(true)
      return
    }
    let active = true
    setMembersLoaded(false)
    const campusId = dialogCampusId
    const coachIds = selected.coachIds || []
    getJson<{ memberHoursDetails?: CourseMember[]; minOpenCount?: number | null; maxOpenCount?: number | null; oneToOne?: boolean; unitPrice?: number; studentIds?: number[]; studentNames?: string[]; coachIds?: number[] }>(`/student-groups/${selected.targetId}`)
      .then(async (group) => {
        if (!active) return
        setMinOpenCount(resolveMinOpen(group))
        setMaxOpenCount(resolveMaxOpen(group))
        if (sameCourse) {
          setMembers([])
          setMembersLoaded(true)
          return
        }
        let rows = group?.memberHoursDetails || []
        if (!rows.length) {
          rows = await fallbackCourseMembers(
            selected.targetId,
            campusId,
            coachIds.length ? coachIds : (group?.coachIds || []),
            Number(group?.unitPrice || 0),
            (group?.studentIds || []).map(Number),
            group?.studentNames || [],
          )
        }
        if (!active) return
        setMembers(rows)
        setExcluded(cell?.schedule?.excludedStudentIds || [])
        setMemberCards(Object.fromEntries(rows.map((row) => [row.studentId, Number(row.defaultStudentCardId || row.cardOptions?.find((card) => card.available !== false)?.id || 0)])))
        setMembersLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setMembers([])
        setMinOpenCount(0)
        setMaxOpenCount(0)
        setMembersLoaded(false)
      })
    return () => { active = false }
  }, [selected?.targetType, selected?.targetId, sameCourse, dialogCampusId])

  useEffect(() => {
    const rows = cell?.schedule?.studentInstances || []
    const key = `${cell?.schedule?.id || 0}:${rows.map((item) => item.status).join(',')}`
    if (!rows.length || rows.some((item) => Number(item.status) !== 3) || cell?.schedule?.targetType !== 'course') return
    if (warnedLeave.current === key) return
    warnedLeave.current = key
    setTarget('')
    setQuery('')
    Modal.info({ title: '提示', content: '所有人全部请假了，那这个课就取消了。', okText: '知道了' })
  }, [cell?.schedule])

  if (!cell) return null
  const pricing = choices.find((item) => item.key === pricingKey)
  const showPricing = !!selected && selected.targetType === 'student' && (choices.length > 1 || !!pricing?.service)
  const duration = Math.max(0, toMinutes(endTime) - toMinutes(startTime))
  const room = freeUntil(startTime, props.dayLessons, cell.schedule?.id, props.dayEnd) - toMinutes(startTime)
  const slotStart = cell.slotStart || cell.start
  const slotRoom = freeUntil(slotStart, props.dayLessons, cell.schedule?.id, props.dayEnd) - toMinutes(slotStart)
  const trialRoom = !trialConfig.half && trialConfig.hour ? Math.max(room, slotRoom >= 60 ? slotRoom : 0) : room
  const trialSwitchDisabled = !trialConfig.enabled || trialRoom < 30 || (!trialConfig.half && trialConfig.hour && trialRoom < 60)
  const keyword = query.trim()
  const visibleOptions = sortTargetOptions(options.filter((item) => {
    if (trialOn && item.targetType !== 'preset') return false
    if (!trialOn && item.targetType === 'preset') return false
    const name = `${item.displayName || ''} ${item.name || ''}`
    return !keyword || name.includes(keyword) || target === `${item.targetType}:${item.targetId}`
  }))
  const coachNames = selected?.coachNames || []
  const coachChoices = (selected?.coachIds || []).map((id, index) => ({ id, name: coachNames[index] || `老师${id}` }))
  const originalTrial = cell.schedule?.targetType === 'preset'
  const canLeave = existing && props.allowTrial && !trialOn && !originalTrial
  const courseAttending = selected?.targetType !== 'course'
    ? 0
    : sameCourse
      ? instances.filter((item) => Number(item.status) !== 3 && !excluded.includes(item.studentId)).length
      : members.filter((item) => !excluded.includes(item.studentId)).length
  const openWarning = selected?.targetType === 'course' && (sameCourse || membersLoaded) ? minOpenWarning(courseAttending, minOpenCount, maxOpenCount) : ''
  const saveBlocked = occupied || !selected || !!courseTargetWarning(selected) || !!studentScheduleBlock(selected) || !!pricing?.disabled
    || (selected.targetType === 'course' && !sameCourse && membersLoaded && !!courseMembersWarning(members, excluded))
    || !!openWarning
    || (selected.targetType === 'student' && choices.length > 1 && !pricingKey)
  const originalTargetKey = cell.schedule?.targetType && cell.schedule.targetId ? `${cell.schedule.targetType}:${cell.schedule.targetId}` : ''
  const idKey = (ids: number[]) => [...ids].map(Number).filter((id) => id > 0).sort((left, right) => left - right).join(',')
  const pricingSame = (current?: string, original?: string) => {
    const next = String(current || '')
    const prev = String(original || '')
    if (!next || next === prev) return true
    const nextBase = next.split(CARD_MARKER)[0]
    const prevBase = prev.split(CARD_MARKER)[0]
    if (nextBase !== prevBase && nextBase !== prev) return false
    const nextCard = next.includes(CARD_MARKER) ? next.slice(next.lastIndexOf(CARD_MARKER) + CARD_MARKER.length) : ''
    const prevCard = prev.includes(CARD_MARKER) ? prev.slice(prev.lastIndexOf(CARD_MARKER) + CARD_MARKER.length) : ''
    return !prevCard || !nextCard || prevCard === nextCard
  }
  const scheduleUnchanged = existing && !!cell.schedule
    && query.trim() === String(cell.schedule.displayName || cell.schedule.courseName || '').trim()
    && note === (cell.schedule.note || '')
    && startTime === cell.start
    && endTime === cell.end
    && target === originalTargetKey
    && trialOn === (cell.schedule.targetType === 'preset')
    && Number(dialogCampusId || 0) === Number(cell.schedule.campusId || props.campusId || 0)
    && idKey(excluded) === idKey(cell.schedule.excludedStudentIds || [])
    && (!pricing?.service || serviceQuantity === (cell.schedule.serviceQuantity || 1))
    && pricingSame(pricing?.pricingCourseType, cell.schedule.pricingCourseType)

  function applyRange(start: string, minutes: number) {
    const end = fromMinutes(toMinutes(start) + minutes)
    const limit = freeUntil(start, props.dayLessons, cell?.schedule?.id, props.dayEnd)
    if (toMinutes(end) > limit) {
      message.warning('该时间段空间不足')
      return false
    }
    setStartTime(start)
    setEndTime(end)
    return true
  }

  function shiftStart(direction: -1 | 1) {
    if (!cell) return
    const baseStart = toMinutes(cell.slotStart || cell.start)
    const baseEnd = toMinutes(cell.slotEnd || cell.end)
    const current = toMinutes(startTime)
    const next = current + direction * step
    if (direction < 0 && next < baseStart) {
      if (current <= baseStart) return
      message.warning('上方空间不足，不能再减')
      return
    }
    if (direction > 0 && next >= baseEnd) {
      if (trialOn) return
      message.warning('下方空间不足，不能再加')
      return
    }
    if (next < toMinutes(props.dayStart)) {
      message.warning('上方空间不足，不能再减')
      return
    }
    if (!applyRange(fromMinutes(next), duration || step)) {
      message.warning(direction < 0 ? '上方空间不足，不能再减' : '下方空间不足，不能再加')
    }
  }

  function shiftDuration(direction: -1 | 1) {
    const next = duration + direction * step
    if (next < step) return
    if (direction > 0 && next > 240) {
      message.warning('课时最多4小时')
      return
    }
    if (direction > 0 && next > room) {
      message.warning('下方空间不足，不能再加')
      return
    }
    applyRange(startTime, next)
  }

  function chooseHalf(position: 'first' | 'second') {
    if (!cell) return
    const start = position === 'second' ? fromMinutes(toMinutes(cell.start) + 30) : cell.start
    const limit = freeUntil(start, props.dayLessons, cell.schedule?.id, props.dayEnd)
    if (toMinutes(start) + 30 > limit) {
      message.warning('该时段已被占用')
      return
    }
    if (position === halfPosition && trialDuration === 'half') return
    setHalfPosition(position)
    applyRange(start, 30)
  }

  function chooseTrialHour(position: 'first' | 'second') {
    if (!cell) return
    const base = cell.slotStart || cell.start
    const second = fromMinutes(toMinutes(base) + 30)
    const start = position === 'second' ? second : base
    const limit = freeUntil(start, props.dayLessons, cell.schedule?.id, props.dayEnd)
    if (toMinutes(start) + 60 > limit) {
      message.warning('该开始时间下方空间不足')
      return
    }
    if (trialDuration === 'hour' && position === halfPosition && startTime === start) return
    setTrialDuration('hour')
    setHalfPosition(position)
    applyRange(start, 60)
  }

  function chooseLessonHalf(position: 'first' | 'second') {
    if (!cell) return
    const baseStart = cell.slotStart || cell.start
    const baseEnd = cell.slotEnd || cell.end
    const secondStart = fromMinutes(toMinutes(baseStart) + step)
    const current = toMinutes(startTime) >= toMinutes(secondStart) ? 'second' : 'first'
    if (position === current) return
    const start = position === 'second' ? secondStart : baseStart
    const minutes = position === 'second'
      ? Math.max(toMinutes(baseEnd) - toMinutes(start), step)
      : Math.max(toMinutes(baseEnd) - toMinutes(baseStart), step)
    const limit = freeUntil(start, props.dayLessons, cell.schedule?.id, props.dayEnd)
    if (toMinutes(start) >= toMinutes(baseEnd) || toMinutes(start) + minutes > limit) {
      message.warning('该开始时间下方空间不足')
      return
    }
    setStartTime(start)
    setEndTime(fromMinutes(toMinutes(start) + minutes))
  }

  function changeDialogCampus(nextId: number) {
    if (!campusChoices.some((item) => item.id === nextId)) {
      const name = props.campuses.find((item) => item.id === nextId)?.name || ''
      message.warning(name ? `${props.ownerName}未配置在${name}，无法排课` : `${props.ownerName}未配置可排课校区，请先在校区老师设置中关联`)
      return
    }
    if (nextId === dialogCampusId) return
    setDialogCampusId(nextId)
    setTarget('')
    setQuery('')
    setPricingKey('')
    setSearchOpen(true)
  }

  function choose(option: TargetOption) {
    if (option.targetType === 'course' && blockedCourseId > 0 && option.targetId === blockedCourseId) {
      message.warning('该课程已取消，请另选课程')
      return
    }
    const warning = courseTargetWarning(option) || studentScheduleBlock(option)
    if (warning) {
      message.warning(warning)
      return
    }
    setTarget(`${option.targetType}:${option.targetId}`)
    setQuery(option.displayName || option.name)
    setSearchOpen(false)
    if (option.targetType === 'preset') {
      const minutes = trialConfig.hour && room >= 60 ? 60 : 30
      setTrialDuration(minutes >= 60 ? 'hour' : 'half')
      applyRange(startTime, minutes)
    }
  }

  function confirmOccupy() {
    if (saving || !cell) return
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      message.warning('结束时间必须晚于开始时间')
      return
    }
    const dayLabel = cell.day >= 1 && cell.day <= 7 ? `周${DAY_LABELS[cell.day - 1]}` : ''
    const occupyTimeLabel = `${dayLabel} ${startTime}-${endTime}`.trim()
    Modal.confirm({
      title: '确认占用',
      content: `是否将${occupyTimeLabel ? `${occupyTimeLabel} ` : ''}设为占用时段，暂不排课？`,
      okText: '确认占用',
      cancelText: '取消',
      onOk: () => save(true),
    })
  }

  async function save(occupy = false) {
    if (saving) return
    if (!occupy && !selected) {
      message.warning(trialOn ? '请选择校区预设人员' : '请先从候选列表中选择学员或非一对一班级')
      return
    }
    if (!occupy && selected) {
      const pickedName = String(selected.displayName || selected.name || query || '').trim()
      if (!pickedName) {
        message.warning(trialOn ? '请选择校区预设人员' : '请输入学员姓名，或非一对一班级简称')
        return
      }
    }
    if (!occupy && existing && scheduleUnchanged) return
    if (!occupy && saveBlocked) return
    if (!occupy && toMinutes(startTime) >= toMinutes(endTime)) {
      message.warning('结束时间必须晚于开始时间')
      return
    }
    if (!cell) return
    const slotStart = toMinutes(cell.slotStart || cell.start)
    const slotEnd = toMinutes(cell.slotEnd || cell.end)
    if (!occupy && !trialOn && (toMinutes(startTime) < slotStart || toMinutes(startTime) >= slotEnd)) {
      message.warning('开始时间不能超出当前单元格')
      return
    }
    const name = selected?.displayName || selected?.name || query
    const bindings = selected?.targetType === 'course'
      ? members.filter((member) => !excluded.includes(member.studentId) && memberCards[member.studentId] > 0).map((member) => ({ studentId: member.studentId, studentCardId: memberCards[member.studentId] }))
      : undefined
    setSaving(true)
    try {
      await props.onSave({
        courseName: occupy ? '占用' : name,
        note,
        coachIds: coachChoices.length > 1 ? coachIds : selected?.coachIds,
        startTime,
        endTime,
        occupy,
        targetType: occupy ? undefined : selected?.targetType,
        targetId: occupy ? undefined : selected?.targetId,
        studentId: selected?.targetType === 'student' ? selected.targetId : undefined,
        studentCardId: cardIdFromPricing(pricing?.pricingCourseType),
        pricingStudentGroupId: pricing?.pricingStudentGroupId,
        pricingCourseType: pricing?.pricingCourseType,
        serviceQuantity: pricing?.service ? serviceQuantity : undefined,
        memberCardBindings: bindings,
        excludedStudentIds: selected?.targetType === 'course' ? excluded : undefined,
        campusId: dialogCampusId || props.campusId,
      })
    } catch (error) {
      const text = tell(error, occupy ? '占用失败' : '保存失败')
      if (!occupy && text.includes('冲突') && coachChoices.length > 1) {
        Modal.info({ title: '老师时间冲突', content: text, okText: '去调整' })
        return
      }
      message.error(text)
    } finally {
      setSaving(false)
    }
  }

  async function openRecords() {
    const name = selected?.displayName || selected?.name || cell?.schedule?.displayName || cell?.schedule?.courseName || query
    if (!props.timetableId || !name) {
      message.warning('无法获取学员信息')
      return
    }
    setRecordsOpen(true)
    setRecordsScope('week')
    setRecordsLoading(true)
    try {
      const queryParams = { courseName: name, targetType: selected?.targetType || cell?.schedule?.targetType, targetId: selected?.targetId || cell?.schedule?.targetId }
      const week = await getJson<Schedule[]>(`/schedules/timetable/${props.timetableId}/by-name`, { ...queryParams, weekStart: props.weekStart })
      const all = await getJson<Schedule[]>(`/schedules/timetable/${props.timetableId}/by-name`, queryParams)
      setWeekRecords(week || [])
      setRecords(all || [])
    } catch (error) {
      message.error(tell(error, '获取记录失败'))
    } finally {
      setRecordsLoading(false)
    }
  }

  function openStudentRecords(studentId?: number) {
    const id = studentId || (selected?.targetType === 'student' ? selected.targetId : instances.length === 1 ? instances[0].studentId : 0)
    if (!id) {
      message.info('请点学员姓名查看上课记录')
      return
    }
    navigate(`/students?studentId=${id}&tab=check`)
  }

  async function toggleStudent(action: 'leave' | 'restore' | 'remove', studentId: number, studentName?: string) {
    try {
      const fresh = await props.onStudent(action, studentId)
      if (action === 'leave' || action === 'restore') message.success(`${studentName || '学员'}${action === 'leave' ? '已请假' : '已销假'}`)
      const instancesNow = fresh?.studentInstances || []
      const allOnLeave = instancesNow.length > 0 && instancesNow.every((item) => Number(item.status) === 3)
      if (allOnLeave) {
        const courseId = selected?.targetType === 'course'
          ? Number(selected.targetId)
          : (cell?.schedule?.targetType === 'course' ? Number(cell.schedule.targetId) : 0)
        if (courseId > 0) setBlockedCourseId(courseId)
        setTarget('')
        setQuery('')
      } else if (action === 'restore') {
        setBlockedCourseId(0)
      }
    } catch (error) {
      message.error(tell(error, '操作失败'))
    }
  }

  const lessonSlotStart = cell.slotStart || cell.start
  const lessonSlotEnd = cell.slotEnd || cell.end
  const lessonSecondStart = fromMinutes(toMinutes(lessonSlotStart) + step)
  const showLessonHalf = !trialOn && !batching && !existing && toMinutes(lessonSecondStart) < toMinutes(lessonSlotEnd)
  const firstHalfMinutes = Math.max(toMinutes(lessonSlotEnd) - toMinutes(lessonSlotStart), step)
  const secondHalfMinutes = Math.max(toMinutes(lessonSlotEnd) - toMinutes(lessonSecondStart), step)
  const firstHalfAvailable = toMinutes(lessonSlotStart) + firstHalfMinutes <= freeUntil(lessonSlotStart, props.dayLessons, cell.schedule?.id, props.dayEnd)
  const secondHalfAvailable = toMinutes(lessonSecondStart) < toMinutes(lessonSlotEnd) && toMinutes(lessonSecondStart) + secondHalfMinutes <= freeUntil(lessonSecondStart, props.dayLessons, cell.schedule?.id, props.dayEnd)
  const trialHourBase = cell.slotStart || cell.start
  const trialHourSecond = fromMinutes(toMinutes(trialHourBase) + 30)
  const trialHourSecondAvailable = freeUntil(trialHourSecond, props.dayLessons, cell.schedule?.id, props.dayEnd) - toMinutes(trialHourSecond) >= 60
  const durationMax = Math.min(240, Math.floor(Math.max(room, 0) / step) * step)
  const durationHint = !trialOn && durationMax > step ? `最多${durationLabel(durationMax)}` : !trialOn && room < step ? '下方空间不足' : ''
  const recordRows = recordsScope === 'week' ? weekRecords : records
  const shownMembers = membersOpen ? members : members.slice(0, 4)
  const shownInstances = instancesOpen ? instances : instances.slice(0, 4)
  const cardMember = members.find((item) => item.studentId === cardStudentId)

  function openCardPicker(member: CourseMember) {
    const available = (member.cardOptions || []).filter((card) => card.available !== false && Number(card.id || 0) > 0)
    if (available.length <= 1) return
    const currentId = memberCards[member.studentId]
    const current = available.find((card) => card.id === currentId) || available[0]
    setCardStudentId(member.studentId)
    setCardDraftId(current?.id || null)
  }

  function closeCardPicker() {
    setCardStudentId(null)
    setCardDraftId(null)
  }

  function confirmCardPicker() {
    if (cardStudentId && cardDraftId) {
      setMemberCards((current) => ({ ...current, [cardStudentId]: cardDraftId }))
    }
    closeCardPicker()
  }

  return {
    props,
    options,
    optionsLoading,
    optionsError,
    target,
    setTarget,
    query,
    setQuery,
    searchOpen,
    setSearchOpen,
    pricingKey,
    setPricingKey,
    pricingOpen,
    setPricingOpen,
    serviceQuantity,
    setServiceQuantity,
    members,
    membersLoaded,
    excluded,
    setExcluded,
    memberCards,
    membersOpen,
    setMembersOpen,
    instancesOpen,
    setInstancesOpen,
    cardDraftId,
    setCardDraftId,
    trialConfig,
    trialOn,
    setTrialOn,
    trialDuration,
    setTrialDuration,
    halfPosition,
    note,
    setNote,
    startTime,
    endTime,
    coachIds,
    setCoachIds,
    recordsOpen,
    setRecordsOpen,
    recordsScope,
    setRecordsScope,
    records,
    recordsLoading,
    saving,
    leaving,
    setLeaving,
    deleting,
    setDeleting,
    restoring,
    setRestoring,
    dialogCampusId,
    cell,
    campusChoices,
    dialogCampusName,
    selected,
    choices,
    instances,
    sameCourse,
    occupied,
    onLeave,
    batching,
    existing,
    pricing,
    showPricing,
    duration,
    room,
    trialSwitchDisabled,
    keyword,
    visibleOptions,
    coachChoices,
    canLeave,
    openWarning,
    scheduleUnchanged,
    lessonSlotStart,
    lessonSecondStart,
    showLessonHalf,
    firstHalfAvailable,
    secondHalfAvailable,
    trialHourBase,
    trialHourSecond,
    trialHourSecondAvailable,
    durationHint,
    recordRows,
    shownMembers,
    shownInstances,
    cardMember,
    shiftStart,
    shiftDuration,
    chooseHalf,
    chooseTrialHour,
    chooseLessonHalf,
    changeDialogCampus,
    choose,
    confirmOccupy,
    save,
    openRecords,
    openStudentRecords,
    toggleStudent,
    openCardPicker,
    closeCardPicker,
    confirmCardPicker,
  }
}
