import { Modal, Tabs, message } from 'antd'
import { delJson, getJson, postJson } from '../api/biz'
import { tell } from './kit'
import type { Schedule } from './schedule-model'
import { addDays, clockText, timetableShowsWeekday } from './schedule-board-helpers'
import { mergeRanges, parseBatchKey } from './schedule-board-fields'
import { LookupTable, overviewDateSections, overviewStudentCount, overviewStudentSections } from './schedule-overview'
import { CreateTimetable, EditTimetableForm, schedulableCampuses } from './schedule-timetable-forms'
import { CellDialog } from './schedule-cell-dialog'
import { DayScheduleDialog } from './schedule-day-dialog'
import type { useScheduleController } from './schedule-controller'

export function ScheduleDialogs({ vm }: { vm: ReturnType<typeof useScheduleController> }) {
  const { setSelecting, current, weekStart, mode, templateSchedules, creating, setCreating, createSource, setCreateSource, editing, setEditing, cell, setCell, setPlacement, batch, setBatch, setDeleting, overview, setOverview, dayDialog, setDayDialog, lookup, setLookup, dragAction, setDragAction, shell, campusId, campusName, managesCampus, timetableLocked, days, templateMode, boardSchedules, slots, loadGroups, loadWeek, saveCell, removeSchedule, leaveSchedule, moveSchedule, copySchedule } = vm
  return (
    <>
      <CreateTimetable
        open={creating}
        campusId={campusId || 0}
        manager={managesCampus}
        selfMemberId={Number(shell.user?.orgMemberId || 0)}
        source={createSource}
        onClose={() => { setCreating(false); setCreateSource(null) }}
        onSaved={(id) => { setCreating(false); setCreateSource(null); loadGroups(id).catch(() => undefined) }}
      />
      <Modal title="编辑课表" open={editing} onCancel={() => setEditing(false)} footer={null} destroyOnHidden>
        {current ? (
          <EditTimetableForm
            current={current}
            locked={timetableLocked}
            campusId={campusId || 0}
            onSaved={async () => {
              setEditing(false)
              await loadGroups(current.id)
            }}
          />
        ) : null}
      </Modal>
      <CellDialog
        cell={cell}
        campusId={campusId || 0}
        campusName={campusName}
        campuses={shell.campuses}
        schedulableCampuses={schedulableCampuses(shell.campuses, current?.createByMemberCampusIds)}
        ownerName={current?.createByMemberName || '当前课表老师'}
        coachMemberId={current?.createByMemberId}
        allowTrial={mode === 'instance'}
        batchCount={batch.length}
        timetableId={current?.id}
        weekStart={weekStart}
        dayLessons={cell ? boardSchedules.filter((item) => templateMode ? item.dayOfWeek === cell.day : (item.scheduleDate ? item.scheduleDate === cell.date : item.dayOfWeek === cell.day)) : []}
        dayStart={slots[0]?.start || '09:00'}
        dayEnd={slots[slots.length - 1]?.end || '18:00'}
        onClose={() => setCell(null)}
        onSave={async (values) => {
          const ranges = batch.length > 1
            ? mergeRanges(batch.map((item) => {
              const parsed = parseBatchKey(item)
              const day = days.find((value) => addDays(weekStart, value - 1) === parsed.date) || 1
              return { day, date: parsed.date, start: parsed.start, end: parsed.end || parsed.start }
            }))
            : cell ? [{ day: cell.day, date: cell.date, start: values.startTime || cell.start, end: values.endTime || cell.end, schedule: cell.schedule }] : []
          const problem = clockText(values.startTime) && clockText(values.endTime) && clockText(values.startTime) >= clockText(values.endTime)
            ? '结束时间必须晚于开始时间'
            : ''
          if (problem) {
            message.warning(problem)
            return
          }
          if (Number(current?.isWeekly) === 1 && ranges.some((range) => !range.day)) {
            message.warning('请选择星期')
            return
          }
          if (Number(current?.isWeekly) !== 1 && ranges.some((range) => !range.date)) {
            message.warning('请选择日期')
            return
          }
          if (ranges.some((range) => !timetableShowsWeekday(current, range.day))) {
            message.warning('当前课表不显示该星期')
            return
          }
          await saveCell(values, ranges)
          message.success(values.occupy ? '已占用' : cell?.schedule?.id ? '已保存' : ranges.length > 1 ? `已批量排课 ${ranges.length} 节` : '添加成功')
          setCell(null)
          setBatch([])
          setSelecting(false)
          await loadWeek()
        }}
        onLeave={async () => {
          if (!cell?.schedule?.id) return
          const name = cell.schedule.displayName || cell.schedule.courseName || '原排课'
          const scheduleId = cell.schedule.id
          await leaveSchedule(cell.schedule)
          message.success('已请假')
          await loadWeek()
          setCell({ day: cell.day, date: cell.date, start: cell.start, end: cell.end, slotStart: cell.slotStart, slotEnd: cell.slotEnd, echo: { name, status: 'leave', scheduleId } })
        }}
        onRestore={async () => {
          if (!cell || !current) return
          if (cell.echo?.status === 'delete') {
            const template = templateSchedules.find((item) => Number(item.dayOfWeek) === cell.day && clockText(item.startTime) === cell.start)
            if (!template?.id) {
              message.warning('未找到可恢复的原课时')
              return
            }
            const override = cell.schedule
            if (override?.id && override.scheduleDate && Number(override.templateScheduleId || 0) !== Number(override.id)) {
              await delJson(`/schedules/${override.id}`)
            } else {
              await postJson('/schedules/cell', {
                timetableId: current.id,
                templateScheduleId: template.id,
                instanceMode: true,
                dayOfWeek: cell.day,
                scheduleDate: cell.date,
                startTime: clockText(template.startTime),
                endTime: clockText(template.endTime),
                courseName: template.courseName,
                targetType: template.targetType,
                targetId: template.targetId,
                note: template.note || '',
                campusId: template.campusId || campusId,
              })
            }
            message.success('已恢复原课时')
            setCell(null)
            await loadWeek()
            return
          }
          const scheduleId = cell.schedule?.id || cell.echo?.scheduleId
          if (!scheduleId) return
          await postJson(`/schedules/${scheduleId}/restore`)
          message.success('已销假')
          await loadWeek()
          const fresh = (await getJson<Schedule[]>(`/schedules/timetable/${current.id}/week`, { weekStart })).find((item) => item.id === scheduleId)
          setCell(fresh ? { ...cell, start: clockText(fresh.startTime) || cell.start, end: clockText(fresh.endTime) || cell.end, schedule: fresh, echo: undefined } : null)
        }}
        onDelete={async () => {
          if (!cell?.schedule?.id) return
          const occupied = cell.schedule.uiChangeStatus === 4
          await removeSchedule(cell.schedule)
          message.success(occupied ? '占用标识删除成功' : '已删除')
          setCell(null)
          await loadWeek()
        }}
        onBeginMove={() => {
          if (!cell?.schedule?.id) return
          setPlacement({ kind: 'move', schedule: cell.schedule, targets: [] })
          setCell(null)
          setSelecting(false)
          setDeleting(false)
          message.info('请选择目标单元格')
        }}
        onBeginCopy={() => {
          if (!cell?.schedule?.id) return
          setPlacement({ kind: 'copy', schedule: cell.schedule, targets: [] })
          setCell(null)
          setSelecting(false)
          setDeleting(false)
          message.info('请选择要复制到的空白单元格')
        }}
        onStudent={async (action, studentId) => {
          if (!cell?.schedule?.id) return null
          if (action === 'add') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}`)
          if (action === 'remove') await delJson(`/schedules/${cell.schedule.id}/students/${studentId}`)
          if (action === 'leave') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}/leave`, {})
          if (action === 'restore') await postJson(`/schedules/${cell.schedule.id}/students/${studentId}/restore`)
          await loadWeek()
          const fresh = (await getJson<Schedule[]>(`/schedules/timetable/${current?.id}/week`, { weekStart })).find((item) => item.id === cell.schedule?.id)
          setCell({ ...cell, schedule: fresh })
          return fresh || null
        }}
      />
      <Modal title={dragAction?.canCopy ? '选择复制还是移动' : '确认移动位置'} open={!!dragAction} onCancel={() => setDragAction(null)} footer={null} destroyOnHidden>
        {dragAction ? (
          <div>
            <strong>{dragAction.name}</strong>
            <div className="drag-route">
              <article>
                <span>原时间</span>
                <strong>{dragAction.sourceLabel}</strong>
              </article>
              <em>→</em>
              <article>
                <span>目标时间</span>
                <strong>{dragAction.targetLabel}</strong>
              </article>
            </div>
            <div className={dragAction.canCopy ? 'drag-options' : 'drag-options is-single'}>
              {dragAction.canCopy ? (
                <button type="button" className="is-copy" onClick={async () => {
                  try {
                    await copySchedule(dragAction.schedule, [dragAction.target])
                    message.success(`已复制到${dragAction.targetLabel}`)
                    setDragAction(null)
                    await loadWeek()
                  } catch (error) {
                    message.error(tell(error, '复制失败'))
                  }
                }}>复制</button>
              ) : null}
              <button type="button" className="is-move" onClick={async () => {
                try {
                  await moveSchedule(dragAction.schedule, dragAction.target)
                  message.success(`已移动到${dragAction.targetLabel}`)
                  setDragAction(null)
                  await loadWeek()
                } catch (error) {
                  message.error(tell(error, '移动失败'))
                }
              }}>移动</button>
              <button type="button" className="is-cancel" onClick={() => setDragAction(null)}>取消</button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal title={current?.isWeekly === 1 && mode === 'template' ? '固定课表学员总览' : '本周学员总览'} open={!!overview} onCancel={() => setOverview(null)} footer={null} width={760}>
        <p className="range-label">{current?.isWeekly === 1 && mode === 'template' ? '固定课表' : `${weekStart} 至 ${addDays(weekStart, 6)}`}</p>
        <div className="stat-line">
          <span>上课安排<strong>{(overview || []).length}</strong><em>节</em></span>
          <span>学员<strong>{overviewStudentCount(overview || [])}</strong><em>位</em></span>
        </div>
        {(overview || []).length ? (
        <Tabs items={[
          {
            key: 'date',
            label: '按日期',
            children: (
              <div className="overview-sections">
                {overviewDateSections(overview || []).map((section) => (
                  <section key={section.key}>
                    <header>
                      {section.dateLabel ? <b>{section.dateLabel}</b> : null}
                      {section.weekdayLabel ? <span>{section.weekdayLabel}</span> : null}
                      <em>{section.countText}</em>
                    </header>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item.key}>
                          <span>{item.name}<small>{item.type}</small></span>
                          <time>{item.time}</time>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ),
          },
          {
            key: 'student',
            label: '按学员',
            children: (
              <div className="overview-sections">
                {overviewStudentSections(overview || []).map((section) => (
                  <section key={section.key}>
                    <header>
                      <b>{section.name}</b>
                      <span>{section.type}</span>
                      <em>{section.countText}</em>
                    </header>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item.key}>
                          <span>{item.weekdayLabel}</span>
                          <time>{item.time}</time>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ),
          },
        ]} />
        ) : <p>本周暂无上课安排。当前查看周还没有学员排课，后续新增后会自动出现在这里。</p>}
      </Modal>
      <Modal title="当日课程" open={!!dayDialog} onCancel={() => setDayDialog(null)} footer={null} width={760} destroyOnHidden>
        {dayDialog ? <DayScheduleDialog dialog={dayDialog} timetableName={current?.name || '课表详情'} onChange={setDayDialog} /> : null}
      </Modal>
      <Modal title="课程排课" open={!!lookup} onCancel={() => setLookup(null)} footer={null} width={760}>
        <Tabs items={[
          {
            key: 'week',
            label: '本周',
            children: <LookupTable rows={(lookup || []).filter((item) => item.note === '本周')} />,
          },
          {
            key: 'all',
            label: '全部',
            children: <LookupTable rows={(lookup || []).filter((item) => item.note !== '本周')} />,
          },
        ]} />
      </Modal>
    </>
  )
}
