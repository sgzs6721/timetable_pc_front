import { Button, Dropdown, Modal, Popconfirm, Skeleton, Tabs, message } from 'antd'
import { LeftOutlined, PlusOutlined, RightOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { postJson, putJson } from '../api/biz'
import { AppIcon, NeedCampus, PageHead, tell, todayIso } from './kit'
import {
  DAY_LABELS, addDays, boardHoursText, cancelledTemplates, clockText,
  compareDetail, formatTimetableTime, freeUntil, fromMinutes,
  ownerGenderIcon, scheduleInstanceKey, templateEchoForCell, timetableMeta,
  timetableWeeks, toMinutes,
  weekChipLabel,
} from './schedule-board-helpers'
import {
  batchKey, blankSegments, cardFrame, dragPlacement, lessonClass, lessonOverlaps, mergeRanges,
  parseBatchKey, pointerStart, rangeFrame,
  toggleBatchRange,
} from './schedule-board-fields'
import { slotContaining } from './schedule-timetable-forms'
import { useScheduleController } from './schedule-controller'
import { ScheduleDialogs } from './schedule-dialogs'

export function SchedulePage() {
  const vm = useScheduleController()
  const { groups, groupsLoading, archived, setArchived, dayBand, setDayBand, selecting, setSelecting, current, setCurrent, weekStart, setWeekStart, mode, schedules, templateSchedules, setCreating, setCell, placement, setPlacement, batch, setBatch, deleting, setDeleting, deleteIds, setDeleteIds, setCampusFilter, setDragAction, dragHover, setDragHover, dragGuard, dragLessonKey, campusId, canCreate, days, splitWeekend, templateMode, boardSchedules, campusLegend, activeCampusId, boardDays, splitHead, slots, limits, loadGroups, loadWeek, switchBoardMode, removeSchedule, moveSchedule, copySchedule, openOverview, onTimetableMenu, openDay, choosePlacement } = vm
  const visibleGroups = groups.filter((group) => ((archived ? group.archivedTimetables : group.activeTimetables) || []).length > 0)

  return (
    <NeedCampus campusId={campusId}>
      <PageHead title="课表管理" extra="按校区查看、新建，并在周视图里排课、请假、占用、拖动、移动和复制。" />
      <div className="split schedule-split">
        <section className="schedule-list-column">
          <div className="work-card schedule-list-shell">
            <div className="schedule-list-controls">
              <Tabs
                className="tabs-nav-only schedule-head-tabs"
                activeKey={archived ? 'archived' : 'active'}
                onChange={(key) => {
                  setArchived(key === 'archived')
                  setSelecting(false)
                  setBatch([])
                  setDeleting(false)
                  setDeleteIds([])
                }}
                items={[
                  { key: 'active', label: '人员课表' },
                  { key: 'archived', label: '归档课表' },
                ]}
              />
              <Button
                className="schedule-create-button"
                type="primary"
                icon={<PlusOutlined />}
                aria-label="创建课表"
                title="创建课表"
                onClick={() => {
                  if (!canCreate) {
                    message.warning('仅带课老师可新建课表，请联系管理员在校区老师设置中开启带课老师')
                    return
                  }
                  setCreating(true)
                }}
              />
            </div>
            <div className="schedule-list-panel">
            {groupsLoading ? <div className="schedule-list-loading" aria-label="课表加载中"><Skeleton active title={{ width: '42%' }} paragraph={{ rows: 5, width: ['92%', '84%', '88%', '76%', '82%'] }} /></div> : <>
            {visibleGroups.map((group) => {
              const memberGender = group.memberGender || [...(group.activeTimetables || []), ...(group.archivedTimetables || [])]
                .find((item) => item.createByMemberGender)?.createByMemberGender
              const memberGenderIcon = ownerGenderIcon(memberGender)
              return (
              <div className="timetable-group" key={group.memberName || '未分组'}>
                <div className="timetable-group-name">
                  <AppIcon
                    className={memberGenderIcon === 'icon-gender-male' ? 'timetable-group-person is-male' : memberGenderIcon === 'icon-gender-female' ? 'timetable-group-person is-female' : 'timetable-group-person'}
                    name={memberGenderIcon || 'icon-person-neutral'}
                    size={13}
                  />
                  <span>{group.memberName || '未分组'}</span>
                  {group.positionName ? <em>{group.positionName}</em> : null}
                </div>
                {((archived ? group.archivedTimetables : group.activeTimetables) || [])
                  .slice()
                  .sort((left, right) => Number(right.isDefault || 0) - Number(left.isDefault || 0))
                  .map((item) => (
                  <div key={item.id} className={current?.id === item.id ? 'timetable-item is-current' : 'timetable-item'}>
                    <button type="button" className="timetable-item-main" onClick={() => setCurrent(item)}>
                      <span className="timetable-item-copy">
                        <span className="timetable-item-title-row">
                          {Number(item.isWeekly) === 1 ? <i className="timetable-kind-outline">固定课表</i> : <i className="timetable-kind-outline is-range">日期范围</i>}
                          <b>{item.name}</b>
                        </span>
                        <small className="timetable-item-meta">
                          <span>{timetableMeta(item)}</span>
                        </small>
                        {formatTimetableTime(item.createTime) ? <time className="timetable-item-created">创建于 {formatTimetableTime(item.createTime)}</time> : null}
                      </span>
                    </button>
                    {archived ? null : Number(item.isDefault) === 1 ? (
                      <span className="timetable-active" aria-label="活动课表" title="活动课表"><StarFilled /></span>
                    ) : (
                      <button type="button" className="timetable-set" aria-label="设为活动课表" title="设为活动课表" onClick={() => {
                        Modal.confirm({
                          title: '设置活动课表',
                          content: `确认将“${item.name}”设为${group.memberName ? `${group.memberName}的` : ''}活动课表吗？`,
                          okText: '确认设置',
                          cancelText: '取消',
                          onOk: async () => {
                            try {
                              await putJson(`/timetables/${item.id}/default`)
                              message.success('已设为活动课表')
                              await loadGroups(item.id)
                            } catch (error) {
                              message.error(tell(error, '设置活动课表失败'))
                            }
                          },
                        })
                      }}><StarOutlined /></button>
                    )}
                  </div>
                ))}
              </div>
              )
            })}
            {!visibleGroups.length ? (
              <div className="empty-card" style={{ marginTop: 0, boxShadow: 'none' }}>
                <AppIcon name="icon-schedule-empty" size={42} />
                <h2>{archived ? '没有归档课表' : '还没有课表'}</h2>
                <p>{archived ? '归档后的课表会出现在这里。' : '创建一张课表后，就可以按周排课。'}</p>
              </div>
            ) : null}
            </>}
            </div>
          </div>
        </section>
        <section className="work-card schedule-board-card">
          {groupsLoading ? <div className="schedule-board-loading" aria-label="课表内容加载中"><Skeleton active title={{ width: '28%' }} paragraph={{ rows: 7, width: ['100%', '96%', '100%', '92%', '100%', '95%', '88%'] }} /></div> : current ? (
            <>
              <div className="tt-head-panel">
              <div className="tt-toolbar">
                {current.isWeekly === 0 && current.startDate && current.endDate ? (
                  <div className="tt-summary tt-toolbar-summary">
                    <span className="tt-range">{current.startDate.slice(0, 10)} 至 {current.endDate.slice(0, 10)}{timetableWeeks(current.startDate, current.endDate) ? ` · 共${timetableWeeks(current.startDate, current.endDate)}周` : ''}</span>
                  </div>
                ) : null}
                {templateMode ? null : (
                <div className="tt-week">
                  <Button
                    className="tt-week-arrow"
                    type="text"
                    icon={<LeftOutlined />}
                    aria-label="上一周"
                    title="上一周"
                    disabled={!limits.canPrev}
                    onClick={() => limits.canPrev && setWeekStart(addDays(weekStart, -7))}
                  />
                  <strong>{weekStart.slice(5)} 起</strong>
                  <Button
                    className="tt-week-arrow"
                    type="text"
                    icon={<RightOutlined />}
                    aria-label="下一周"
                    title="下一周"
                    disabled={!limits.canNext}
                    onClick={() => limits.canNext && setWeekStart(addDays(weekStart, 7))}
                  />
                </div>
                )}
                {current.isWeekly === 1 ? (
                  <div className="tt-modes tt-toolbar-modes">
                    <button type="button" className={mode === 'instance' ? 'is-on' : ''} onClick={() => switchBoardMode('instance')}>{weekChipLabel(weekStart)}</button>
                    <button type="button" className={mode === 'template' ? 'is-on' : ''} onClick={() => switchBoardMode('template')}>固定课表</button>
                  </div>
                ) : null}
                {current.isWeekly === 1 && !templateMode ? (
                  <div className="tt-legend tt-toolbar-legend">
                    <span className="is-added"><i />新增</span>
                    <span className="is-modified"><i />修改</span>
                    <span className="is-cancel"><i />请假/取消</span>
                    <span className="is-occupy"><i />占用</span>
                  </div>
                ) : null}
                <span className="tt-toolbar-spacer" />
                <Dropdown
                  menu={{
                    items: [
                      { key: 'create', label: selecting ? '退出批量排课' : '批量排课' },
                      { key: 'delete', label: deleting ? '退出批量删除' : '批量删除', danger: true },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'create') {
                        const next = !selecting
                        setSelecting(next)
                        setDeleting(false)
                        setBatch([])
                        setDeleteIds([])
                        if (next) message.info('请选择要排课的空白时间段')
                        return
                      }
                      onTimetableMenu('batch').catch((error) => message.error(tell(error, '操作失败')))
                    },
                  }}
                >
                  <Button type={selecting || deleting ? 'primary' : 'default'}>批量</Button>
                </Dropdown>
                {deleting ? <span className="range-label">正在选择要删除的课程</span> : null}
                <Dropdown
                  menu={{
                    items: [
                      ...(archived ? [] : [
                        { key: 'edit', label: '修改课表' },
                        {
                          key: 'copy-menu',
                          label: '复制',
                          children: [
                            { key: 'copy', label: '直接复制' },
                            { key: 'create-from', label: '基于当前课表修改创建' },
                          ],
                        },
                        ...(Number(current.isDefault) === 1 ? [] : [{ key: 'default', label: '设为活动课表' }]),
                      ]),
                      { key: 'archive', label: archived ? '恢复' : '归档' },
                      { key: 'delete', label: '删除', danger: true },
                    ],
                    onClick: ({ key }) => {
                      onTimetableMenu(key).catch((error) => message.error(tell(error, '操作失败')))
                    },
                  }}
                >
                  <Button>课表操作</Button>
                </Dropdown>
              </div>
              {campusLegend.length > 1 ? (
              <section className="tt-support-panel">
                {campusLegend.length > 1 ? (
                  <div className="tt-campus-legend">
                    <b>校区筛选</b>
                    {campusLegend.map((item) => {
                      const on = activeCampusId === item.id
                      const muted = activeCampusId > 0 && !on
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={on ? 'is-on' : muted ? 'is-muted' : ''}
                          onClick={() => setCampusFilter(on ? 0 : item.id)}
                        >
                          <i className={`tone-${item.tone}`} />
                          {item.name}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </section>
              ) : null}
              </div>
              {splitWeekend ? (
                <Tabs
                  className="tabs-nav-only"
                  activeKey={dayBand}
                  onChange={(key) => setDayBand(key as 'work' | 'weekend')}
                  items={[{ key: 'work', label: '周中' }, { key: 'weekend', label: '周末' }]}
                />
              ) : null}
              {placement ? (
                <div className="tt-modebar">
                  <span>
                    {placement.kind === 'move'
                      ? (placement.targets[0] ? `移动到周${DAY_LABELS[placement.targets[0].day - 1]} ${placement.targets[0].start}-${placement.targets[0].end}` : '请选择要移动到的时间段')
                      : (placement.targets.length ? `已选择 ${placement.targets.length} 个复制位置` : '请选择要复制到的空白单元格')}
                  </span>
                  <button type="button" onClick={() => setPlacement(null)}>{placement.kind === 'move' ? '取消移动' : '取消复制'}</button>
                  <button
                    type="button"
                    disabled={!placement.schedule.id || !placement.targets.length}
                    onClick={async () => {
                      if (!placement.schedule.id || !placement.targets.length) {
                        message.info(placement.kind === 'move' ? '请选择要移动到的时间段' : '请选择目标位置')
                        return
                      }
                      try {
                        if (placement.kind === 'move') {
                          const target = placement.targets[0]
                          await moveSchedule(placement.schedule, { ...target, date: mode === 'template' ? '' : target.date })
                          message.success(`已移动到周${DAY_LABELS[target.day - 1]} ${target.start}-${target.end}`)
                        } else {
                          await copySchedule(placement.schedule, placement.targets.map((target) => ({ ...target, date: mode === 'template' ? '' : target.date })))
                          message.success(`已复制 ${placement.targets.length} 处`)
                        }
                        setPlacement(null)
                        await loadWeek()
                      } catch (error) {
                        message.error(tell(error, placement.kind === 'move' ? '移动失败' : '复制失败'))
                      }
                    }}
                  >{placement.kind === 'move' ? '确认移动' : '确认复制'}</button>
                </div>
              ) : null}
              {splitHead ? (
                <div className="tt-split-head">
                  <strong>{splitHead.title}</strong>
                  {splitHead.subtitle ? <span>{splitHead.subtitle}</span> : null}
                </div>
              ) : null}
              {!boardDays.length || !slots.length ? <p>这一档还没有可排的日期或时段。</p> : (
              <div className="tt-board">
                <div className="tt-grid" style={{ ['--days' as string]: boardDays.length, ['--rows' as string]: slots.length }}>
                  <button type="button" className="tt-corner" style={{ gridColumn: 1, gridRow: 1 }} onClick={() => openOverview().catch((error) => message.error(tell(error, '总览加载失败')))}>
                    <b>总览</b>
                    <small>{boardHoursText(boardSchedules)}</small>
                  </button>
                  {boardDays.map((day, column) => {
                    const date = addDays(weekStart, day - 1)
                    return (
                      <button
                        className={!templateMode && date === todayIso() ? 'tt-dayhead is-today' : 'tt-dayhead'}
                        key={day}
                        type="button"
                        style={{ gridColumn: column + 2, gridRow: 1 }}
                        onClick={() => {
                          if (templateMode || selecting || deleting || placement) return
                          openDay(date, day).catch((error) => message.error(tell(error, '当日课程加载失败')))
                        }}
                      >
                        <strong>周{DAY_LABELS[day - 1]}</strong>
                        {templateMode ? null : <small>{date.slice(5)}</small>}
                      </button>
                    )
                  })}
                  {slots.map((slot, row) => <div className="tt-time" key={slot.start} style={{ gridColumn: 1, gridRow: row + 2 }}>{slot.start}</div>)}
                  {boardDays.map((day, column) => {
                    const date = addDays(weekStart, day - 1)
                    const own = boardSchedules.filter((item) => templateMode ? item.dayOfWeek === day : (item.scheduleDate ? item.scheduleDate === date : item.dayOfWeek === day))
                    const shown = activeCampusId
                      ? own.filter((lesson) => Number(lesson.uiChangeStatus || 0) === 4 || Number(lesson.campusId || 0) === activeCampusId)
                      : own
                    return (
                      <div className={!templateMode && date === todayIso() ? 'tt-day is-today' : 'tt-day'} key={day} style={{ gridColumn: column + 2, gridRow: `2 / span ${slots.length}` }}>
                        {slots.map((slot) => {
                          const key = `${date} ${slot.start}`
                          const covered = own.find((lesson) => lessonOverlaps(lesson, day, date, slot.start, slot.end))
                          return (
                            <button
                              key={key}
                              type="button"
                              className={['tt-slot', selecting && batch.includes(batchKey(date, slot.start, slot.end)) ? 'is-picked' : '', placement?.targets.some((item) => item.date === date && item.start === slot.start) ? 'is-target' : ''].filter(Boolean).join(' ')}
                              onDragOver={(event) => {
                                if (archived || Number(current.status) === 2) return
                                event.preventDefault()
                                const lesson = boardSchedules.find((item) => scheduleInstanceKey(item) === dragLessonKey.current)
                                if (!lesson) return
                                const start = pointerStart(event.clientY, event.currentTarget, slot)
                                const next = dragPlacement(lesson, { day, date, start, end: slot.end }, slots, boardSchedules)
                                if (next.problem) {
                                  setDragHover(null)
                                  return
                                }
                                const hover = { day, date, start, end: next.endTime, name: lesson.displayName || lesson.courseName || '该排课' }
                                setDragHover((currentHover) => currentHover && currentHover.date === hover.date && currentHover.start === hover.start && currentHover.end === hover.end ? currentHover : hover)
                              }}
                              onDrop={(event) => {
                                event.preventDefault()
                                dragGuard.current = true
                                window.setTimeout(() => { dragGuard.current = false }, 0)
                                setDragHover(null)
                                if (archived || Number(current.status) === 2) {
                                  message.warning('归档课表不能修改排课')
                                  return
                                }
                                const lessonKey = event.dataTransfer.getData('text/plain') || dragLessonKey.current
                                const lesson = boardSchedules.find((item) => scheduleInstanceKey(item) === lessonKey)
                                if (!lesson?.id) return
                                const start = pointerStart(event.clientY, event.currentTarget, slot)
                                const dropped = dragPlacement(lesson, { day, date, start, end: slot.end }, slots, boardSchedules)
                                if (dropped.problem) {
                                  message.warning(dropped.problem)
                                  return
                                }
                                setDragAction({
                                  schedule: lesson,
                                  name: lesson.displayName || lesson.courseName || '该排课',
                                  sourceLabel: `周${DAY_LABELS[(lesson.dayOfWeek || day) - 1] || ''} ${clockText(lesson.startTime)}-${clockText(lesson.endTime)}`,
                                  targetLabel: `周${DAY_LABELS[day - 1]} ${start}-${dropped.endTime}`,
                                  canCopy: dropped.canCopy,
                                  target: { date, start, end: dropped.endTime, day },
                                })
                              }}
                              onClick={() => {
                                if (dragGuard.current) return
                                if (covered) {
                                  if (deleting) message.warning('请选择有内容的单元格')
                                  else if (selecting) message.warning('批量排课时请选择空白时间段')
                                  else if (placement) message.warning('请选择完整空白单元格')
                                  return
                                }
                                if (placement?.schedule.id) {
                                  const minutes = toMinutes(slot.end) - toMinutes(slot.start)
                                  if (minutes >= 60 && blankSegments(slot, own).length === 0) return
                                  choosePlacement(day, date, slot.start, own)
                                  return
                                }
                                if (selecting && !deleting) {
                                  const minutes = toMinutes(slot.end) - toMinutes(slot.start)
                                  if (minutes >= 60 && blankSegments(slot, own).length === 0) return
                                  setBatch(toggleBatchRange(batch, date, slot.start, slot.end))
                                  return
                                }
                                if (deleting) {
                                  message.warning('请选择有内容的单元格')
                                  return
                                }
                                if (archived || Number(current.status) === 2) {
                                  message.warning('归档课表不能修改排课')
                                  return
                                }
                                setCell({
                                  day,
                                  date,
                                  start: slot.start,
                                  end: slot.end,
                                  slotStart: slot.start,
                                  slotEnd: slot.end,
                                  echo: templateMode ? undefined : templateEchoForCell(day, date, slot.start, undefined, schedules, templateSchedules),
                                })
                              }}
                            >
                            </button>
                          )
                        })}
                        {selecting || placement ? slots.flatMap((slot) => {
                          if (own.some((lesson) => lessonOverlaps(lesson, day, date, slot.start, slot.end))) return []
                          if (blankSegments(slot, own).length) return []
                          const minutes = toMinutes(slot.end) - toMinutes(slot.start)
                          if (minutes < 60) return []
                          const half = fromMinutes(toMinutes(slot.start) + Math.floor(minutes / 2))
                          const dayEnd = slots[slots.length - 1]?.end || slot.end
                          const sourceDuration = placement
                            ? Math.max(30, toMinutes(clockText(placement.schedule.endTime)) - toMinutes(clockText(placement.schedule.startTime)))
                            : 0
                          const roomFrom = (start: string) => freeUntil(start, own, placement?.schedule.id, dayEnd) - toMinutes(start)
                          const halves = placement
                            ? [{ start: slot.start, end: half }, ...(roomFrom(half) >= sourceDuration ? [{ start: half, end: slot.end }] : [])]
                            : [{ start: slot.start, end: half }, { start: half, end: slot.end }]
                          const halfButtons = halves.map((range) => {
                            const frame = rangeFrame(range.start, range.end, slots)
                            const picked = selecting && batch.includes(batchKey(date, range.start, range.end))
                            const placed = !!placement?.targets.some((item) => item.date === date && item.start === range.start)
                            return (
                              <button
                                key={`${date}-half-${range.start}`}
                                type="button"
                                className={picked ? 'tt-batch-half is-picked' : placed ? 'tt-batch-half is-target' : 'tt-batch-half'}
                                aria-label={`${range.start}-${range.end}`}
                                style={{ top: frame.top, height: frame.height }}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (placement) choosePlacement(day, date, range.start, own)
                                  else setBatch(toggleBatchRange(batch, date, range.start, range.end))
                                }}
                              />
                            )
                          })
                          if (placement) return halfButtons
                          const spanEndMin = toMinutes(half) + 60
                          const spanEnd = fromMinutes(spanEndMin)
                          if (freeUntil(half, own, undefined, dayEnd) < spanEndMin) return halfButtons
                          const anchor = rangeFrame(half, slot.end, slots)
                          return halfButtons.concat(
                            <button
                              key={`${date}-span-${half}`}
                              type="button"
                              className={batch.includes(batchKey(date, half, spanEnd)) ? 'tt-batch-span is-picked' : 'tt-batch-span'}
                              aria-label={`${half}-${spanEnd}`}
                              style={{ top: anchor.top + anchor.height - 20, right: 8 }}
                              onClick={(event) => {
                                event.stopPropagation()
                                setBatch(toggleBatchRange(batch, date, half, spanEnd))
                              }}
                            />,
                          )
                        }) : null}
                        {slots.flatMap((slot) => blankSegments(slot, own).map((segment) => {
                          const frame = rangeFrame(segment.start, segment.end, slots)
                          return (
                            <button
                              key={`${date}-${segment.start}-${segment.end}`}
                              type="button"
                              className={selecting && batch.includes(batchKey(date, segment.start, segment.end)) ? 'tt-blank is-picked' : placement?.targets.some((item) => item.date === date && item.start === segment.start) ? 'tt-blank is-target' : 'tt-blank'}
                              aria-label={`${segment.start}-${segment.end}`}
                              style={{ top: frame.top, height: frame.height }}
                              onClick={() => {
                                if (dragGuard.current) return
                                if (deleting) {
                                  message.warning('请选择有内容的单元格')
                                  return
                                }
                                if (selecting) {
                                  setBatch(toggleBatchRange(batch, date, segment.start, segment.end))
                                  return
                                }
                                if (placement) {
                                  choosePlacement(day, date, segment.start, own, true)
                                  return
                                }
                                if (archived || Number(current.status) === 2) {
                                  message.warning('归档课表不能修改排课')
                                  return
                                }
                                setCell({
                                  day,
                                  date,
                                  start: segment.start,
                                  end: segment.end,
                                  slotStart: segment.start,
                                  slotEnd: segment.end,
                                  echo: templateMode ? undefined : templateEchoForCell(day, date, segment.start, undefined, schedules, templateSchedules),
                                })
                              }}
                            />
                          )
                        }))}
                        {dragHover && dragHover.date === date ? (
                          <div className="tt-place" data-range={`${dragHover.start}-${dragHover.end}`} style={rangeFrame(dragHover.start, dragHover.end, slots)}>
                            <b>{dragHover.name}</b>
                            <small>{dragHover.start}-{dragHover.end}</small>
                          </div>
                        ) : null}
                        {placement ? placement.targets.filter((item) => item.date === date).map((item) => {
                          const frame = rangeFrame(item.start, item.end, slots)
                          return (
                            <div key={`place-${item.start}`} className="tt-place" data-range={`${item.start}-${item.end}`} style={{ top: frame.top, height: frame.height }}>
                              <b>{placement.schedule.displayName || placement.schedule.courseName}</b>
                              <small>{item.start}-{item.end}</small>
                            </div>
                          )
                        }) : null}
                        {templateMode ? null : cancelledTemplates(day, date, own, templateSchedules).map((lesson) => {
                          const frame = cardFrame(lesson, slots)
                          return (
                            <div
                              key={`cancel-${lesson.id}`}
                              className="tt-cancel"
                              aria-label="已删除的固定课表时段"
                              style={{ top: Math.max(2, frame.top - 2), height: frame.height + 4 }}
                            />
                          )
                        })}
                        {shown.map((lesson) => {
                          const frame = cardFrame(lesson, slots)
                          const detail = templateMode ? { mark: '' as const, added: [], modified: [] } : compareDetail(lesson, templateSchedules.filter((item) => Number(item.dayOfWeek) === day))
                          const partial = detail.added.length > 0 && detail.modified.length > 0
                          const lessonStart = toMinutes(clockText(lesson.startTime))
                          const lessonEnd = toMinutes(clockText(lesson.endTime))
                          const span = Math.max(lessonEnd - lessonStart, 1)
                          return (
                            <button
                              key={scheduleInstanceKey(lesson)}
                              type="button"
                              className={lessonClass(lesson, `${deleting && deleteIds.includes(scheduleInstanceKey(lesson)) ? ' is-picked' : ''}${placement?.schedule && scheduleInstanceKey(placement.schedule) === scheduleInstanceKey(lesson) ? ' is-source' : ''}${!partial && detail.mark ? ` is-${detail.mark}` : ''}`)}
                              style={{ top: frame.top, height: frame.height }}
                              draggable={!archived && Number(current.status) !== 2 && lesson.uiChangeStatus !== 4}
                              onDragStart={(event) => {
                                if (lesson.uiChangeStatus === 4) {
                                  event.preventDefault()
                                  return
                                }
                                dragGuard.current = true
                                dragLessonKey.current = scheduleInstanceKey(lesson)
                                event.dataTransfer.setData('text/plain', dragLessonKey.current)
                                event.dataTransfer.effectAllowed = 'copyMove'
                              }}
                              onDragEnd={() => {
                                dragLessonKey.current = ''
                                setDragHover(null)
                                window.setTimeout(() => { dragGuard.current = false }, 0)
                              }}
                              onContextMenu={(event) => {
                                if (Number(lesson.uiChangeStatus) !== 3 || !lesson.id || archived || Number(current.status) === 2) return
                                event.preventDefault()
                                const scheduleId = lesson.id
                                Modal.confirm({
                                  title: '销假',
                                  content: '确认恢复这个请假时间段吗？',
                                  okText: '销假',
                                  cancelText: '取消',
                                  onOk: async () => {
                                    await postJson(`/schedules/${scheduleId}/restore`)
                                    message.success('已销假')
                                    await loadWeek()
                                  },
                                })
                              }}
                              onClick={() => {
                                if (dragGuard.current) return
                                if (selecting && !deleting) {
                                  message.warning('批量排课时请选择空白时间段')
                                  return
                                }
                                if (placement) {
                                  message.warning(placement.kind === 'copy' ? '复制时请选择空白单元格' : '移动时请选择空白单元格')
                                  return
                                }
                                if (deleting && lesson.id != null) {
                                  const key = scheduleInstanceKey(lesson)
                                  setDeleteIds(deleteIds.includes(key) ? deleteIds.filter((id) => id !== key) : [...deleteIds, key])
                                  return
                                }
                                if (archived || Number(current.status) === 2) {
                                  message.warning('归档课表不能修改排课')
                                  return
                                }
                                setCell({
                                  day,
                                  date,
                                  start: clockText(lesson.startTime),
                                  end: clockText(lesson.endTime),
                                  slotStart: slotContaining(clockText(lesson.startTime), slots)?.start,
                                  slotEnd: slotContaining(clockText(lesson.startTime), slots)?.end,
                                  schedule: lesson,
                                  echo: templateMode ? undefined : templateEchoForCell(day, date, clockText(lesson.startTime), lesson, schedules, templateSchedules),
                                })
                              }}
                            >
                              {partial ? [...detail.added.map((range) => (
                                <i key={`add-${range.start}`} className="tt-compare is-added" style={{ top: `${((range.start - lessonStart) / span) * 100}%`, height: `${((range.end - range.start) / span) * 100}%` }} />
                              )), ...detail.modified.map((range) => (
                                <i key={`mod-${range.start}`} className="tt-compare is-modified" style={{ top: `${((range.start - lessonStart) / span) * 100}%`, height: `${((range.end - range.start) / span) * 100}%` }} />
                              ))] : null}
                              <b className={campusLegend.length > 1 && Number(lesson.campusId || 0) > 0 && lesson.uiChangeStatus !== 4 ? `campus-tone-${campusLegend.find((item) => item.id === Number(lesson.campusId))?.tone ?? 0}` : undefined}>{lesson.uiChangeStatus === 4 ? '占用' : lesson.displayName || lesson.courseName}</b>
                              {lesson.uiChangeStatus !== 4 ? <small>{[lesson.coachName, clockText(lesson.startTime), clockText(lesson.endTime)].filter(Boolean).join(' ')}</small> : null}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
              )}
              {deleting ? (
                deleteIds.length ? (
                  <Popconfirm
                    title="批量删除排课"
                    description={`确认删除已选择的 ${deleteIds.length} 节课吗？`}
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      try {
                        for (const id of deleteIds) {
                          const schedule = boardSchedules.find((item) => scheduleInstanceKey(item) === id)
                          if (schedule) await removeSchedule(schedule)
                        }
                        message.success(`已删除 ${deleteIds.length} 节课`)
                        setDeleteIds([])
                        setDeleting(false)
                        await loadWeek()
                      } catch (error) {
                        message.error(tell(error, '批量删除失败'))
                      }
                    }}
                  >
                    <Button danger style={{ marginTop: 12 }}>批量删除</Button>
                  </Popconfirm>
                ) : (
                  <Button danger style={{ marginTop: 12 }} onClick={() => message.warning('请选择要删除的课时')}>批量删除</Button>
                )
              ) : null}
              {selecting ? (
                <Button style={{ marginTop: 12 }} type="primary" onClick={() => {
                  if (!batch.length) {
                    message.warning('请先选择空白时间段')
                    return
                  }
                  const occupied = batch.some((item) => {
                    const parsed = parseBatchKey(item)
                    const day = days.find((value) => addDays(weekStart, value - 1) === parsed.date) || 1
                    return schedules.some((lesson) => lessonOverlaps(lesson, day, parsed.date, parsed.start, parsed.end || fromMinutes(toMinutes(parsed.start) + 1)))
                  })
                  if (occupied) {
                    message.warning('批量排课时请选择空白时间段')
                    return
                  }
                  const ranges = mergeRanges(batch.map((item) => {
                    const parsed = parseBatchKey(item)
                    const day = days.find((value) => addDays(weekStart, value - 1) === parsed.date) || 1
                    return { day, date: parsed.date, start: parsed.start, end: parsed.end || parsed.start }
                  }))
                  setCell({ ...ranges[0], slotStart: ranges[0].start, slotEnd: ranges[0].end, schedule: undefined })
                  setBatch(ranges.map((item) => batchKey(item.date, item.start, item.end)))
                  message.info(`连续时段已合并成 ${ranges.length} 段，确认后一次排课`)
                }}>{batch.length ? `排课 ${batch.length} 段` : '排课'}</Button>
              ) : null}
            </>
          ) : (
            <div className="schedule-board-empty">
              <span className="schedule-board-empty-icon"><AppIcon name="icon-schedule-empty" size={38} /></span>
              <h2>{archived ? '暂无归档课表' : '暂无可查看的课表'}</h2>
              <p>{archived ? '课表归档后，可从左侧选择并查看历史安排。' : '新建课表后，可在这里查看并安排每周课程。'}</p>
            </div>
          )}
        </section>
      </div>
      <ScheduleDialogs vm={vm} />
    </NeedCampus>
  )
}
