import { CalendarOutlined, ShareAltOutlined } from '@ant-design/icons'
import { Button, Empty, Skeleton, Tag } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { parentApi } from '../api/parent'
import { copyShareLink, memberKey } from './ParentLayout'
import type { ParentBoard, ParentChild, ParentLesson } from './parent-model'

export function ParentMemberTabs(props: { members: ParentChild[]; value?: string; onChange: (member: ParentChild) => void }) {
  return (
    <div className="parent-member-tabs" role="tablist" aria-label="选择成员">
      {props.members.map((member) => (
        <button type="button" role="tab" aria-selected={props.value === memberKey(member)} className={props.value === memberKey(member) ? 'active' : ''} key={memberKey(member)} onClick={() => props.onChange(member)}>
          {member.name}
        </button>
      ))}
    </div>
  )
}

export function useMemberSelection(members: ParentChild[]) {
  const [selectedKey, setSelectedKey] = useState('')
  useEffect(() => {
    if (!members.length) return setSelectedKey('')
    if (!members.some((item) => memberKey(item) === selectedKey)) setSelectedKey(memberKey(members[0]))
  }, [members, selectedKey])
  const selected = members.find((item) => memberKey(item) === selectedKey) || members[0]
  return { selected, selectedKey, select: (member: ParentChild) => setSelectedKey(memberKey(member)) }
}

function weekStart(date = dayjs()) {
  const day = date.day() || 7
  return date.subtract(day - 1, 'day').format('YYYY-MM-DD')
}

export function useParentBoard(member?: ParentChild, initialWeek?: string) {
  const [start, setStart] = useState(initialWeek || weekStart())
  const [board, setBoard] = useState<ParentBoard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reload() {
    if (!member) return Promise.resolve()
    setLoading(true)
    setError('')
    const params = member.source === 'PRIVATE' ? { childId: member.childId, weekStart: start } : { studentId: member.studentId, weekStart: start }
    return parentApi.board(params).then(setBoard).catch((reason) => {
      setBoard(null)
      setError(reason instanceof Error ? reason.message : '课表加载失败')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { void reload() }, [memberKey(member || { source: '', childId: 0 }), start])
  return { start, setStart, board, loading, error, reload }
}

function lessonDate(lesson: ParentLesson, start: string) {
  if (lesson.scheduleDate) return lesson.scheduleDate
  const weekday = Math.min(7, Math.max(1, Number(lesson.dayOfWeek || 1)))
  return dayjs(start).add(weekday - 1, 'day').format('YYYY-MM-DD')
}

export function ParentWeekBoard(props: {
  board: ParentBoard | null
  start: string
  loading?: boolean
  error?: string
  compact?: boolean
  readOnly?: boolean
  onLessonClick?: (lesson: ParentLesson) => void
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => dayjs(props.start).add(index, 'day')), [props.start])
  const lessons = useMemo(() => [...(props.board?.institutionLessons || []), ...(props.board?.privateLessons || [])], [props.board])
  const grouped = useMemo(() => new Map(days.map((date) => [date.format('YYYY-MM-DD'), lessons.filter((lesson) => lessonDate(lesson, props.start) === date.format('YYYY-MM-DD')).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))])), [days, lessons, props.start])
  if (props.loading) return <div className="parent-board-loading"><Skeleton active paragraph={{ rows: props.compact ? 3 : 7 }} /></div>
  if (props.error) return <div className="parent-empty"><Empty description={props.error} /></div>
  if (!props.board?.configured) return <div className="parent-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这名成员还没有配置课表" /></div>
  return (
    <div className={props.compact ? 'parent-week compact' : 'parent-week'}>
      {days.map((date) => {
        const items = grouped.get(date.format('YYYY-MM-DD')) || []
        return (
          <section className={date.isSame(dayjs(), 'day') ? 'parent-day today' : 'parent-day'} key={date.format('YYYY-MM-DD')}>
            <header><span>{['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.day()]}</span><strong>{date.format('M/D')}</strong></header>
            <div className="parent-day-lessons">
              {items.map((lesson, index) => (
                <button type="button" className={`parent-lesson ${lesson.compareStatus || ''}`} key={`${lesson.slotId || lesson.courseId}-${index}`} onClick={() => props.onLessonClick?.(lesson)} disabled={!props.onLessonClick}>
                  <span>{String(lesson.startTime || '').slice(0, 5)}–{String(lesson.endTime || '').slice(0, 5)}</span>
                  <strong>{lesson.courseName || '日程安排'}</strong>
                  <small>{[lesson.campusName, lesson.coachName].filter(Boolean).join(' · ') || lesson.remark || (lesson.source === 'INSTITUTION' ? '机构课程' : '自建课程')}</small>
                  {lesson.checkedIn ? <Tag color="success">已到课</Tag> : null}
                </button>
              ))}
              {!items.length ? <span className="parent-day-empty">暂无安排</span> : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function BoardToolbar(props: { start: string; setStart: (value: string) => void; member?: ParentChild; shareKind?: 'board' | 'stats' }) {
  async function share() {
    if (!props.member) return
    const result = await parentApi.share(props.member)
    const kind = props.shareKind === 'stats' ? 'course-stats' : 'timetable'
    copyShareLink(`/parent/share/${kind}/${result.shareCode}`)
  }
  return (
    <div className="parent-board-toolbar">
      <div>
        <Button onClick={() => props.setStart(dayjs(props.start).subtract(7, 'day').format('YYYY-MM-DD'))}>上一周</Button>
        <Button onClick={() => props.setStart(weekStart())} icon={<CalendarOutlined />}>本周</Button>
        <Button onClick={() => props.setStart(dayjs(props.start).add(7, 'day').format('YYYY-MM-DD'))}>下一周</Button>
      </div>
      <span>{dayjs(props.start).format('YYYY年M月D日')} – {dayjs(props.start).add(6, 'day').format('M月D日')}</span>
      {props.member ? <Button icon={<ShareAltOutlined />} onClick={() => void share()}>分享</Button> : <span />}
    </div>
  )
}
