import { Modal, Select, Switch, message } from 'antd'
import { AppIcon, tell } from './kit'
import type { Schedule } from './schedule-model'
import { cardSummary, courseMembersWarning, courseTargetWarning, hoursAmount, scheduleHoursLabel, scheduleInstanceCardLabel, studentHoursExpired, studentScheduleBlock } from './schedule-targets'
import { DAY_LABELS, clockText, durationLabel, fromMinutes, genderIconName, toMinutes } from './schedule-board-helpers'
import { useCellDialogController } from './schedule-cell-controller'

export interface CellDialogProps {
cell: { day: number; date: string; start: string; end: string; slotStart?: string; slotEnd?: string; schedule?: Schedule; echo?: { name: string; status: 'leave' | 'delete'; scheduleId: number; time?: string } } | null
campusId: number
campusName: string
campuses: Array<{ id: number; name: string }>
schedulableCampuses: Array<{ id: number; name: string }>
ownerName: string
coachMemberId?: number
allowTrial: boolean
batchCount: number
timetableId?: number
weekStart: string
dayLessons: Schedule[]
dayStart: string
dayEnd: string
onClose: () => void
onSave: (values: { courseName: string; targetType?: string; targetId?: number; coachIds?: number[]; note?: string; studentCardId?: number; studentId?: number; pricingStudentGroupId?: number; pricingCourseType?: string; serviceQuantity?: number; memberCardBindings?: Array<{ studentId: number; studentCardId: number }>; excludedStudentIds?: number[]; occupy?: boolean; startTime?: string; endTime?: string; campusId?: number }) => Promise<void>
onLeave: () => Promise<void>
onRestore: () => Promise<void>
onDelete: () => Promise<void>
onBeginMove: () => void
onBeginCopy: () => void
onStudent: (action: 'add' | 'remove' | 'leave' | 'restore', studentId: number) => Promise<Schedule | null>
}

export function CellDialog(input: CellDialogProps) {
  const vm = useCellDialogController(input)
  if (!vm) return null
  const { props, optionsLoading, optionsError, target, setTarget, query, setQuery, searchOpen, setSearchOpen, pricingKey, setPricingKey, pricingOpen, setPricingOpen, serviceQuantity, setServiceQuantity, members, membersLoaded, excluded, setExcluded, memberCards, membersOpen, setMembersOpen, instancesOpen, setInstancesOpen, cardDraftId, setCardDraftId, trialConfig, trialOn, setTrialOn, trialDuration, setTrialDuration, halfPosition, note, setNote, startTime, endTime, coachIds, setCoachIds, recordsOpen, setRecordsOpen, recordsScope, setRecordsScope, recordsLoading, saving, leaving, setLeaving, deleting, setDeleting, restoring, setRestoring, dialogCampusId, cell, campusChoices, dialogCampusName, selected, choices, instances, sameCourse, occupied, onLeave, batching, existing, pricing, showPricing, duration, room, trialSwitchDisabled, keyword, visibleOptions, coachChoices, canLeave, openWarning, scheduleUnchanged, lessonSlotStart, lessonSecondStart, showLessonHalf, firstHalfAvailable, secondHalfAvailable, trialHourBase, trialHourSecond, trialHourSecondAvailable, durationHint, recordRows, shownMembers, shownInstances, cardMember, shiftStart, shiftDuration, chooseHalf, chooseTrialHour, chooseLessonHalf, changeDialogCampus, choose, confirmOccupy, save, openRecords, openStudentRecords, toggleStudent, openCardPicker, closeCardPicker, confirmCardPicker } = vm

  return (
    <Modal className="sheet-modal" open centered onCancel={props.onClose} footer={null} destroyOnHidden width={620} closable={false}>
      <header className="sheet-head">
        <div className="sheet-head-title">
          <span className="sheet-head-icon"><AppIcon name="icon-timetable" size={18} /></span>
          <div>
            <strong>{batching ? '批量排课' : `周${DAY_LABELS[cell.day - 1]} · ${startTime}-${endTime}`}</strong>
            {batching ? <em>已选 {props.batchCount} 个时间段</em> : <em>{dialogCampusName || props.campusName}</em>}
          </div>
        </div>
        <div className="sheet-head-actions">
          {existing && selected?.targetType === 'student' ? <button type="button" onClick={() => openStudentRecords()}>上课记录</button> : null}
          <button type="button" className="sheet-x" onClick={props.onClose}>×</button>
        </div>
      </header>

      {cell.echo ? (
        <div className="sheet-echo">
          <span className="sheet-echo-label">固定课表原内容</span>
          <div className="sheet-echo-main">
            <b>{cell.echo.name}</b>
            <i className={cell.echo.status === 'delete' ? 'is-delete' : ''}>{cell.echo.status === 'delete' ? '本次已删除' : '本次已请假'}</i>
          </div>
          {cell.echo.time ? <small>{cell.echo.time}</small> : null}
          <button type="button" disabled={restoring} onClick={() => {
            const leaveEcho = cell.echo?.status === 'leave'
            const run = () => {
              setRestoring(true)
              props.onRestore().catch((error) => message.error(tell(error, '恢复失败'))).finally(() => setRestoring(false))
            }
            if (!leaveEcho) {
              run()
              return
            }
            Modal.confirm({
              title: '销假',
              content: '确认恢复这个请假时间段吗？',
              okText: '销假',
              cancelText: '取消',
              onOk: run,
            })
          }}>{restoring ? '恢复中...' : '恢复'}</button>
        </div>
      ) : null}

      {occupied ? (
        <div className="sheet-occupied">
          {cell.echo ? null : (
            <>
              <b>当前为占用时间段</b>
              <p>该时间段没有可展示的原始排课内容。</p>
            </>
          )}
          <div className="sheet-actions is-two">
            <button type="button" className="is-red" disabled={deleting} onClick={async () => {
              setDeleting(true)
              try { await props.onDelete() } catch (error) { message.error(tell(error, '删除失败')) } finally { setDeleting(false) }
            }}>{deleting ? '删除中...' : '删除'}</button>
            <button type="button" onClick={props.onClose}>取消</button>
          </div>
        </div>
      ) : (
        <>
          {recordsOpen ? (
            <label className="sheet-field">
              <span>校区</span>
              <strong>{dialogCampusName}</strong>
            </label>
          ) : (
            <div className="sheet-form">
              {batching && campusChoices.length <= 1 ? null : (
                <label className="sheet-field">
                  <span>校区</span>
                  <Select
                    value={dialogCampusId || undefined}
                    style={{ width: '100%' }}
                    placeholder="请选择校区"
                    options={campusChoices.map((item) => ({ value: item.id, label: item.name }))}
                    onChange={(value) => changeDialogCampus(Number(value))}
                  />
                </label>
              )}
              {props.allowTrial && !batching ? (
                <label className="sheet-switch">
                  <span>体验课{trialOn ? ` · ${trialDuration === 'half' ? '半小时' : '一个小时'}` : ''}</span>
                  <Switch checked={trialOn} disabled={trialSwitchDisabled && !trialOn} onChange={(checked) => {
                    if (checked && trialSwitchDisabled) return
                    setTrialOn(checked)
                    setSearchOpen(true)
                    if (!checked) return
                    setTarget('')
                    setQuery('')
                  }} />
                </label>
              ) : null}
              <div className="sheet-field is-search">
                <span>{trialOn ? '体验类型' : selected?.targetType === 'course' || (!selected && cell.schedule?.targetType === 'course') ? '课程' : '学员'}</span>
                <div>
                  <input
                    value={query}
                    placeholder={trialOn ? '选择体验类型' : '搜索学员姓名或非一对一课程简称'}
                    onFocus={() => setSearchOpen(true)}
                    onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); if (target) setTarget('') }}
                  />
                  {query || target ? <button type="button" onClick={() => { setQuery(''); setTarget(''); setSearchOpen(true) }}>×</button> : null}
                  {searchOpen ? (
                    <div className="sheet-menu">
                      {optionsLoading ? <p>候选项加载中...</p> : optionsError ? <p>{optionsError}</p> : !visibleOptions.length ? <p>{trialOn ? '当前校区尚未设置体验类型，请前往校区设置的「体验类型」中添加' : keyword ? '没有找到匹配学员或课程，请换个关键词试试' : '暂无学员或课程，请换老师或校区'}</p> : visibleOptions.map((item) => {
                        const blocked = !!courseTargetWarning(item) || !!studentScheduleBlock(item)
                        const icon = genderIconName(item.gender)
                        const hoursLabel = scheduleHoursLabel(item)
                        return (
                          <button type="button" key={`${item.targetType}:${item.targetId}`} className={target === `${item.targetType}:${item.targetId}` ? 'is-on' : ''} disabled={blocked} onClick={() => choose(item)}>
                            {item.targetType === 'course' ? (
                              <>
                                <b>{item.displayName || item.name}</b>
                                <em>课程</em>
                                <em>{item.studentCount || 0}学员</em>
                              </>
                            ) : (
                              <>
                                <span className="sheet-tags">
                                  {icon ? <AppIcon name={icon} size={14} /> : null}
                                  <em>{trialOn ? '体验' : '学员'}</em>
                                  {hoursLabel ? <em>课时 {hoursLabel}</em> : null}
                                  {(item.cardTypeLabels || []).map((label) => <em key={label}>{label}</em>)}
                                  {studentHoursExpired(item) ? <em className="is-expired">过期</em> : null}
                                </span>
                                <b>{item.displayName || item.name}</b>
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              {showPricing && !trialOn ? (
                <div className="sheet-field">
                  <span>消费类型</span>
                  <button type="button" className="sheet-picker" onClick={() => setPricingOpen((value) => !value)}>{pricing?.label || '请选择卡类型及课程或服务'}</button>
                  {pricing?.service ? (
                    <span className="sheet-stepper">
                      <button type="button" disabled={serviceQuantity <= 1} onClick={() => setServiceQuantity(Math.max(1, serviceQuantity - 1))}>−</button>
                      <b>{serviceQuantity}</b>
                      <button type="button" onClick={() => setServiceQuantity(serviceQuantity + 1)}>+</button>
                    </span>
                  ) : null}
                  {pricingOpen ? (
                    <div className="sheet-menu">
                      {choices.map((item) => (
                        <button type="button" key={item.key} disabled={item.disabled} className={item.key === pricingKey ? 'is-on' : ''} onClick={() => { setPricingKey(item.key); setPricingOpen(false) }}>{item.label}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {trialOn && !batching ? (
                <div className="sheet-trial">
                  <span>体验时间</span>
                  <div className="sheet-trial-options">
                    {trialConfig.half ? <button type="button" className={trialDuration === 'half' ? 'is-on' : ''} onClick={() => { setTrialDuration('half'); chooseHalf(halfPosition) }}>半小时</button> : null}
                    {trialConfig.hour ? <button type="button" className={trialDuration === 'hour' ? 'is-on' : ''} disabled={room < 60 && !trialHourSecondAvailable} onClick={() => chooseTrialHour(halfPosition === 'second' && trialHourSecondAvailable ? 'second' : 'first')}>一个小时</button> : null}
                  </div>
                  {trialDuration === 'hour' ? (
                    <div className="sheet-trial-times">
                      <span>开始时间</span>
                      <button type="button" className={halfPosition !== 'second' ? 'is-on' : ''} onClick={() => chooseTrialHour('first')}>{trialHourBase}–{fromMinutes(toMinutes(trialHourBase) + 60)}</button>
                      {trialHourSecondAvailable ? <button type="button" className={halfPosition === 'second' ? 'is-on' : ''} onClick={() => chooseTrialHour('second')}>{trialHourSecond}–{fromMinutes(toMinutes(trialHourSecond) + 60)}</button> : null}
                    </div>
                  ) : null}
                  {trialDuration === 'half' && toMinutes(cell.end) - toMinutes(cell.start) >= 60 ? (
                    <div className="sheet-trial-times">
                      <span>时段选择</span>
                      <button type="button" className={halfPosition === 'first' ? 'is-on' : ''} onClick={() => chooseHalf('first')}>{cell.start}–{fromMinutes(toMinutes(cell.start) + 30)}</button>
                      <button type="button" className={halfPosition === 'second' ? 'is-on' : ''} onClick={() => chooseHalf('second')}>{fromMinutes(toMinutes(cell.start) + 30)}–{fromMinutes(Math.min(toMinutes(cell.end), toMinutes(cell.start) + 60))}</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!trialOn && coachChoices.length > 1 ? (
                <div className="sheet-coaches">
                  <b>本次授课老师</b>
                  <div>
                    {coachChoices.map((coach) => (
                      <button type="button" key={coach.id} className={coachIds.includes(coach.id) ? 'is-on' : ''} onClick={() => {
                        if (coachIds.includes(coach.id) && coachIds.length <= 1) {
                          message.warning('至少保留一位授课老师')
                          return
                        }
                        setCoachIds(coachIds.includes(coach.id) ? coachIds.filter((id) => id !== coach.id) : [...coachIds, coach.id])
                      }}>{coach.name}</button>
                    ))}
                  </div>
                  <p>发生冲突时可取消冲突老师，仅保留实际授课老师</p>
                </div>
              ) : null}

              {!trialOn && sameCourse && instances.length ? (
                <section className="sheet-people">
                  <header>
                    <b>班级学员</b>
                    <span>已选 {instances.filter((item) => Number(item.status) !== 3 && !excluded.includes(item.studentId)).length} 人</span>
                    {instances.length > 3 ? <button type="button" onClick={() => setInstancesOpen((value) => !value)}>{instancesOpen ? '收起' : '更多'}</button> : null}
                    <em>{instances.length} 人</em>
                  </header>
                  {shownInstances.map((student) => {
                    const cardLabel = scheduleInstanceCardLabel(student)
                    return (
                    <article key={student.studentId} className={excluded.includes(student.studentId) ? 'is-out' : ''}>
                      <button type="button" onClick={() => openStudentRecords(student.studentId)}>
                        {genderIconName(student.gender) ? <AppIcon name={genderIconName(student.gender)} size={14} /> : null}
                        <b className={Number(student.status) === 3 ? 'is-leave' : ''}>{student.studentName}</b>
                      </button>
                      {cardLabel ? <small>{cardLabel}</small> : student.remainingHours != null ? <small className={Number(student.remainingHours) <= 5 ? 'is-low' : undefined}>剩余 {hoursAmount(student.remainingHours)}</small> : null}
                      <span>
                        {Number(student.status) === 3 ? null : (
                          <button type="button" onClick={() => {
                            if (Number(student.status) === 3) {
                              message.warning('请先销假，再调整本次参与状态')
                              return
                            }
                            setExcluded(excluded.includes(student.studentId) ? excluded.filter((id) => id !== student.studentId) : [...excluded, student.studentId])
                          }}>{excluded.includes(student.studentId) ? '＋' : '×'}</button>
                        )}
                        <button type="button" onClick={() => toggleStudent(Number(student.status) === 3 ? 'restore' : 'leave', student.studentId, student.studentName)}>{Number(student.status) === 3 ? '销假' : '请假'}</button>
                      </span>
                    </article>
                    )
                  })}
                  {!target && cell.schedule?.targetType === 'course' ? <p className="sheet-warn">所有人全部请假了，那这个课就取消了。</p> : null}
                  {openWarning ? <p className="sheet-warn">{openWarning}</p> : null}
                </section>
              ) : null}

              {!trialOn && selected?.targetType === 'course' && !sameCourse ? (
                <section className="sheet-people">
                  <header>
                    <b>班级学员</b>
                    <span>已选 {members.filter((item) => !excluded.includes(item.studentId)).length} 人</span>
                    {members.length > 3 ? <button type="button" onClick={() => setMembersOpen((value) => !value)}>{membersOpen ? '收起' : '更多'}</button> : null}
                    <em>{membersLoaded ? `${members.length} 人` : '加载中...'}</em>
                  </header>
                  {shownMembers.map((member) => {
                    const chosen = (member.cardOptions || []).find((card) => card.id === memberCards[member.studentId]) || (member.cardOptions || []).find((card) => card.available !== false)
                    const short = !(member.cardOptions || []).some((card) => card.available !== false && Number(card.id || 0) > 0) && (member.cardOptions || []).length > 0
                    const summary = cardSummary(chosen, member)
                    return (
                    <article key={member.studentId} className={[excluded.includes(member.studentId) ? 'is-out' : '', short && !excluded.includes(member.studentId) ? 'is-short' : ''].filter(Boolean).join(' ')}>
                      <b>
                        {genderIconName(member.gender) ? <AppIcon name={genderIconName(member.gender)} size={14} /> : null}
                        {member.studentName}
                      </b>
                      <button type="button" className={summary.low ? 'is-low' : undefined} onClick={() => openCardPicker(member)}>
                        {summary.text}
                        {(member.cardOptions || []).filter((card) => card.available !== false).length > 1 ? ' ▾' : ''}
                      </button>
                      <button type="button" onClick={() => setExcluded(excluded.includes(member.studentId) ? excluded.filter((id) => id !== member.studentId) : [...excluded, member.studentId])}>{excluded.includes(member.studentId) ? '＋' : '×'}</button>
                    </article>
                    )
                  })}
                  {membersLoaded && courseMembersWarning(members, excluded) ? <p className="sheet-warn">{courseMembersWarning(members, excluded)}</p> : null}
                  {membersLoaded && !courseMembersWarning(members, excluded) && openWarning ? <p className="sheet-warn">{openWarning}</p> : null}
                </section>
              ) : null}

              {!batching && !trialOn ? (
                <div className="sheet-duration">
                  {showLessonHalf ? (
                    <div className="sheet-duration-section is-start is-time-choice">
                      <span>开始时间</span>
                      <small>可切换</small>
                      <span className="sheet-stepper">
                        <button type="button" className={toMinutes(startTime) < toMinutes(lessonSecondStart) ? 'is-on' : ''} disabled={!firstHalfAvailable} onClick={() => chooseLessonHalf('first')}>{lessonSlotStart}</button>
                        <button type="button" className={toMinutes(startTime) >= toMinutes(lessonSecondStart) ? 'is-on' : ''} disabled={!secondHalfAvailable} onClick={() => chooseLessonHalf('second')}>{lessonSecondStart}</button>
                      </span>
                    </div>
                  ) : (
                    <div className="sheet-duration-section is-start">
                      <span>开始时间</span>
                      <span className="sheet-stepper">
                        <button type="button" onClick={() => shiftStart(-1)}>−</button>
                        <b>{startTime}</b>
                        <button type="button" onClick={() => shiftStart(1)}>＋</button>
                      </span>
                    </div>
                  )}
                  <div className="sheet-duration-section is-length">
                    <span>课时时长</span>
                    {durationHint ? <small>{durationHint}</small> : null}
                    <span className="sheet-stepper">
                      <button type="button" onClick={() => shiftDuration(-1)}>−</button>
                      <b>{durationLabel(duration)}<small>{startTime}–{endTime}</small></b>
                      <button type="button" onClick={() => shiftDuration(1)}>＋</button>
                    </span>
                  </div>
                </div>
              ) : null}

              <label className="sheet-field">
                <span>备注</span>
                <input value={note} maxLength={200} placeholder="排课说明" onChange={(event) => setNote(event.target.value)} />
                {note ? <button type="button" onClick={() => setNote('')}>×</button> : null}
              </label>
            </div>
          )}

          {recordsOpen ? (
            <section className="sheet-records">
              <header>
                <b>{selected?.targetType === 'course' ? '课程' : '学员'} {query || cell.schedule?.courseName} {recordsScope === 'all' ? '所有排课' : '本周排课'}</b>
                <button type="button" onClick={() => setRecordsScope(recordsScope === 'all' ? 'week' : 'all')}>{recordsScope === 'all' ? '本周' : '所有'}</button>
                <button type="button" onClick={() => setRecordsOpen(false)}>收起</button>
              </header>
              {recordsLoading ? <p>正在加载记录...</p> : null}
              {!recordsLoading && !recordRows.length ? <p>{recordsScope === 'all' ? '暂无排课' : '本周暂无排课'}</p> : null}
              {recordRows.map((row) => {
                const current = row.id === cell.schedule?.id
                return (
                  <article key={row.id}>
                    <b className={row.uiChangeStatus === 3 ? 'is-leave' : ''}>{row.scheduleDate?.slice(5)} 周{DAY_LABELS[(row.dayOfWeek || 1) - 1]} {row.uiChangeStatus === 3 ? '请假' : ''} {current ? '当前' : ''}</b>
                    <span>{clockText(row.startTime)}-{clockText(row.endTime)}</span>
                  </article>
                )
              })}
            </section>
          ) : existing ? (
            canLeave && !cell.echo ? (
              <div className="sheet-actions">
                <button type="button" className="is-blue" disabled={leaving} onClick={props.onBeginMove}>移动</button>
                <button type="button" className="is-violet" disabled={leaving} onClick={props.onBeginCopy}>复制</button>
                <button type="button" className="is-orange" disabled={leaving} onClick={async () => {
                  setLeaving(true)
                  try { await (onLeave ? props.onRestore() : props.onLeave()) } catch (error) { message.error(tell(error, '操作失败')) } finally { setLeaving(false) }
                }}>{leaving ? (onLeave ? '销假中...' : '请假中...') : (onLeave ? '销假' : '请假')}</button>
                <button type="button" className="is-red" disabled={deleting || leaving} onClick={() => Modal.confirm({
                  title: '删除排课',
                  content: `确认删除“${query || cell.schedule?.courseName || '排课'}”吗？`,
                  okText: '删除',
                  okButtonProps: { danger: true },
                  onOk: () => props.onDelete(),
                })}>{deleting ? '删除中...' : '删除'}</button>
                <button type="button" disabled={leaving} onClick={() => openRecords()}>{recordsOpen ? '收起' : '本周排课'}</button>
                <button type="button" className="is-save" disabled={saving || leaving || scheduleUnchanged} onClick={() => save(false)}>{saving ? '保存中...' : '保存'}</button>
              </div>
            ) : (
              <>
                <div className="sheet-actions">
                  <button type="button" className="is-blue" onClick={props.onBeginMove}>移动</button>
                  <button type="button" className="is-violet" onClick={props.onBeginCopy}>复制</button>
                  <button type="button" className="is-red" onClick={() => Modal.confirm({
                    title: '删除排课',
                    content: `确认删除“${query || cell.schedule?.courseName || '排课'}”吗？`,
                    okText: '删除',
                    okButtonProps: { danger: true },
                    onOk: () => props.onDelete(),
                  })}>删除</button>
                </div>
                <div className="sheet-actions">
                  <button type="button" onClick={() => openRecords()}>本周排课</button>
                  <button type="button" onClick={props.onClose}>取消</button>
                  <button type="button" className="is-save" disabled={saving || scheduleUnchanged} onClick={() => save(false)}>{saving ? '保存中...' : '保存'}</button>
                </div>
              </>
            )
          ) : (
            <div className={batching ? 'sheet-actions is-two' : 'sheet-actions is-three'}>
              {batching ? null : <button type="button" className="is-occupy" disabled={saving} onClick={confirmOccupy}>{saving ? '占用中...' : '占用'}</button>}
              <button type="button" onClick={props.onClose}>取消</button>
              <button type="button" className="is-save" disabled={saving} onClick={() => save(false)}>{saving ? (existing ? '保存中...' : '添加中...') : (batching ? '确认排课' : '添加')}</button>
            </div>
          )}
          {cell.schedule?.createTime ? <footer className="sheet-foot">添加时间：{cell.schedule.createTime}</footer> : null}
        </>
      )}
      {cardMember ? (
        <div className="sheet-card-mask" onClick={closeCardPicker}>
          <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
            <header><b>选择扣费卡</b><span>{cardMember.studentName}</span><button type="button" onClick={closeCardPicker}>×</button></header>
            {(cardMember.cardOptions || []).map((card) => {
              const summary = cardSummary(card, cardMember)
              return (
              <button type="button" key={card.id} disabled={card.available === false} className={cardDraftId === card.id ? 'is-on' : ''} onClick={() => card.available !== false && card.id && setCardDraftId(card.id)}>
                <b className={summary.low ? 'is-low' : undefined}>{summary.text}</b>
                {card.available === false && card.unavailableReason ? <small>{card.unavailableReason}</small> : null}
              </button>
              )
            })}
            <footer>
              <button type="button" onClick={closeCardPicker}>取消</button>
              <button type="button" onClick={confirmCardPicker}>使用此卡</button>
            </footer>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
